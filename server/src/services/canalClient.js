/**
 * Visibilidad de canal — GET /api/v1/canal/visibility (nest-api).
 * Reglas de planes, tipo de emisión y métodos de pago configurados en SysIP.
 */
const axios = require('axios');
const { getBaseUrl, buildAuthHeaders } = require('./nestTokenService');

const TIMEOUT = parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 30_000;

function parseCcanalalt(meta = {}) {
  const raw = meta.ccanalalt_in ?? meta.ccanalalt ?? null;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseCscanalalt(meta = {}) {
  const raw = meta.cscanalalt_in ?? meta.cscanalalt ?? null;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} meta Nexus metadata (ccanalalt_in)
 * @param {{ cproducto?: string, cramo?: number }} [opts]
 * @returns {Promise<object|null>}
 */
async function fetchCanalVisibility(meta = {}, opts = {}) {
  const ccanalalt = parseCcanalalt(meta);
  if (!ccanalalt) return null;

  const params = new URLSearchParams({ ccanalalt: String(ccanalalt) });
  const cproducto = opts.cproducto != null ? String(opts.cproducto).trim() : '';
  if (cproducto) params.set('cproducto', cproducto);

  const cramo = opts.cramo != null ? parseInt(String(opts.cramo), 10) : null;
  if (cramo != null && !Number.isNaN(cramo)) params.set('cramo', String(cramo));

  const cscanalalt = parseCscanalalt(meta);
  if (cscanalalt != null) params.set('cscanalalt', String(cscanalalt));

  const base = getBaseUrl();
  const headers = await buildAuthHeaders();

  const response = await axios.get(
    `${base}/api/v1/canal/visibility?${params.toString()}`,
    { headers, timeout: TIMEOUT, validateStatus: () => true },
  );

  if (response.status >= 400) {
    console.warn(
      `[canal/visibility] nest-api status=${response.status} ccanalalt=${ccanalalt}`,
    );
    return null;
  }

  return response.data?.data ?? null;
}

/**
 * Filtra planes del productor según ui.planesPermitidos del canal.
 * @param {Array<{ cplan: string }>} planes
 * @param {object|null} canalVisibility
 */
function filterPlanesByVisibility(planes, canalVisibility) {
  const allowed = canalVisibility?.ui?.planesPermitidos;
  if (!Array.isArray(allowed) || !allowed.length) return planes;
  const set = new Set(allowed.map((c) => String(c).trim()));
  return planes.filter((p) => set.has(String(p.cplan ?? '').trim()));
}

module.exports = {
  fetchCanalVisibility,
  filterPlanesByVisibility,
  parseCcanalalt,
};
