/**
 * Token nest-api: canje apikey → access/refresh y renovación automática.
 * Compatible HTTP (127.0.0.1) y HTTPS (cierrelmds /api-docs-nest-api).
 */
const axios = require('axios');

const cache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
};

let refreshPromise = null;

function getBaseUrl() {
  return (
    process.env.NEST_API_URL ||
    process.env.SYSIP_API_URL ||
    'http://127.0.0.1:3002'
  ).replace(/\/$/, '');
}

function getBootstrapApiKey() {
  return (
    process.env.NEST_API_KEY ||
    process.env.SYSIP_API_KEY ||
    process.env.LAMUNDIAL_APIKEY ||
    process.env.LAMUNDIAL_EMISSION_APIKEY ||
    process.env.PERSONAS_API_KEY ||
    process.env.LAMUNDIAL_PERSON_APIKEY ||
    ''
  ).trim();
}

function useNestToken() {
  return process.env.NEST_AUTH_USE_TOKEN !== 'false' && Boolean(getBootstrapApiKey());
}

function accessTtlMs() {
  return (parseInt(process.env.NEST_ACCESS_TTL_SEC, 10) || 900) * 1000;
}

function updateCache(tokens) {
  cache.accessToken = tokens.access_token;
  cache.refreshToken = tokens.refresh_token;
  cache.expiresAt = Date.now() + (Number(tokens.expires_in) || 900) * 1000;
}

function applyRefreshedHeader(response) {
  const renewed = response?.headers?.['x-nest-access-refreshed'];
  if (renewed) {
    cache.accessToken = renewed;
    cache.expiresAt = Date.now() + accessTtlMs();
  }
}

async function requestTokens(refreshToken) {
  const base = getBaseUrl();
  const url = refreshToken
    ? `${base}/api/v1/auth/refresh`
    : `${base}/api/v1/auth/token`;
  const body = refreshToken
    ? { refresh_token: refreshToken }
    : { grant_type: 'api_key', apikey: getBootstrapApiKey() };

  const response = await axios.post(url, body, {
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 30_000,
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300 && response.data?.access_token) {
    return response.data;
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} obteniendo token nest-api`,
  );
  err.code = 'NEST_API_AUTH_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

async function getAccessToken() {
  if (!useNestToken()) return null;

  const now = Date.now();
  if (cache.accessToken && cache.expiresAt > now + 60_000) {
    return cache.accessToken;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      if (cache.refreshToken) {
        try {
          const tokens = await requestTokens(cache.refreshToken);
          updateCache(tokens);
          return cache.accessToken;
        } catch {
          cache.refreshToken = null;
        }
      }
      const tokens = await requestTokens(null);
      updateCache(tokens);
      return cache.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Headers hacia nest-api: Bearer (preferido) o apikey legacy. */
async function buildAuthHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };

  if (useNestToken()) {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      return headers;
    }
  }

  const apikey = getBootstrapApiKey();
  if (apikey) headers.apikey = apikey;
  return headers;
}

function trackResponse(response) {
  applyRefreshedHeader(response);
  return response;
}

module.exports = {
  getBaseUrl,
  getBootstrapApiKey,
  useNestToken,
  getAccessToken,
  buildAuthHeaders,
  trackResponse,
};
