/**
 * Cliente HTTP de La Mundial de Seguros (API externa RCV).
 *
 * Endpoints (todos POST, header `apikey`, JSON):
 *   - getCotizacionAuto   -> { mprima, mprimaext, ptasa }
 *   - createEmissionAuto  -> { cnpoliza, cnrecibo, urlpoliza, ncuota }
 *
 * Reglas duras:
 *   1. SIEMPRE usar el prefijo /CorreccionCalculo/api/v1/external (la ruta vieja
 *      sin "CorreccionCalculo" tiene SP desactualizado y no emite RCVBAS).
 *   2. El header se llama LITERALMENTE "apikey" (minusculas, sin Bearer).
 *   3. La Mundial responde 200 con `status: false` cuando hay error de negocio.
 *      NO confiar solo en el status HTTP.
 *   4. Mensajes de error vienen anidados en `result.result.error` (anidacion
 *      rara pero estable).
 */
const axios = require('axios');

const DEFAULT_BASE = 'https://qaapisys2000.lamundialdeseguros.com';
const PATH_PREFIX = '/CorreccionCalculo/api/v1/external';
const INMA_PREFIX  = '/CorreccionCalculo/api/v1/inma';
const DEFAULT_TIMEOUT = 30_000;

let _client = null;
let _clientCfg = null;
let _inmaClient = null;
let _inmaClientCfg = null;

function getConfig() {
  return {
    baseUrl: process.env.LAMUNDIAL_BASE_URL || DEFAULT_BASE,
    apiKey: process.env.LAMUNDIAL_APIKEY || '',
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT,
  };
}

function getClient() {
  const cfg = getConfig();
  // Reusa el cliente solo si la configuracion no cambio (util en tests).
  if (_client && _clientCfg &&
      _clientCfg.baseUrl === cfg.baseUrl &&
      _clientCfg.apiKey === cfg.apiKey &&
      _clientCfg.timeout === cfg.timeout) {
    return _client;
  }
  if (!cfg.apiKey) {
    const err = new Error('LAMUNDIAL_APIKEY no configurada en .env');
    err.code = 'LAMUNDIAL_APIKEY_MISSING';
    throw err;
  }
  _client = axios.create({
    baseURL: `${cfg.baseUrl.replace(/\/$/, '')}${PATH_PREFIX}`,
    timeout: cfg.timeout,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.apiKey,
    },
    // Aceptar todo y decidir nosotros que es error.
    validateStatus: () => true,
  });
  _clientCfg = cfg;
  return _client;
}

/**
 * Extrae mensaje de error desde la estructura anidada de La Mundial.
 * Formato observado:
 *   { status: false, result: { error: true, result: { error: "<msg>" } } }
 * y a veces:
 *   { status: false, result: { error: "<msg>" } }
 */
function extractErrorMessage(data) {
  if (!data) return 'Sin respuesta';
  const inner = data.result?.result?.error;
  if (typeof inner === 'string' && inner.trim()) return inner.trim();
  const mid = data.result?.error;
  if (typeof mid === 'string' && mid.trim()) return mid.trim();
  if (data.result?.message) return String(data.result.message);
  if (data.message) return String(data.message);
  return 'Error desconocido La Mundial';
}

/**
 * Construye un Error tipado a partir de la respuesta de La Mundial.
 * Detecta categorias conocidas para que el orquestador pueda mapearlas a
 * codigos HTTP/UX especificos en el frontend.
 */
function buildLaMundialError(httpStatus, data, context) {
  const message = extractErrorMessage(data);
  const lower = message.toLowerCase();

  let code = 'LAMUNDIAL_ERROR';
  if (lower.includes('column name') || lower.includes('number of supplied values')) {
    code = 'LAMUNDIAL_SP_OUTDATED';
  } else if (
    lower.includes('poliza vigente') ||
    lower.includes('póliza vigente') ||
    lower.includes('serial carroceria') ||
    lower.includes('serial carrocería')
  ) {
    // La Mundial usa el mismo mensaje para placa duplicada y serial duplicado.
    code = 'LAMUNDIAL_PLATE_ALREADY_INSURED';
  } else if (lower.includes('faltan campos') || lower.includes('campo requerido')) {
    code = 'LAMUNDIAL_MISSING_FIELDS';
  } else if (httpStatus === 401 || httpStatus === 403) {
    code = 'LAMUNDIAL_UNAUTHORIZED';
  } else if (httpStatus >= 500) {
    code = 'LAMUNDIAL_SERVER_ERROR';
  }

  const err = new Error(message);
  err.code = code;
  err.httpStatus = httpStatus;
  err.endpoint = context?.endpoint;
  err.raw = data;
  return err;
}

function logRequest(endpoint, payloadSummary) {
  const ts = new Date().toISOString();
  console.log(`[LaMundial][${ts}] -> ${endpoint} ${JSON.stringify(payloadSummary)}`);
}

function logResponse(endpoint, httpStatus, durationMs, data) {
  const ts = new Date().toISOString();
  const ok = data?.status === true;
  if (ok) {
    console.log(`[LaMundial][${ts}] <- ${endpoint} ${httpStatus} ok in ${durationMs}ms`);
  } else {
    console.warn(
      `[LaMundial][${ts}] <- ${endpoint} ${httpStatus} FAIL in ${durationMs}ms: ${extractErrorMessage(data)}`
    );
  }
}

/**
 * Cotiza un vehiculo. Devuelve { mprima, mprimaext, ptasa }.
 *
 * @param {{ cmarca:string, cmodelo:string, cversion:string, fano:number,
 *   cplan:'RCVBAS'|'RUSPAT', ccategoria_uso:number, ntoneladas:number }} input
 */
async function getCotizacionAuto(input) {
  const client = getClient();
  const endpoint = '/getCotizacionAuto';
  const summary = {
    plan: input.cplan,
    marca: input.cmarca,
    modelo: input.cmodelo,
    version: input.cversion,
    ano: input.fano,
  };
  logRequest(endpoint, summary);

  const t0 = Date.now();
  let response;
  try {
    response = await client.post(endpoint, input);
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando ${endpoint}: ${netErr.message}`);
    err.code = 'LAMUNDIAL_NETWORK';
    err.endpoint = endpoint;
    err.cause = netErr;
    throw err;
  }
  const elapsed = Date.now() - t0;
  logResponse(endpoint, response.status, elapsed, response.data);

  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const r = response.data.result || {};
    return {
      mprima: parseFloat(r.mprima),
      mprimaext: parseFloat(r.mprimaext),
      ptasa: Number(r.ptasa),
      _raw: response.data,
    };
  }
  throw buildLaMundialError(response.status, response.data, { endpoint });
}

/**
 * Emite la poliza. Devuelve { cnpoliza, cnrecibo, urlpoliza, ncuota }.
 * Recibe el payload COMPLETO ya construido por policyMapper + valores
 * economicos provenientes de getCotizacionAuto.
 */
async function createEmissionAuto(payload) {
  const client = getClient();
  const endpoint = '/createEmissionAuto';
  const summary = {
    poliza: payload.poliza,
    plan: payload.plan,
    placa: payload.placa,
    rif_tomador: payload.rif_tomador,
  };
  logRequest(endpoint, summary);

  const t0 = Date.now();
  let response;
  try {
    response = await client.post(endpoint, payload);
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando ${endpoint}: ${netErr.message}`);
    err.code = 'LAMUNDIAL_NETWORK';
    err.endpoint = endpoint;
    err.cause = netErr;
    throw err;
  }
  const elapsed = Date.now() - t0;
  logResponse(endpoint, response.status, elapsed, response.data);

  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const r = response.data.result || {};
    return {
      cnpoliza: r.cnpoliza,
      cnrecibo: r.cnrecibo,
      urlpoliza: r.urlpoliza,
      ncuota: r.ncuota,
      message: r.message,
      _raw: response.data,
    };
  }
  throw buildLaMundialError(response.status, response.data, { endpoint });
}

// ── Catálogo INMA ─────────────────────────────────────────────────────────────

function getInmaClient() {
  const cfg = getConfig();
  if (_inmaClient && _inmaClientCfg &&
      _inmaClientCfg.baseUrl === cfg.baseUrl &&
      _inmaClientCfg.apiKey === cfg.apiKey) {
    return _inmaClient;
  }
  if (!cfg.apiKey) {
    const err = new Error('LAMUNDIAL_APIKEY no configurada en .env');
    err.code = 'LAMUNDIAL_APIKEY_MISSING';
    throw err;
  }
  _inmaClient = axios.create({
    baseURL: `${cfg.baseUrl.replace(/\/$/, '')}${INMA_PREFIX}`,
    timeout: cfg.timeout,
    headers: { 'Content-Type': 'application/json', apikey: cfg.apiKey },
    validateStatus: () => true,
  });
  _inmaClientCfg = cfg;
  return _inmaClient;
}

async function inmaPost(endpoint, body) {
  const client = getInmaClient();
  logRequest(`[INMA]${endpoint}`, body);
  const t0 = Date.now();
  let response;
  try {
    response = await client.post(endpoint, body);
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando INMA ${endpoint}: ${netErr.message}`);
    err.code = 'LAMUNDIAL_NETWORK';
    throw err;
  }
  logResponse(`[INMA]${endpoint}`, response.status, Date.now() - t0, response.data);

  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    return response.data.result;
  }
  throw buildLaMundialError(response.status, response.data, { endpoint });
}

/** Rango de años disponibles en el catálogo INMA. */
async function getInmaAnios() {
  const result = await inmaPost('/year', {});
  return result[0] ?? { min: 2000, max: new Date().getFullYear() + 1 };
}

/** Lista de marcas para un año dado. */
async function getInmaMarcas(fano) {
  return inmaPost('/marca', { fano });
}

/** Lista de modelos para un año + cmarca. */
async function getInmaModelos(fano, cmarca) {
  return inmaPost('/modelo', { fano, cmarca });
}

/** Lista de versiones para un año + cmarca + cmodelo. */
async function getInmaVersiones(fano, cmarca, cmodelo) {
  return inmaPost('/version', { fano, cmarca, cmodelo });
}

/**
 * Categorías de uso aplicables a la versión seleccionada.
 * Endpoint: POST /external/getCategoriasUso
 *
 * @param {{ fano:number, cmarca:string, cmodelo:string, cversion:string }} input
 * @returns {Promise<Array<{ ccategoria_uso:number, xcategoria_uso:string }>>}
 */
async function getCategoriasUso({ fano, cmarca, cmodelo, cversion }) {
  const client = getClient();
  const endpoint = '/getCategoriasUso';
  logRequest(endpoint, { fano, cmarca, cmodelo, cversion });

  const t0 = Date.now();
  let response;
  try {
    response = await client.post(endpoint, { fano, cmarca, cmodelo, cversion });
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando ${endpoint}: ${netErr.message}`);
    err.code = 'LAMUNDIAL_NETWORK';
    err.endpoint = endpoint;
    err.cause = netErr;
    throw err;
  }
  logResponse(endpoint, response.status, Date.now() - t0, response.data);

  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const list = response.data.result?.categorias_uso ?? [];
    return Array.isArray(list) ? list : [];
  }
  throw buildLaMundialError(response.status, response.data, { endpoint });
}

module.exports = {
  getCotizacionAuto,
  createEmissionAuto,
  getInmaAnios,
  getInmaMarcas,
  getInmaModelos,
  getInmaVersiones,
  getCategoriasUso,
  // Helpers expuestos para tests / debug:
  _internal: { getClient, getConfig, extractErrorMessage, buildLaMundialError, PATH_PREFIX, INMA_PREFIX },
};
