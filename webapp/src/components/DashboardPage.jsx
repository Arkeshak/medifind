import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLiveStock } from '../useLiveStock';

const statusOf = (row) =>
  row.quantity === 0 ? 'OUT_OF_STOCK' : row.quantity <= row.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK';

const LIVE_LABEL = { live: '● Live', connecting: '○ Connecting…', reconnecting: '○ Reconnecting…', off: '○ Live updates off' };
const SOURCE_LABEL = { MANUAL: 'Staff', WEBHOOK: 'Supplier', CSV_IMPORT: 'CSV import' };

export default function DashboardPage() {
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [stock, setStock] = useState([]);
  const [edits, setEdits] = useState({});
  const [message, setMessage] = useState(null);
  const [feed, setFeed] = useState([]);
  const stockRef = useRef(stock);
  stockRef.current = stock;

  useEffect(() => {
    api.pharmacies().then(setPharmacies).catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);

  const loadStock = async (id) => {
    setPharmacyId(id);
    setEdits({});
    setFeed([]);
    if (!id) return setStock([]);
    try {
      setStock(await api.stock(id));
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // ---- Live updates ----
  const liveStatus = useLiveStock(pharmacyId, (evt) => {
    setFeed((f) => [evt, ...f].slice(0, 10));
    const known = stockRef.current.some((r) => r.medicine_id === evt.medicineId);
    if (!known) {
      loadStock(String(evt.pharmacyId)); // a new medicine was added (e.g. CSV import)
      return;
    }
    setStock((rows) =>
      rows.map((r) =>
        r.medicine_id === evt.medicineId
          ? { ...r, quantity: evt.quantity, low_stock_threshold: evt.threshold ?? r.low_stock_threshold, flashAt: Date.now() }
          : r
      )
    );
  });

  const run = async (action, successText) => {
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'success', text: successText });
      // No reload needed: the live update will refresh the row
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const adjust = (row, changeQty) =>
    run(
      () => api.adjust({ pharmacyId: row.pharmacy_id, medicineId: row.medicine_id, changeQty, note: 'Dashboard update' }),
      `${row.medicine}: ${changeQty > 0 ? '+' : ''}${changeQty}`
    );

  const saveQty = (row) => {
    const quantity = parseInt(edits[row.medicine_id], 10);
    if (Number.isNaN(quantity) || quantity < 0) {
      return setMessage({ type: 'error', text: 'Enter a valid quantity (0 or more).' });
    }
    run(
      () => api.setStock({ pharmacyId: row.pharmacy_id, medicineId: row.medicine_id, quantity }),
      `${row.medicine} set to ${quantity}`
    );
  };

  return (
    <section>
      <div className="dash-head">
        <h1>Pharmacy Dashboard</h1>
        {pharmacyId && <span className={`live ${liveStatus}`}>{LIVE_LABEL[liveStatus]}</span>}
      </div>

      <label className="muted">Select pharmacy: </label>
      <select value={pharmacyId} onChange={(e) => loadStock(e.target.value)}>
        <option value="">-- choose --</option>
        {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.city})</option>)}
      </select>

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      {stock.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Medicine</th><th>Qty</th><th>Threshold</th><th>Status</th><th>Quick adjust</th><th>Set qty</th></tr>
            </thead>
            <tbody>
              {stock.map((row) => {
                const status = statusOf(row);
                return (
                  <tr key={`${row.medicine_id}-${row.flashAt || 0}`} className={row.flashAt ? 'flash' : ''}>
                    <td>{row.medicine} <span className="muted">{row.strength}</span></td>
                    <td>{row.quantity}</td>
                    <td>{row.low_stock_threshold}</td>
                    <td><span className={`badge ${status}`}>{status.replaceAll('_', ' ')}</span></td>
                    <td className="actions">
                      <button className="secondary" onClick={() => adjust(row, -1)} disabled={row.quantity === 0}>-1</button>
                      <button className="secondary" onClick={() => adjust(row, 1)}>+1</button>
                      <button className="secondary" onClick={() => adjust(row, 10)}>+10</button>
                    </td>
                    <td className="actions">
                      <input
                        type="number" min="0" className="qty"
                        value={edits[row.medicine_id] ?? ''}
                        onChange={(e) => setEdits({ ...edits, [row.medicine_id]: e.target.value })}
                      />
                      <button onClick={() => saveQty(row)}>Save</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pharmacyId && (
        <div className="feed">
          <h3>Live activity</h3>
          {feed.length === 0 && <p className="muted">Waiting for stock changes…</p>}
          {feed.map((e) => (
            <div className="feed-item" key={e.eventId}>
              <span className={`source ${e.source}`}>{SOURCE_LABEL[e.source] || e.source}</span>
              <span>
                <strong>{e.medicine}</strong> {e.change > 0 ? `+${e.change}` : e.change} → {e.quantity}
                {e.note && <span className="muted"> · {e.note}</span>}
              </span>
              <span className="muted small">{new Date(e.at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
