import { useState } from 'react';
import { api, getDrugInfo } from '../api';

const STATUS_LABEL = { IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' };

function DrugInfo({ genericName, cache, setCache }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const info = cache[genericName];

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && info === undefined) {
      setLoading(true);
      setError('');
      try {
        const result = await getDrugInfo(genericName);
        setCache((c) => ({ ...c, [genericName]: result }));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="drug-info">
      <button className="link" onClick={toggle}>{open ? 'Hide drug info ▲' : 'Show drug info ▼'}</button>
      {open && (
        <div className="drug-box">
          {loading && <p className="muted">Loading from FDA…</p>}
          {error && <p className="alert error">{error}</p>}
          {!loading && !error && info === null && <p className="muted">No FDA label found for {genericName}.</p>}
          {info && (
            <>
              {info.purpose && <p><strong>Uses:</strong> {info.purpose}</p>}
              {info.warnings && <p><strong>Warnings:</strong> {info.warnings}</p>}
              {info.dosage && <p><strong>Dosage:</strong> {info.dosage}</p>}
              <p className="muted small">Source: U.S. FDA drug label. Always follow your doctor's or pharmacist's advice.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [medicine, setMedicine] = useState('');
  const [city, setCity] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drugCache, setDrugCache] = useState({});

  const onSearch = async (e) => {
    e.preventDefault();
    if (!medicine.trim()) return;
    setLoading(true);
    setError('');
    try {
      setResults(await api.search(medicine.trim(), city.trim()));
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>Find a medicine near you</h1>
      <p className="muted">Search by brand or generic name to see which pharmacies have it in stock.</p>

      <form className="search" onSubmit={onSearch}>
        <input placeholder="Medicine (e.g. Panadol)" value={medicine} onChange={(e) => setMedicine(e.target.value)} />
        <input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {error && <div className="alert error">{error}</div>}
      {results && results.length === 0 && <p className="muted">No pharmacies found for that medicine.</p>}

      <div className="grid">
        {results?.map((r) => (
          <div className="card" key={`${r.pharmacy_id}-${r.medicine_id}`}>
            <div className="card-top">
              <h3>{r.medicine} <span className="muted">{r.strength} {r.form}</span></h3>
              <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
            </div>
            <p className="muted">Generic: {r.generic_name}{r.requires_prescription && ' · Prescription required'}</p>
            <p><strong>{r.pharmacy}</strong><br />{r.address}, {r.city}</p>
            <p>
              Qty: {r.quantity}{r.price != null && ` · Rs. ${r.price}`}
              {r.phone && <> · <a href={`tel:${r.phone}`}>{r.phone}</a></>}
            </p>
            <DrugInfo genericName={r.generic_name} cache={drugCache} setCache={setDrugCache} />
          </div>
        ))}
      </div>
    </section>
  );
}
