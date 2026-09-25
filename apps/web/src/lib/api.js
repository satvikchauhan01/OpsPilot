export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `request failed (${res.status})`, data?.details);
  return data;
}

function query(params) {
  const defined = Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null);
  return defined.length > 0 ? `?${new URLSearchParams(defined)}` : '';
}

export const api = {
  me: () => request('/auth/me'),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  services: () => request('/services'),
  topology: () => request('/topology'),
  changes: (minutes, kinds) => request(`/changes${query({ minutes, kinds: kinds?.join(',') })}`),

  incidents: (filters = {}) => request(`/incidents${query(filters)}`),
  incident: (number) => request(`/incidents/${number}`),
  timeline: (number) => request(`/incidents/${number}/timeline`),
  incidentTopology: (number) => request(`/incidents/${number}/topology`),
  incidentMetrics: (number) => request(`/incidents/${number}/metrics`),
  setIncidentStatus: (number, status, note) =>
    request(`/incidents/${number}/status`, { method: 'POST', body: { status, note: note || undefined } }),

  aiStatus: () => request('/ai'),
  investigation: (number, id = 'latest') => request(`/incidents/${number}/investigations/${id}`),
  startInvestigation: (number) => request(`/incidents/${number}/investigations`, { method: 'POST' }),
};
