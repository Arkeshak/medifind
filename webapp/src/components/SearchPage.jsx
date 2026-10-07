import { useState } from 'react';
import { api } from '../api';

const STATUS_LABEL = { IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' };

export default function SearchPage() {
  const [medicine, setMedicine] = useState('');
  const [city, setCity] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          </div>
        ))}
      </div>
    </section>
  );
}
