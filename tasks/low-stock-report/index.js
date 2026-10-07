require('dotenv').config();
const { Pool } = require('pg');

const env = process.env;
const findEnv = (suffix) =>
  Object.keys(env).find((k) => k.startsWith('CHOREO_') && k.toUpperCase().endsWith(suffix));

// Connection details: injected by Choreo, or NOTIFY_URL for local testing
const NOTIFY_URL = env.NOTIFY_URL || env[findEnv('SERVICEURL')];
const CHOREO_API_KEY = env[findEnv('CHOREOAPIKEY')];
const CONSUMER_KEY = env[findEnv('CONSUMERKEY')];
const CONSUMER_SECRET = env[findEnv('CONSUMERSECRET')];
const TOKEN_URL = env[findEnv('TOKENURL')];

const ALERT_EMAIL_OVERRIDE = env.ALERT_EMAIL_OVERRIDE; // demo: send all alerts to one inbox

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });

async function getAuthHeaders() {
  if (CHOREO_API_KEY) return { 'Choreo-API-Key': CHOREO_API_KEY };
  if (CONSUMER_KEY && CONSUMER_SECRET && TOKEN_URL) {
    const basic = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    return { Authorization: `Bearer ${(await res.json()).access_token}` };
  }
  return {}; // local testing, no auth
}

async function main() {
  console.log(`[low-stock-report] Started at ${new Date().toISOString()}`);
  if (!NOTIFY_URL) throw new Error('Notification service URL not found (no connection or NOTIFY_URL)');

  const { rows } = await pool.query(`
    SELECT p.id AS pharmacy_id, p.name AS pharmacy, p.email,
           m.name AS medicine, s.quantity, s.low_stock_threshold AS threshold
    FROM stock s
    JOIN pharmacies p ON p.id = s.pharmacy_id
    JOIN medicines m ON m.id = s.medicine_id
    WHERE s.quantity <= s.low_stock_threshold
    ORDER BY p.id, s.quantity ASC`);

  if (rows.length === 0) {
    console.log('[low-stock-report] All stock levels are healthy. Nothing to send.');
    return;
  }

  // Group items by pharmacy
  const byPharmacy = new Map();
  for (const r of rows) {
    if (!byPharmacy.has(r.pharmacy_id)) {
      byPharmacy.set(r.pharmacy_id, { pharmacy: r.pharmacy, email: r.email, items: [] });
    }
    byPharmacy.get(r.pharmacy_id).items.push({ medicine: r.medicine, quantity: r.quantity, threshold: r.threshold });
  }

  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
  let sent = 0;
  let failed = 0;

  for (const [pharmacyId, group] of byPharmacy) {
    const toEmail = ALERT_EMAIL_OVERRIDE || group.email;
    const type = group.items.some((i) => i.quantity === 0) ? 'OUT_OF_STOCK' : 'LOW_STOCK';
    const message = group.items.map((i) => `${i.medicine}: ${i.quantity} (threshold ${i.threshold})`).join('; ');

    const { rows: [notification] } = await pool.query(
      `INSERT INTO notifications (pharmacy_id, type, message) VALUES ($1, $2, $3) RETURNING id`,
      [pharmacyId, type, message]
    );

    if (!toEmail) {
      console.warn(`[low-stock-report] ${group.pharmacy} has no email. Logged only.`);
      continue;
    }

    try {
      const res = await fetch(`${NOTIFY_URL.replace(/\/$/, '')}/notify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ toEmail, pharmacyName: group.pharmacy, items: group.items }),
      });
      if (!res.ok) throw new Error(`Notification service returned ${res.status}`);
      await pool.query('UPDATE notifications SET sent = TRUE WHERE id = $1', [notification.id]);
      sent++;
      console.log(`[low-stock-report] Sent alert for ${group.pharmacy} (${group.items.length} items)`);
    } catch (err) {
      failed++;
      console.error(`[low-stock-report] Failed for ${group.pharmacy}: ${err.message}`);
    }
  }

  console.log(`[low-stock-report] Done. Sent: ${sent}, Failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[low-stock-report] Fatal error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
