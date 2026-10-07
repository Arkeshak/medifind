require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { createSchema, createYoga } = require('graphql-yoga');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const typeDefs = fs.readFileSync(path.join(__dirname, '..', 'schema.graphql'), 'utf8');

// ---------- Row mappers ----------
const toPharmacy = (r) => ({ id: r.id, name: r.name, address: r.address, city: r.city, phone: r.phone });
const toMedicine = (r) => ({
  id: r.id, name: r.name, genericName: r.generic_name, strength: r.strength,
  form: r.form, requiresPrescription: r.requires_prescription,
});
const statusOf = (qty, threshold) => (qty === 0 ? 'OUT_OF_STOCK' : qty <= threshold ? 'LOW_STOCK' : 'IN_STOCK');

// One query shape that returns everything an Availability needs
const AVAILABILITY_SQL = `
  SELECT s.quantity, s.price, s.low_stock_threshold, s.updated_at,
         p.id AS p_id, p.name AS p_name, p.address AS p_address, p.city AS p_city, p.phone AS p_phone,
         m.id AS m_id, m.name AS m_name, m.generic_name AS m_generic_name, m.strength AS m_strength,
         m.form AS m_form, m.requires_prescription AS m_requires_prescription
  FROM stock s
  JOIN pharmacies p ON p.id = s.pharmacy_id
  JOIN medicines m ON m.id = s.medicine_id`;

const toAvailability = (r) => ({
  quantity: r.quantity,
  price: r.price === null ? null : Number(r.price),
  status: statusOf(r.quantity, r.low_stock_threshold),
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  pharmacy: { id: r.p_id, name: r.p_name, address: r.p_address, city: r.p_city, phone: r.p_phone },
  medicine: {
    id: r.m_id, name: r.m_name, genericName: r.m_generic_name, strength: r.m_strength,
    form: r.m_form, requiresPrescription: r.m_requires_prescription,
  },
});

// ---------- Resolvers ----------
const resolvers = {
  Query: {
    searchMedicines: async (_, { name, city, inStockOnly }) => {
      const { rows } = await pool.query(
        `${AVAILABILITY_SQL}
         WHERE (LOWER(m.name) LIKE LOWER($1) OR LOWER(m.generic_name) LIKE LOWER($1))
           AND ($2::text IS NULL OR LOWER(p.city) = LOWER($2))
           AND ($3::boolean IS NOT TRUE OR s.quantity > 0)
         ORDER BY (s.quantity > 0) DESC, s.quantity DESC`,
        [`%${name}%`, city ?? null, inStockOnly ?? false]
      );
      return rows.map(toAvailability);
    },
    pharmacies: async (_, { city }) => {
      const { rows } = await pool.query(
        `SELECT * FROM pharmacies WHERE ($1::text IS NULL OR LOWER(city) = LOWER($1)) ORDER BY name`,
        [city ?? null]
      );
      return rows.map(toPharmacy);
    },
    pharmacy: async (_, { id }) => {
      const { rows } = await pool.query('SELECT * FROM pharmacies WHERE id = $1', [id]);
      return rows[0] ? toPharmacy(rows[0]) : null;
    },
    medicines: async () => {
      const { rows } = await pool.query('SELECT * FROM medicines ORDER BY name');
      return rows.map(toMedicine);
    },
  },
  Pharmacy: {
    stock: async (pharmacy) => {
      const { rows } = await pool.query(`${AVAILABILITY_SQL} WHERE p.id = $1 ORDER BY m.name`, [pharmacy.id]);
      return rows.map(toAvailability);
    },
  },
  Medicine: {
    availableAt: async (medicine, { city }) => {
      const { rows } = await pool.query(
        `${AVAILABILITY_SQL}
         WHERE m.id = $1 AND ($2::text IS NULL OR LOWER(p.city) = LOWER($2))
         ORDER BY s.quantity DESC`,
        [medicine.id, city ?? null]
      );
      return rows.map(toAvailability);
    },
  },
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: '/graphql',
  graphiql: process.env.NODE_ENV !== 'production', // playground for local testing
  maskedErrors: true, // never leak DB errors to clients
});

createServer(yoga).listen(PORT, () => {
  console.log(`GraphQL Search Service running at http://localhost:${PORT}/graphql`);
});
