/**
 * Cliente HTTP hacia nest-api (puente Exelixi → Sis2000).
 * Cotización, emisión, INMA y valrep sin depender de APIs externas La Mundial.
 */
const axios = require('axios');

/** @returns {string} Base URL de nest-api (:3002 en srv001). */
function getBaseUrl() {
  return (
    process.env.NEST_API_URL ||
    process.env.SYSIP_API_URL ||
    'http://127.0.0.1:3002'
  ).replace(/\/$/, '');
}

function getTimeout() {
  return parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000;
}

function getApiKey() {
  return (
    process.env.NEST_API_KEY ||
    process.env.SYSIP_API_KEY ||
    process.env.LAMUNDIAL_APIKEY ||
    process.env.LAMUNDIAL_EMISSION_APIKEY ||
    ''
  ).trim();
}

/** Headers HTTP hacia nest-api; apikey solo si está configurada (QA interno no lo exige). */
function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const apikey = getApiKey();
  if (apikey) headers.apikey = apikey;
  return headers;
}

/**
 * Cotiza vía POST /api/v1/valrep/cotizacion (spCalculoAuto en Sis2000).
 * @param {object} payload - { cmarca, cmodelo, cversion, fano, cplan, ccategoria_uso, iplaca?, ntoneladas?, cramo? }
 */
async function getCotizacionViaNestApi(payload) {
  const url = `${getBaseUrl()}/api/v1/valrep/cotizacion`;
  const response = await axios.post(url, payload, {
    timeout: getTimeout(),
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    const data = response.data?.data ?? response.data?.result ?? response.data;
    const mprimaext = Number(data?.mprimaext ?? 0);
    const mprima = Number(data?.mprima ?? 0);
    const ptasa = Number(data?.ptasa ?? 0);
    if (!mprimaext) {
      const err = new Error('Cotización nest-api retornó prima cero.');
      err.code = 'NEST_API_QUOTE_ZERO';
      throw err;
    }
    return { mprima, mprimaext, ptasa };
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} cotizando en nest-api`,
  );
  err.code = 'NEST_API_QUOTE_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

/**
 * Emite vía POST /api/v1/external/createEmissionAuto (SP sp_pre_emision_Automovil_RCV2).
 * @param {object} payload - payload de emisión (policyMapper)
 */
async function createEmissionAutoViaNestApi(payload) {
  const url = `${getBaseUrl()}/api/v1/external/createEmissionAuto`;
  const ts = new Date().toISOString();
  console.log(`[nest-api][${ts}] -> createEmissionAuto placa=${payload.placa ?? payload.xplaca}`);

  const response = await axios.post(url, payload, {
    headers: buildHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
  });

  console.log(`[nest-api][${new Date().toISOString()}] <- createEmissionAuto HTTP ${response.status}`);

  const body = response.data ?? {};
  const ok = response.status >= 200 && response.status < 300;
  const result = body.result ?? body;

  if (ok && (result.cnpoliza || result.cnrecibo)) {
    return {
      cnpoliza: String(result.cnpoliza ?? ''),
      cnrecibo: String(result.cnrecibo ?? ''),
      urlpoliza: result.urlpoliza || '',
      ncuota: result.ncuota || 1,
      message: result.message,
      fanopol: result.fanopol,
      fmespol: result.fmespol,
      _raw: body,
    };
  }

  const err = new Error(
    body.message || result.message || result.error || `HTTP ${response.status} emitiendo en nest-api`,
  );
  err.code = 'NEST_API_EMISSION_ERROR';
  err.httpStatus = response.status;
  err.raw = body;
  throw err;
}

// ── INMA (catálogo vehículo) ─────────────────────────────────────────────────

/** @returns {Promise<{ min: number, max: number }>} */
async function getInmaAnios() {
  const { data } = await axios.get(`${getBaseUrl()}/api/v1/inma/anios`, { timeout: getTimeout() });
  return data?.data ?? { min: 2000, max: new Date().getFullYear() + 1 };
}

/** @returns {Promise<Array<{ cmarca: string, xmarca: string }>>} */
async function getInmaMarcas(fano) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/marcas`,
    { fano },
    { timeout: getTimeout() },
  );
  return data?.data?.marcas ?? [];
}

/** @returns {Promise<Array<{ cmodelo: string, cmarca: string, xmodelo: string }>>} */
async function getInmaModelos(fano, cmarca) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/modelo`,
    { fano, cmarca: String(cmarca).trim() },
    { timeout: getTimeout() },
  );
  return data?.data?.info ?? [];
}

/** @returns {Promise<Array<{ cversion: string, xversion?: string, ctipo?: number }>>} */
async function getInmaVersiones(fano, cmarca, cmodelo) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/version`,
    { fano, cmarca: String(cmarca).trim(), cmodelo: String(cmodelo).trim() },
    { timeout: getTimeout() },
  );
  return data?.data?.info ?? [];
}

/** @returns {Promise<Array<{ ccategoria_uso: number, xcategoria_uso: string }>>} */
async function getCategoriasUso(fano, cmarca, cmodelo, cversion) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/categorias-uso`,
    {
      fano,
      cmarca: String(cmarca).trim(),
      cmodelo: String(cmodelo).trim(),
      cversion: String(cversion).trim(),
    },
    { timeout: getTimeout() },
  );
  return data?.data?.categorias_uso ?? [];
}

// ── Valrep (estados, ciudades, listas, frecuencias) ─────────────────────────

/** @returns {Promise<Array<{ code: number|string, label: string }>>} */
async function getValrepStates() {
  const { data } = await axios.get(`${getBaseUrl()}/api/v1/valrep/states`, { timeout: getTimeout() });
  const states = data?.data?.states ?? [];
  return states.map((s) => ({ code: s.cestado, label: String(s.xdescripcion_l ?? '').trim() }));
}

/** @param {number|null|undefined} cestado */
async function getValrepCities(cestado) {
  const url = cestado != null
    ? `${getBaseUrl()}/api/v1/valrep/cities?cestado=${parseInt(String(cestado), 10)}`
    : `${getBaseUrl()}/api/v1/valrep/cities`;
  const { data } = await axios.get(url, { timeout: getTimeout() });
  const cities = data?.data?.cities ?? [];
  return cities.map((c) => ({ code: c.cciudad, label: String(c.xdescripcion_l ?? '').trim() }));
}

/** @returns {Promise<Array<{ code: string, label: string }>>} */
async function getValrepList(domain) {
  const response = await axios.post(
    `${getBaseUrl()}/api/v1/valrep/getLists`,
    { cdominio: domain, xtipo_orden: 'ASC' },
    { timeout: getTimeout(), validateStatus: () => true },
  );
  if (response.status >= 400 || response.data?.status === false) {
    throw new Error(response.data?.message || `HTTP ${response.status} getLists/${domain}`);
  }
  const raw = response.data?.data?.listas ?? [];
  return raw
    .map((i) => ({
      code: String(i.cvalor ?? ''),
      label: String(i.xdescripcion ?? ''),
    }))
    .filter((it) => it.code !== '' && it.label !== '');
}

/** @returns {Promise<Array<{ code: string, label: string }>>} */
async function getValrepFrecuencias(cplan, cramo) {
  const body = { cplan };
  if (cramo != null) body.cramo = cramo;
  const response = await axios.post(
    `${getBaseUrl()}/api/v1/valrep/frecuencia`,
    body,
    { timeout: getTimeout(), validateStatus: () => true },
  );
  if (response.status >= 400 || !response.data?.status) {
    throw new Error(response.data?.message || `HTTP ${response.status} consultando frecuencias`);
  }
  const payload = response.data.data || response.data;
  let rawItems = payload.frecuencias || payload.plan || payload.items || [];
  if (!rawItems.length) {
    rawItems = [
      { cvalor: 'A', xdescripcion: 'Anual' },
      { cvalor: 'S', xdescripcion: 'Semestral' },
      { cvalor: 'T', xdescripcion: 'Trimestral' },
      { cvalor: 'M', xdescripcion: 'Mensual' },
    ];
  }
  return rawItems.map((f) => ({
    code: f.cvalor || f.ifrecuencia || f.code,
    label: f.xdescripcion || f.xfrecuencia || f.label || String(f.cvalor || f.ifrecuencia),
  }));
}

module.exports = {
  getCotizacionViaNestApi,
  createEmissionAutoViaNestApi,
  getBaseUrl,
  getApiKey,
  buildHeaders,
  getTimeout,
  getInmaAnios,
  getInmaMarcas,
  getInmaModelos,
  getInmaVersiones,
  getCategoriasUso,
  getValrepStates,
  getValrepCities,
  getValrepList,
  getValrepFrecuencias,
};
