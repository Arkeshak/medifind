// Local dev -> Vite proxy to localhost:8080. On Choreo -> /choreo-apis/... from the Connection.
const BASE = import.meta.env.DEV ? '/local-api' : (window.configs?.apiUrl || '');

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Please log in to do this.');
  if (res.status === 403) throw new Error('Your account does not have permission to do this.');
  if (res.status === 429) throw new Error('Too many requests. Please wait a moment.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  search: (medicine, city) =>
    request(`/search?medicine=${encodeURIComponent(medicine)}${city ? `&city=${encodeURIComponent(city)}` : ''}`),
  pharmacies: () => request('/pharmacies'),
  stock: (pharmacyId) => request(`/pharmacies/${pharmacyId}/stock`),
  adjust: (body) => request('/stock/adjust', { method: 'POST', body: JSON.stringify(body) }),
  setStock: (body) => request('/stock', { method: 'PUT', body: JSON.stringify(body) }),
};

// ---------- openFDA (through the Choreo API Proxy) ----------
const FDA_BASE = import.meta.env.DEV ? '/local-fda' : (window.configs?.openFdaUrl || '');

const firstText = (field) => (Array.isArray(field) ? field[0] : field) || null;
const shorten = (text, max = 350) => (text && text.length > max ? `${text.slice(0, max)}…` : text);

export async function getDrugInfo(genericName) {
  const search = encodeURIComponent(`openfda.generic_name:"${genericName}"`);
  const res = await fetch(`${FDA_BASE}/drug/label.json?search=${search}&limit=1`);
  if (res.status === 404) return null; // openFDA returns 404 when there are no matches
  if (res.status === 429) throw new Error('Drug info is busy right now. Try again in a minute.');
  if (!res.ok) throw new Error(`Could not load drug info (${res.status})`);
  const label = (await res.json()).results?.[0];
  if (!label) return null;
  return {
    purpose: shorten(firstText(label.purpose) || firstText(label.indications_and_usage)),
    warnings: shorten(firstText(label.warnings) || firstText(label.boxed_warning)),
    dosage: shorten(firstText(label.dosage_and_administration)),
  };
}
