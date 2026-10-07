require('dotenv').config();
const fs = require('node:fs/promises');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

const { DATABASE_URL, CSV_URL } = process.env;
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
const REQUIRED = ['pharmacy_id', 'medicine_name', 'generic_name', 'strength', 'form', 'quantity'];

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const log = (msg) => console.log(`[csv-import] ${msg}`);

async function loadCsv(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Could not download CSV (${res.status})`);
    return res.text();
  }
  return fs.readFile(source, 'utf8'); // local file path for testing
}

function validate(row, pharmacyIds) {
  const errors = [];
  for (const field of REQUIRED) {
    if (!row[field] || !String(row[field]).trim()) errors.push(`missing ${field}`);
  }
  const pharmacyId = Number(row.pharmacy_id);
  if (!Number.isInteger(pharmacyId) || !pharmacyIds.has(pharmacyId)) errors.push(`unknown pharmacy_id "${row.pharmacy_id}"`);

  const quantity = Number(row.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) errors.push('quantity must be a whole number >= 0');

  if (row.low_stock_threshold) {
    const t = Number(row.low_stock_threshold);
    if (!Number.isInteger(t) || t < 0) errors.push('low_stock_threshold must be a whole number >= 0');
  }
  if (row.price) {
    const p = Number(row.price);
    if (Number.isNaN(p) || p < 0) errors.push('price must be a number >= 0');
  }
  return errors;
}

async function main() {
  if (!CSV_URL) throw new Error('CSV_URL is not set');
  log(`Started ${DRY_RUN ? '(DRY RUN, no changes will be saved)' : ''}`);
  log(`Source: ${CSV_URL}`);

  const records = parse(await loadCsv(CSV_URL), { columns: true, skip_empty_lines: true, trim: true });
  log(`Read ${records.length} data row(s)`);

  const { rows: pharmacyRows } = await pool.query('SELECT id FROM pharmacies');
  const pharmacyIds = new Set(pharmacyRows.map((r) => r.id));

  const valid = [];
  let invalidCount = 0;
  records.forEach((row, i) => {
    const line = i + 2; // +1 for header, +1 for 1-based numbering
    const errors = validate(row, pharmacyIds);
    if (errors.length) {
      invalidCount++;
      console.warn(`[csv-import] Line ${line} skipped: ${errors.join('; ')}`);
    } else {
      valid.push({ line, row });
    }
  });

  if (DRY_RUN) {
    log(`Dry run complete. ${valid.length} row(s) would be imported, ${invalidCount} skipped.`);
    return;
  }

  const summary = { created: 0, updated: 0, unchanged: 0, newMedicines: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { row } of valid) {
      const pharmacyId = Number(row.pharmacy_id);
      const quantity = Number(row.quantity);
      const threshold = row.low_stock_threshold ? Number(row.low_stock_threshold) : null;
      const price = row.price ? Number(row.price) : null;
      const requiresRx = ['true', 'yes', '1'].includes(String(row.requires_prescription).toLowerCase());

      // Create the medicine if it doesn't exist yet
      const med = await client.query(
        `INSERT INTO medicines (name, generic_name, strength, form, requires_prescription)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name, strength, form) DO UPDATE SET generic_name = EXCLUDED.generic_name
         RETURNING id, (xmax = 0) AS inserted`,
        [row.medicine_name, row.generic_name, row.strength, row.form, requiresRx]
      );
      const medicineId = med.rows[0].id;
      if (med.rows[0].inserted) summary.newMedicines++;

      const before = await client.query(
        'SELECT quantity FROM stock WHERE pharmacy_id = $1 AND medicine_id = $2',
        [pharmacyId, medicineId]
      );
      const previousQty = before.rows[0]?.quantity;

      await client.query(
        `INSERT INTO stock (pharmacy_id, medicine_id, quantity, low_stock_threshold, price)
         VALUES ($1, $2, $3, COALESCE($4, 10), $5)
         ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           low_stock_threshold = COALESCE($4, stock.low_stock_threshold),
           price = COALESCE($5, stock.price),
           updated_at = NOW()`,
        [pharmacyId, medicineId, quantity, threshold, price]
      );

      const diff = quantity - (previousQty ?? 0);
      if (previousQty === undefined) summary.created++;
      else if (diff === 0) summary.unchanged++;
      else summary.updated++;

      if (diff !== 0) {
        await client.query(
          `INSERT INTO stock_events (pharmacy_id, medicine_id, change_qty, source, note)
           VALUES ($1, $2, $3, 'CSV_IMPORT', 'Bulk import')`,
          [pharmacyId, medicineId, diff]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  log(`Done. Stock rows created: ${summary.created}, updated: ${summary.updated}, unchanged: ${summary.unchanged}, ` +
      `new medicines: ${summary.newMedicines}, skipped (invalid): ${invalidCount}`);
}

main()
  .catch((err) => {
    console.error(`[csv-import] Failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
