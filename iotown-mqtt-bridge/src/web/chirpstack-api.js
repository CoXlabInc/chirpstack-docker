const config = require('../config');

// `code` tells the web UI which message to show:
// CHIRPSTACK_API_KEY_INVALID, CHIRPSTACK_API_KEY_NOT_ADMIN, CHIRPSTACK_API_UNREACHABLE or CHIRPSTACK_API_ERROR
class ChirpStackApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const TIMEOUT_MS = 5000;

// ChirpStack REST API (chirpstack-rest-api). Needs an admin API key to list every tenant.
async function apiGet(pathAndQuery, { url = config.chirpstackApi.url, token = config.chirpstackApi.token } = {}) {
  let res;
  try {
    res = await fetch(new URL(pathAndQuery, url), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    // Connection refused, unknown host, or no answer within the timeout
    throw new ChirpStackApiError('CHIRPSTACK_API_UNREACHABLE', `ChirpStack API not reachable at ${url}: ${err.cause?.code || err.message}`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    const code =
      res.status === 401 ? 'CHIRPSTACK_API_KEY_INVALID' : res.status === 403 ? 'CHIRPSTACK_API_KEY_NOT_ADMIN' : 'CHIRPSTACK_API_ERROR';
    throw new ChirpStackApiError(code, `ChirpStack API ${res.status}: ${body}`);
  }
  return res.json();
}

// Checked before a new API address or key is saved: listing tenants needs an admin key
async function checkAccess(url, token) {
  await apiGet('/api/tenants?limit=1', { url, token });
}

async function listTenants() {
  return (await apiGet('/api/tenants?limit=1000')).result || [];
}

async function listApplications() {
  const items = [];
  for (const tenant of await listTenants()) {
    const data = await apiGet(`/api/applications?limit=1000&tenantId=${encodeURIComponent(tenant.id)}`);
    for (const app of data.result || []) {
      items.push({ id: app.id, name: app.name, tenant: tenant.name });
    }
  }
  return items;
}

async function listGateways() {
  const items = [];
  for (const tenant of await listTenants()) {
    const data = await apiGet(`/api/gateways?limit=1000&tenantId=${encodeURIComponent(tenant.id)}`);
    for (const gw of data.result || []) {
      items.push({ id: String(gw.gatewayId).toLowerCase(), name: gw.name, tenant: tenant.name });
    }
  }
  return items;
}

module.exports = { ChirpStackApiError, checkAccess, listApplications, listGateways };
