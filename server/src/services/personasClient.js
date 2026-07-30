/**
 * Cliente HTTP del producto Funerario (personas) — apunta a NUESTRO backend
 * NestJS (nest-api), módulo `personas`.
 *
 * Endpoints (QA por defecto, prefijo /api/v1/personas):
 *   - POST /api/v1/personas/planes      → planes vigentes de personas (ramo 9)
 *   - POST /api/v1/personas/cotizacion  → cotización (spCalculoPer)
 *   - POST /api/v1/personas/validacion    → validación (speeValidatePersonGeneral)
 *   - POST /api/v1/personas/emision     → emisión (vista eePoliza_Personas_General)
 *
 * Antes esto llamaba al API corporativo de La Mundial; ahora la lógica de los
 * stored procedures (spBuscaPlan / spCalculoPer / emisión persona) vive en
 * nest-api, parametrizada y con DTOs. Ver backend-api-sys/nest-api/src/modules/personas.
 *
 * Envelope de nest-api:
 *   planes      → { status:true, data:{ planes:[...] } }
 *   cotizacion  → { status:true, data:{ mprimaext, mprima, ptasa } }
 *   emision     → { status:true, result:{ cnpoliza, cnrecibo, urlpoliza, ... } }
 */
const axios = require('axios');
const { buildAuthHeaders, trackResponse } = require('./nestTokenService');

const DEFAULT_BASE = 'http://127.0.0.1:3002';
const PATH_PREFIX = '/api/v1/personas';
const DEFAULT_TIMEOUT = 30_000;

let _client = null;
let _clientCfg = null;

function getConfig() {
  return {
    baseUrl:
      process.env.PERSONAS_API_URL ||
      process.env.NEST_API_URL ||
      process.env.NESTAPI_BASE_URL ||
      process.env.SYSIP_API_URL ||
      DEFAULT_BASE,
    // apikey solo se usa en la emisión (canal maclient_api).
    apiKey: process.env.PERSONAS_API_KEY || process.env.LAMUNDIAL_PERSON_APIKEY || '',
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT,
    cramo: parseInt(process.env.LAMUNDIAL_RAMO_PERSON, 10) || 9,
  };
}

function getClient() {
  const cfg = getConfig();
  if (_client && _clientCfg &&
      _clientCfg.baseUrl === cfg.baseUrl &&
      _clientCfg.timeout === cfg.timeout) {
    return _client;
  }
  _client = axios.create({
    baseURL: `${cfg.baseUrl.replace(/\/$/, '')}${PATH_PREFIX}`,
    timeout: cfg.timeout,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  _clientCfg = cfg;
  return _client;
}

function extractErrorMessage(data) {
  if (!data) return 'Sin respuesta';
  if (typeof data === 'string') {
    const s = data.trim();
    if (s.startsWith('<')) return 'nest-api devolvió HTML (ruta no encontrada o proxy)';
    return s.slice(0, 300);
  }
  if (data.message) return Array.isArray(data.message) ? data.message.join('; ') : String(data.message);
  if (data.result?.error) return String(data.result.error);
  try {
    const snippet = JSON.stringify(data).slice(0, 400);
    if (snippet && snippet !== '{}') return `Respuesta nest-api: ${snippet}`;
  } catch (_) { /* ignore */ }
  return 'Error desconocido (personas)';
}

function buildError(httpStatus, data, endpoint) {
  const message = extractErrorMessage(data);
  let code = 'PERSONAS_ERROR';
  const lower = message.toLowerCase();
  if (httpStatus === 401 || httpStatus === 403) code = 'PERSONAS_UNAUTHORIZED';
  else if (lower.includes('poliza vigente') || lower.includes('póliza vigente') || lower.includes('mismo asegurado')) code = 'PERSONAS_DUPLICATE';
  else if (httpStatus >= 500) code = 'PERSONAS_SERVER_ERROR';
  const err = new Error(message);
  err.code = code;
  err.httpStatus = httpStatus;
  err.endpoint = endpoint;
  err.raw = data;
  return err;
}

async function post(endpoint, body, extraHeaders) {
  const client = getClient();
  const ts = new Date().toISOString();
  console.log(`[Personas][${ts}] -> ${endpoint} ${JSON.stringify(body).slice(0, 1500)}`);
  const t0 = Date.now();
  let response;
  const authHeaders = await buildAuthHeaders(extraHeaders);
  try {
    response = trackResponse(await client.post(endpoint, body, { headers: authHeaders }));
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando ${endpoint}: ${netErr.message}`);
    err.code = 'PERSONAS_NETWORK';
    err.endpoint = endpoint;
    throw err;
  }
  const elapsed = Date.now() - t0;
  const ok = response.data?.status === true;
  console.log(`[Personas][${ts}] <- ${endpoint} ${response.status} ${ok ? 'ok' : 'FAIL'} in ${elapsed}ms`);
  if (!ok) console.warn(`[Personas] body: ${JSON.stringify(response.data).slice(0, 800)}`);
  return response;
}

/** Lista de planes vigentes de personas para el ramo dado (9 = funerario). */
async function getPlanesPer(cramo) {
  const ramo = cramo || getConfig().cramo;
  const endpoint = '/planes';
  const response = await post(endpoint, { cramo: ramo });
  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const planes = response.data.data?.planes ?? [];
    return { planes, raw: response.data };
  }
  throw buildError(response.status, response.data, endpoint);
}

/**
 * Cotiza una póliza de personas.
 * @param {{ cramo:number, cplan:string, asegurados:Array, ifrecuencia:string }} input
 * @returns {{ mprima:number, mprimaext:number, ptasa:number, raw:object }}
 */
async function getCotizacionPer({ cramo, cplan, asegurados, ifrecuencia }) {
  const endpoint = '/cotizacion';
  const body = {
    cramo: cramo || getConfig().cramo,
    cplan,
    asegurados,
    ifrecuencia: ifrecuencia || 'M',
  };
  const response = await post(endpoint, body);
  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const d = response.data.data ?? {};
    return {
      mprima: Number(d.mprima ?? 0),
      mprimaext: Number(d.mprimaext ?? 0),
      ptasa: Number(d.ptasa ?? 0),
      raw: response.data,
    };
  }
  throw buildError(response.status, response.data, endpoint);
}

/**
 * Valida titular/plan antes de emitir (speeValidatePersonGeneral).
 * @returns {{ ok: true, result: object, raw: object }}
 */
async function validateEmissionPerson(payload) {
  const endpoint = '/validacion';
  const response = await post(endpoint, payload);
  if (response.status >= 200 && response.status < 300) {
    const result = response.data?.result ?? {};
    if (response.data?.status === true && result.status !== false) {
      return { ok: true, result, raw: response.data };
    }
    throw buildError(400, response.data, endpoint);
  }
  throw buildError(response.status, response.data, endpoint);
}

/**
 * Emite una póliza de personas. Recibe el payload completo (ver
 * CreateEmissionPersonDto en nest-api). Requiere apikey del canal.
 * @returns {{ cnpoliza:string, cnrecibo:string, urlpoliza:string, raw:object }}
 */
async function createEmissionPerson(payload) {
  const endpoint = '/emision';
  const response = await post(endpoint, payload);
  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const r = response.data.result ?? {};
    if (!r.cnpoliza || !r.cnrecibo) {
      throw buildError(response.status, { message: 'Respuesta de emisión inválida: cnpoliza/cnrecibo faltan' }, endpoint);
    }
    return {
      cnpoliza: r.cnpoliza,
      cnrecibo: r.cnrecibo,
      urlpoliza: r.urlpoliza,
      ncuota: r.ncuota,
      message: r.message,
      raw: response.data,
    };
  }
  throw buildError(response.status, response.data, endpoint);
}

module.exports = {
  getPlanesPer,
  getCotizacionPer,
  validateEmissionPerson,
  createEmissionPerson,
  _internal: { getClient, getConfig, extractErrorMessage },
};
