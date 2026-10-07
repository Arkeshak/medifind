require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

// Wraps async routes so errors go to the error handler
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const VALID_SOURCES = ['MANUAL', 'WEBHOOK', 'CSV_IMPORT'];

// ---------- HEALTH ----------
app.get('/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'UP' });
}));

// ---------- PHARMACIES ----------
app.get('/pharmacies', wrap(async (req, res) => {
  const { city } = req.query;
  const { rows } = city
    ? await pool.query('SELECT * FROM pharmacies WHERE LOWER(city) = LOWER($1) ORDER BY name', [city])
    : await pool.query('SELECT * FROM pharmacies ORDER BY name');
  res.json(rows);
}));

app.get('/pharmacies/:id', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pharmacies WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Pharmacy not found' });
  res.json(rows[0]);
}));

app.post('/pharmacies', wrap(async (req, res) => {
  const { name, address, city, phone, email, latitude, longitude } = req.body;
  if (!name || !address || !city) {
    return res.status(400).json({ error: 'name, address and city are required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO pharmacies (name, address, city, phone, email, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, address, city, phone ?? null, email ?? null, latitude ?? null, longitude ?? null]
  );
  res.status(201).json(rows[0]);
}));

// ---------- MEDICINES ----------
app.get('/medicines', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM medicines ORDER BY name');
  res.json(rows);
}));

app.post('/medicines', wrap(async (req, res) => {
  const { name, genericName, strength, form, requiresPrescription } = req.body;
  if (!name || !genericName) {
    return res.status(400).json({ error: 'name and genericName are required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO medicines (name, generic_name, strength, form, requires_prescription)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, genericName, strength ?? null, form ?? null, requiresPrescription ?? false]
  );
  res.status(201).json(rows[0]);
}));

// ---------- STOCK ----------
// All stock for one pharmacy
app.get('/pharmacies/:id/stock', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, m.name AS medicine, m.generic_name, m.strength, m.form
     FROM stock s JOIN medicines m ON m.id = s.medicine_id
     WHERE s.pharmacy_id = $1 ORDER BY m.name`,
    [req.params.id]
  );
  res.json(rows);
}));

// Set the stock quantity (creates the row if missing) + log the change
app.put('/stock', wrap(async (req, res) => {
  const { pharmacyId, medicineId, quantity, lowStockThreshold, price } = req.body;
  if (!pharmacyId || !medicineId || quantity === undefined || quantity < 0) {
    return res.status(400).json({ error: 'pharmacyId, medicineId and a non-negative quantity are required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const old = await client.query(
      'SELECT quantity FROM stock WHERE pharmacy_id = $1 AND medicine_id = $2 FOR UPDATE',
      [pharmacyId, medicineId]
    );
    const previousQty = old.rows[0]?.quantity ?? 0;
    
    const { rows } = await client.query(
      `INSERT INTO stock (pharmacy_id, medicine_id, quantity, low_stock_threshold, price)
       VALUES ($1, $2, $3, COALESCE($4, 10), $5)
       ON CONFLICT (pharmacy_id, medicine_id)
       DO UPDATE SET quantity = EXCLUDED.quantity,
                     low_stock_threshold = COALESCE($4, stock.low_stock_threshold),
                     price = COALESCE($5, stock.price),
                     updated_at = NOW()
       RETURNING *`,
      [pharmacyId, medicineId, quantity, lowStockThreshold ?? null, price ?? null]
    );
    
    const diff = quantity - previousQty;
    if (diff !== 0) {
      await client.query(
        `INSERT INTO stock_events (pharmacy_id, medicine_id, change_qty, source, note)
         VALUES ($1, $2, $3, 'MANUAL', 'Quantity set via API')`,
        [pharmacyId, medicineId, diff]
      );
    }
    
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Add or remove stock (e.g. +50 delivery, -2 sale) + log the change
app.post('/stock/adjust', wrap(async (req, res) => {
  const { pharmacyId, medicineId, changeQty, source = 'MANUAL', note } = req.body;
  if (!pharmacyId || !medicineId || !Number.isInteger(changeQty) || changeQty === 0) {
    return res.status(400).json({ error: 'pharmacyId, medicineId and a non-zero integer changeQty are required' });
  }
  if (!VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `source must be one of ${VALID_SOURCES.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query(
      `UPDATE stock SET quantity = quantity + $3, updated_at = NOW()
       WHERE pharmacy_id = $1 AND medicine_id = $2 AND quantity + $3 >= 0
       RETURNING *`,
      [pharmacyId, medicineId, changeQty]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock row not found, or the change would make quantity negative' });
    }
    
    await client.query(
      `INSERT INTO stock_events (pharmacy_id, medicine_id, change_qty, source, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [pharmacyId, medicineId, changeQty, source, note ?? null]
    );
    
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Items at or below their low-stock threshold (used later by the Scheduled Task)
app.get('/stock/low', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.pharmacy_id, p.name AS pharmacy, p.email, s.medicine_id, m.name AS medicine, s.quantity, s.low_stock_threshold
     FROM stock s JOIN pharmacies p ON p.id = s.pharmacy_id JOIN medicines m ON m.id = s.medicine_id
     WHERE s.quantity <= s.low_stock_threshold ORDER BY s.quantity ASC`
  );
  res.json(rows);
}));

// ---------- PUBLIC SEARCH ----------
app.get('/search', wrap(async (req, res) => {
  const { medicine, city } = req.query;
  if (!medicine) return res.status(400).json({ error: 'medicine query parameter is required' });
  
  const { rows } = await pool.query(
    `SELECT m.id AS medicine_id, m.name AS medicine, m.generic_name, m.strength, m.form, m.requires_prescription,
            p.id AS pharmacy_id, p.name AS pharmacy, p.address, p.city, p.phone,
            s.quantity, s.price, s.updated_at,
            CASE WHEN s.quantity = 0 THEN 'OUT_OF_STOCK'
                 WHEN s.quantity <= s.low_stock_threshold THEN 'LOW_STOCK'
                 ELSE 'IN_STOCK' END AS status
     FROM stock s JOIN medicines m ON m.id = s.medicine_id JOIN pharmacies p ON p.id = s.pharmacy_id
     WHERE (LOWER(m.name) LIKE LOWER($1) OR LOWER(m.generic_name) LIKE LOWER($1))
       AND ($2::text IS NULL OR LOWER(p.city) = LOWER($2))
     ORDER BY (s.quantity > 0) DESC, s.quantity DESC`,
    [`%${medicine}%`, city ?? null]
  );
  res.json(rows);
}));

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced pharmacy or medicine does not exist' });
  if (err.code === '23505') return res.status(409).json({ error: 'Record already exists' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid input format' });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Inventory Service running on port ${PORT}`));
