/**
 * Cliente de planes RCV — POST /api/v1/valrep/planes/v2
 *
 * Destino: nest-api (NEST_API_URL, :3002 en srv001).
 *
 * Mapeo metadata SSO → payload:
 *   cproductor → cproductor + citem (productor emisor)
 *   cusuario   → cusuario
 *   cramo      → cramo (default 18)
 *   ctipo      → query ?ctipo= o metadata.ctipo
 *   centidad   → "P" (productor)
 */
const axios = require('axios');

const DEFAULT_PRODUCTOR = process.env.LAMUNDIAL_PRODUCTOR || '80080';
const DEFAULT_CUSUARIO = process.env.LAMUNDIAL_CUSUARIO || '4';
const DEFAULT_RAMO = parseInt(process.env.LAMUNDIAL_RAMO || '18', 10);
const TIMEOUT = parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 30_000;
/** Máximo de caracteres del JSON crudo de La Mundial en logs (0 = sin truncar). */
const LOG_BODY_MAX = parseInt(process.env.LAMUNDIAL_LOG_PLANES_MAX || '4000', 10);

/**
 * Serializa un objeto para log, con truncado opcional.
 * @param {unknown} value
 * @returns {string}
 */
function stringifyForLog(value) {
  if (value == null) return String(value);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!LOG_BODY_MAX || text.length <= LOG_BODY_MAX) return text;
  return `${text.slice(0, LOG_BODY_MAX)}…[+${text.length - LOG_BODY_MAX} chars]`;
}

/**
 * Resumen legible de planes normalizados para grep en pm2 logs.
 * @param {Array<{ cplan: string, xplan?: string }>} planes
 * @returns {string}
 */
function summarizePlanes(planes) {
  if (!planes?.length) return '(vacío)';
  return planes
    .map((p) => `${p.cplan}${p.xplan ? `:${p.xplan.slice(0, 40)}` : ''}`)
    .join(', ');
}

/**
 * @param {'valrep/planes/v2'|'nest-api/valrep/planes/v2'} source
 * @param {string} target URL o nombre SP
 * @param {object} payload
 */
function logPlanesRequest(source, target, payload) {
  const ts = new Date().toISOString();
  console.log(`[Planes][${ts}] -> ${source} ${target} payload=${stringifyForLog(payload)}`);
}

/**
 * @param {'valrep/planes/v2'|'nest-api/valrep/planes/v2'} source
 * @param {number} httpOrRowsStatus HTTP status o 200 para SQL
 * @param {number} elapsedMs
 * @param {Array<{ cplan: string, xplan?: string }>} planes
 * @param {unknown} [rawBody] respuesta cruda La Mundial o recordset
 */
function logPlanesResponse(source, httpOrRowsStatus, elapsedMs, planes, rawBody) {
  const ts = new Date().toISOString();
  const count = planes?.length ?? 0;
  console.log(
    `[Planes][${ts}] <- ${source} status=${httpOrRowsStatus} ok in ${elapsedMs}ms count=${count} planes=[${summarizePlanes(planes)}]`,
  );
  if (rawBody != null) {
    console.log(`[Planes][${ts}] <- ${source} raw=${stringifyForLog(rawBody)}`);
  }
}

/**
 * @param {'valrep/planes/v2'|'nest-api/valrep/planes/v2'} source
 * @param {number} httpStatus
 * @param {number} elapsedMs
 * @param {unknown} data
 */
function logPlanesError(source, httpStatus, elapsedMs, data) {
  const ts = new Date().toISOString();
  console.warn(
    `[Planes][${ts}] <- ${source} status=${httpStatus} FAIL in ${elapsedMs}ms body=${stringifyForLog(data)}`,
  );
}

/**
 * Resuelve parámetros de canal/productor desde metadata del token Nexus.
 * @param {Record<string, unknown>} [nexusMetadata]
 * @returns {{ cproductor: string, cusuario: string|number, cramo: number, ctipo?: number }}
 */
function resolvePlanesParams(nexusMetadata = {}) {
  const cproductor = String(
    nexusMetadata.cproductor ?? DEFAULT_PRODUCTOR,
  ).trim();

  const cusuarioRaw = nexusMetadata.cusuario ?? DEFAULT_CUSUARIO;
  const cusuario = /^\d+$/.test(String(cusuarioRaw))
    ? parseInt(String(cusuarioRaw), 10)
    : String(cusuarioRaw);

  const cramo = parseInt(
    nexusMetadata.cramo != null ? String(nexusMetadata.cramo) : String(DEFAULT_RAMO),
    10,
  );

  let ctipo;
  if (nexusMetadata.ctipo != null && nexusMetadata.ctipo !== '') {
    ctipo = parseInt(String(nexusMetadata.ctipo), 10);
  }

  return { cproductor, cusuario, cramo, ctipo };
}

/**
 * Arma el body para valrep/planes/v2 según contrato La Mundial QA.
 * @param {Record<string, unknown>} nexusMetadata
 * @param {number|null|undefined} ctipoQuery — ?ctipo= del GET /catalogo/planes
 */
function buildPlanesV2Body(nexusMetadata = {}, ctipoQuery) {
  const { cproductor, cusuario, cramo, ctipo: metaCtipo } = resolvePlanesParams(nexusMetadata);
  const ctipo = ctipoQuery != null && !Number.isNaN(ctipoQuery)
    ? ctipoQuery
    : metaCtipo;

  const body = {
    centidad: 'P',
    citem: cproductor,
    cproductor: parseInt(cproductor, 10),
    cusuario: String(cusuario),
    cramo,
  };

  if (ctipo != null && !Number.isNaN(ctipo)) {
    body.ctipo = ctipo;
  }

  return body;
}

/**
 * Normaliza una fila de plan al formato consumido por el frontend.
 * @param {Record<string, unknown>} p
 * @param {number} defaultRamo
 */
function normalizePlanRow(p, defaultRamo) {
  return {
    cplan: String(p.cplan ?? p.CPLAN ?? '').trim(),
    xplan: String(p.xplan ?? p.XPLAN ?? '').trim(),
    xplan_c: String(p.xplan_c ?? p.XPLAN_C ?? p.xplan ?? p.XPLAN ?? '').trim(),
    cramo: Number(p.cramo ?? p.CRAMO ?? defaultRamo),
    cmoneda: String(p.cmoneda ?? p.CMONEDA ?? 'USD').trim(),
  };
}

/**
 * Base URL del servicio de planes (nest-api por defecto).
 * @returns {string}
 */
function getValrepBaseUrl() {
  if (process.env.PLANES_API_URL?.trim()) {
    return process.env.PLANES_API_URL.trim().replace(/\/$/, '');
  }
  return (
    process.env.NEST_API_URL ||
    process.env.SYSIP_API_URL ||
    'http://127.0.0.1:3002'
  ).replace(/\/$/, '');
}

/**
 * Bearer JWT legacy (ya no se usa — planes vía nest-api interno).
 * @deprecated
 */
function getValrepBearerToken() {
  const raw = (
    process.env.LAMUNDIAL_VALREP_BEARER_TOKEN ||
    process.env.LAMUNDIAL_BEARER_TOKEN ||
    ''
  ).trim();
  if (!raw) return '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;
}

/**
 * @param {string} baseUrl
 * @returns {boolean}
 */
function isInternalPlanesApi(baseUrl) {
  try {
    const { hostname, port } = new URL(baseUrl);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (port === '3002') return true;
  } catch {
    /* ignore */
  }
  return (process.env.PLANES_API_INTERNAL || 'true').toLowerCase() !== 'false';
}

/**
 * Headers HTTP según destino (interno sin auth; externo La Mundial Bearer o apikey).
 * @param {string} baseUrl
 * @returns {Record<string, string>}
 */
function getValrepAuthHeaders(baseUrl) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Consulta planes vía API La Mundial valrep/planes/v2.
 * @param {Record<string, unknown>} nexusMetadata
 * @param {number|null|undefined} ctipoQuery
 */
async function fetchPlanesV2(nexusMetadata = {}, ctipoQuery) {
  const body = buildPlanesV2Body(nexusMetadata, ctipoQuery);
  const baseUrl = getValrepBaseUrl();
  const url = `${baseUrl}/api/v1/valrep/planes/v2`;
  const source = isInternalPlanesApi(baseUrl)
    ? 'nest-api/valrep/planes/v2'
    : 'valrep/planes/v2';
  const headers = getValrepAuthHeaders(baseUrl);

  logPlanesRequest(source, url, body);

  const t0 = Date.now();
  let data;
  let status;
  try {
    ({ data, status } = await axios.post(url, body, {
      headers,
      timeout: TIMEOUT,
      validateStatus: () => true,
    }));
  } catch (netErr) {
    const elapsed = Date.now() - t0;
    logPlanesError(source, 0, elapsed, { message: netErr.message });
    throw netErr;
  }
  const elapsed = Date.now() - t0;

  if (status >= 400 || data?.status === false) {
    logPlanesError(source, status, elapsed, data);
    const msg = data?.message || data?.mensaje || `HTTP ${status}`;
    const err = new Error(msg);
    err.code = 'PLANES_V2_HTTP';
    err.status = status;
    throw err;
  }

  const raw =
    data?.data?.plan ??
    data?.data?.planes ??
    data?.plan ??
    data?.info ??
    [];

  const list = Array.isArray(raw) ? raw : [];
  const planes = list
    .map((p) => normalizePlanRow(p, body.cramo))
    .filter((p) => p.cplan);

  logPlanesResponse(source, status, elapsed, planes, data);

  return { planes, source, request: body };
}

module.exports = {
  resolvePlanesParams,
  buildPlanesV2Body,
  normalizePlanRow,
  fetchPlanesV2,
};
