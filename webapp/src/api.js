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
