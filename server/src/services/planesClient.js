/**
 * Cliente de planes RCV — La Mundial POST /api/v1/valrep/planes/v2
 *
 * Mapeo metadata SSO → payload:
 *   cproductor → citem (productor que emite la póliza)
 *   cusuario   → cusuario
 *   cramo      → cramo (default 18)
 *   ctipo      → query ?ctipo= o metadata.ctipo
 *   centidad   → "P" (productor)
 */
const axios = require('axios');
const { getSis2000Pool, sql } = require('./sis2000Pool');

const DEFAULT_PRODUCTOR = process.env.LAMUNDIAL_PRODUCTOR || '80080';
const DEFAULT_CUSUARIO = process.env.LAMUNDIAL_CUSUARIO || '4';
const DEFAULT_RAMO = parseInt(process.env.LAMUNDIAL_RAMO || '18', 10);
const TIMEOUT = parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 30_000;

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
    cusuario,
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

function getValrepBaseUrl() {
  return (
    process.env.LAMUNDIAL_VALREP_URL ||
    process.env.LAMUNDIAL_BASE_URL ||
    'https://qaapisys2000.lamundialdeseguros.com'
  ).replace(/\/$/, '');
}

/**
 * Consulta planes vía API La Mundial valrep/planes/v2.
 * @param {Record<string, unknown>} nexusMetadata
 * @param {number|null|undefined} ctipoQuery
 */
async function fetchPlanesV2(nexusMetadata = {}, ctipoQuery) {
  const body = buildPlanesV2Body(nexusMetadata, ctipoQuery);
  const apikey = (process.env.LAMUNDIAL_APIKEY || '').trim();
  const url = `${getValrepBaseUrl()}/api/v1/valrep/planes/v2`;

  const { data, status } = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(apikey ? { apikey } : {}),
    },
    timeout: TIMEOUT,
    validateStatus: () => true,
  });

  if (status >= 400 || data?.status === false) {
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

  return { planes, source: 'valrep/planes/v2', request: body };
}

/**
 * Fallback: spBuscaPlan directo en Sis2000 (misma lógica previa, con metadata).
 * @param {Record<string, unknown>} nexusMetadata
 * @param {number|null|undefined} ctipoQuery
 */
async function fetchPlanesSis2000(nexusMetadata = {}, ctipoQuery) {
  const { cproductor, cusuario, cramo, ctipo: metaCtipo } = resolvePlanesParams(nexusMetadata);
  const ctipo = ctipoQuery != null && !Number.isNaN(ctipoQuery) ? ctipoQuery : (metaCtipo ?? null);

  const pool = await getSis2000Pool();
  const request = pool.request();

  request.input('cramo', sql.Int, cramo);
  request.input('cproductor', sql.Numeric(17), parseInt(cproductor, 10));
  request.input('ctipo', sql.Numeric(4), ctipo);
  request.input('cusuario', sql.NVarChar(60), String(cusuario));
  request.input('citem', sql.NVarChar(50), String(cproductor));
  request.input('centidad', sql.NVarChar(6), 'P');
  request.input('bnacional', sql.Bit, false);
  request.output('mensaje', sql.NVarChar(6), '');

  const result = await request.execute('spBuscaPlan');
  const planes = (result.recordset ?? [])
    .map((p) => normalizePlanRow(p, cramo))
    .filter((p) => p.cplan);

  return {
    planes,
    source: 'sis2000/spBuscaPlan',
    request: { centidad: 'P', citem: cproductor, cusuario, cramo, ctipo },
  };
}

module.exports = {
  resolvePlanesParams,
  buildPlanesV2Body,
  normalizePlanRow,
  fetchPlanesV2,
  fetchPlanesSis2000,
};
