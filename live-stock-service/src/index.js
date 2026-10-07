require('dotenv').config();
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 8080;
const POLL_MS = Number(process.env.POLL_MS) || 3000;
const HEARTBEAT_MS = 25000; // keeps connections alive through gateways/proxies

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// ---------- HTTP server (health check) ----------
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'UP', clients: wss.clients.size }));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Connect with WebSocket.' }));
});

// ---------- WebSocket server ----------
const wss = new WebSocketServer({ server });

const statusOf = (qty, threshold) =>
  qty === null ? 'UNKNOWN' : qty === 0 ? 'OUT_OF_STOCK' : qty <= threshold ? 'LOW_STOCK' : 'IN_STOCK';

const send = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
};

wss.on('connection', (ws) => {
  ws.pharmacyId = null; // null = receive events for all pharmacies
  send(ws, { type: 'welcome', message: 'Connected to MediFind live stock', pollIntervalMs: POLL_MS });
  console.log(`Client connected. Total: ${wss.clients.size}`);
  startPolling();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Messages must be JSON' });
    }

    if (msg.type === 'subscribe') {
      const id = msg.pharmacyId === null || msg.pharmacyId === undefined ? null : Number(msg.pharmacyId);
      if (id !== null && !Number.isInteger(id)) {
        return send(ws, { type: 'error', message: 'pharmacyId must be an integer or null' });
      }
      ws.pharmacyId = id;
      send(ws, { type: 'subscribed', pharmacyId: id });
    } else if (msg.type === 'ping') {
      send(ws, { type: 'pong', time: new Date().toISOString() });
    } else {
      send(ws, { type: 'error', message: 'Unknown message type. Use "subscribe" or "ping".' });
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected. Total: ${wss.clients.size}`);
    if (wss.clients.size === 0) stopPolling();
  });
  ws.on('error', (err) => console.error('WebSocket error:', err.message));
});

// ---------- Polling stock_events ----------
let lastEventId = 0;
let pollTimer = null;
let polling = false;

async function startPolling() {
  if (pollTimer) return;
  try {
    // Start from "now" so new viewers only see new changes
    const { rows } = await pool.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM stock_events');
    lastEventId = Number(rows[0].max_id);
  } catch (err) {
    console.error('Could not read starting event id:', err.message);
  }
  if (pollTimer || wss.clients.size === 0) return;
  pollTimer = setInterval(poll, POLL_MS);
  console.log(`Polling started from event #${lastEventId}`);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  console.log('No viewers. Polling stopped.');
}

async function poll() {
  if (polling) return; // never overlap queries
  polling = true;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.pharmacy_id, p.name AS pharmacy, e.medicine_id, m.name AS medicine,
              e.change_qty, e.source, e.note, e.created_at,
              s.quantity, s.low_stock_threshold
       FROM stock_events e
       JOIN pharmacies p ON p.id = e.pharmacy_id
       JOIN medicines m ON m.id = e.medicine_id
       LEFT JOIN stock s ON s.pharmacy_id = e.pharmacy_id AND s.medicine_id = e.medicine_id
       WHERE e.id > $1
       ORDER BY e.id ASC
       LIMIT 100`,
      [lastEventId]
    );

    for (const r of rows) {
      lastEventId = Number(r.id);
      const event = {
        type: 'stock_changed',
        eventId: Number(r.id),
        pharmacyId: r.pharmacy_id,
        pharmacy: r.pharmacy,
        medicineId: r.medicine_id,
        medicine: r.medicine,
        change: r.change_qty,
        quantity: r.quantity,
        threshold: r.low_stock_threshold,
        status: statusOf(r.quantity, r.low_stock_threshold),
        source: r.source,
        note: r.note,
        at: new Date(r.created_at).toISOString(),
      };
      for (const client of wss.clients) {
        if (client.pharmacyId === null || client.pharmacyId === event.pharmacyId) send(client, event);
      }
    }
    if (rows.length) console.log(`Broadcast ${rows.length} event(s) up to #${lastEventId}`);
  } catch (err) {
    console.error('Poll failed:', err.message);
  } finally {
    polling = false;
  }
}

// ---------- Heartbeat ----------
setInterval(() => {
  for (const client of wss.clients) send(client, { type: 'heartbeat', time: new Date().toISOString() });
}, HEARTBEAT_MS);

server.listen(PORT, () => console.log(`Live Stock Service listening on port ${PORT}`));
