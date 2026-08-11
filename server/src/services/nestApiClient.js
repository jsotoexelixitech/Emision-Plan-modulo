/**
 * Cliente HTTP hacia nest-api (puente Exelixi → Sis2000).
 * Cotización, emisión, INMA y valrep sin depender de APIs externas La Mundial.
 */
const axios = require('axios');
const {
  getBaseUrl,
  getBootstrapApiKey,
  buildAuthHeaders,
  trackResponse,
} = require('./nestTokenService');

function getTimeout() {
  return parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000;
}

/** @deprecated usar buildAuthHeaders() async */
function getApiKey() {
  return getBootstrapApiKey();
}

/** Headers sync legacy — preferir buildAuthHeaders(). */
function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const apikey = getBootstrapApiKey();
  if (apikey) headers.apikey = apikey;
  return headers;
}

async function axiosOpts(extra = {}) {
  return {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    ...extra,
  };
}

/**
 * Cotiza vía POST /api/v1/valrep/cotizacion (spCalculoAuto en Sis2000).
 * @param {object} payload - { cmarca, cmodelo, cversion, fano, cplan, ccategoria_uso, iplaca?, ntoneladas?, cramo? }
 */
async function getCotizacionViaNestApi(payload) {
  const url = `${getBaseUrl()}/api/v1/valrep/cotizacion`;
  const response = await axios.post(url, payload, await axiosOpts());

  if (response.status >= 200 && response.status < 300) {
    const data = response.data?.data ?? response.data?.result ?? response.data;
    const mprimaext = Number(data?.mprimaext ?? 0);
    const mprima = Number(data?.mprima ?? 0);
    const ptasa = Number(data?.ptasa ?? 0);
    const referenceSuma = Number(data?.referenceSuma ?? 0) || undefined;
    if (!mprimaext) {
      const err = new Error('Cotización nest-api retornó prima cero.');
      err.code = 'NEST_API_QUOTE_ZERO';
      throw err;
    }
    return { mprima, mprimaext, ptasa, referenceSuma };
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

  const response = trackResponse(await axios.post(url, payload, {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
  }));

  console.log(`[nest-api][${new Date().toISOString()}] <- createEmissionAuto HTTP ${response.status}`);

  const body = response.data ?? {};
  const ok = response.status >= 200 && response.status < 300;
  const result = body.result ?? body;

  if (ok && (result.cnpoliza || result.cnrecibo)) {
    return {
      cnpoliza: String(result.cnpoliza ?? ''),
      cnrecibo: String(result.cnrecibo ?? ''),
      urlpoliza: result.urlpoliza || '',
      url_club_arys: result.url_club_arys || '',
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
  err.code = mapEmissionNestApiError(err.message);
  err.httpStatus = response.status;
  err.raw = body;
  throw err;
}

function mapEmissionNestApiError(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('póliza rel ya existente') || lower.includes('poliza rel ya existente')) {
    return 'NEST_API_COUNTER_COLLISION';
  }
  if (
    lower.includes('poliza vigente') ||
    lower.includes('póliza vigente') ||
    lower.includes('serial carrocer')
  ) {
    return 'LAMUNDIAL_PLATE_ALREADY_INSURED';
  }
  return 'NEST_API_EMISSION_ERROR';
}

function mapValidatePlateError(message) {
  const lower = String(message || '').toLowerCase();
  if (
    lower.includes('exist') ||
    lower.includes('vigente') ||
    lower.includes('póliza rel') ||
    lower.includes('poliza rel') ||
    lower.includes('serial carrocer') ||
    lower.includes('placa')
  ) {
    return 'PLATE_ALREADY_INSURED';
  }
  return 'VALIDATE_EMISSION_ERROR';
}

function extractValidateAutoResponse(body, httpStatus = 200) {
  const result = body?.result ?? {};
  const failed = httpStatus >= 400 || body?.status === false || result?.status === false;
  return {
    failed,
    message: result?.message || body?.message,
    error: result?.error || body?.error,
    code: result?.code,
  };
}

function toClientValidateCode(code, fallbackMessage) {
  const resolved = code || mapValidatePlateError(fallbackMessage);
  if (
    resolved === 'PLATE_ALREADY_INSURED' ||
    resolved === 'SERIAL_ALREADY_INSURED' ||
    resolved === 'VEHICLE_ALREADY_INSURED'
  ) {
    return 'PLATE_ALREADY_INSURED';
  }
  return resolved;
}

/**
 * Valida placa/serial vía POST /api/v1/external/validateEmissionAuto (speeValidateAutomovilGeneral).
 * @param {object} params - { plan?, placa, serial_carroceria }
 */
async function validateEmissionAutoViaNestApi(params) {
  const url = `${getBaseUrl()}/api/v1/external/validateEmissionAuto`;
  const plan = params.plan || process.env.LAMUNDIAL_PLAN_DEFAULT || 'RCVBAS';
  const payload = {
    plan,
    placa: String(params.placa || '').trim(),
    serial_carroceria: String(params.serial_carroceria || '').trim(),
  };

  const response = trackResponse(await axios.post(url, payload, {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
  }));

  const body = response.data ?? {};
  const parsed = extractValidateAutoResponse(body, response.status);

  if (!parsed.failed) {
    return {
      success: true,
      message: parsed.message || 'El vehículo puede asegurarse. No hay póliza vigente con esta placa ni serial.',
    };
  }

  const errorMessage = Array.isArray(parsed.error) ? parsed.error[0] : String(parsed.error || `HTTP ${response.status}`);
  const err = new Error(errorMessage);
  err.code = toClientValidateCode(parsed.code, errorMessage);
  throw err;
}

// ── INMA (catálogo vehículo) ─────────────────────────────────────────────────

/** @returns {Promise<{ min: number, max: number }>} */
async function getInmaAnios() {
  const { data } = await axios.get(`${getBaseUrl()}/api/v1/inma/anios`, await axiosOpts());
  return data?.data ?? { min: 2000, max: new Date().getFullYear() + 1 };
}

/** @returns {Promise<Array<{ cmarca: string, xmarca: string }>>} */
async function getInmaMarcas(fano) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/marcas`,
    { fano },
    await axiosOpts(),
  );
  return data?.data?.marcas ?? [];
}

/** @returns {Promise<Array<{ cmodelo: string, cmarca: string, xmodelo: string }>>} */
async function getInmaModelos(fano, cmarca) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/modelo`,
    { fano, cmarca: String(cmarca).trim() },
    await axiosOpts(),
  );
  return data?.data?.info ?? [];
}

/** @returns {Promise<Array<{ cversion: string, xversion?: string, ctipo?: number }>>} */
async function getInmaVersiones(fano, cmarca, cmodelo) {
  const { data } = await axios.post(
    `${getBaseUrl()}/api/v1/inma/version`,
    { fano, cmarca: String(cmarca).trim(), cmodelo: String(cmodelo).trim() },
    await axiosOpts(),
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
    await axiosOpts(),
  );
  return data?.data?.categorias_uso ?? [];
}

// ── Valrep (estados, ciudades, listas, frecuencias) ─────────────────────────

/** @returns {Promise<Array<{ code: number|string, label: string }>>} */
async function getValrepStates() {
  const { data } = await axios.get(`${getBaseUrl()}/api/v1/valrep/states`, await axiosOpts());
  const states = data?.data?.states ?? [];
  return states.map((s) => ({ code: s.cestado, label: String(s.xdescripcion_l ?? '').trim() }));
}

/** @param {number|null|undefined} cestado */
async function getValrepCities(cestado) {
  const url = cestado != null
    ? `${getBaseUrl()}/api/v1/valrep/cities?cestado=${parseInt(String(cestado), 10)}`
    : `${getBaseUrl()}/api/v1/valrep/cities`;
  const { data } = await axios.get(url, await axiosOpts());
  const cities = data?.data?.cities ?? [];
  return cities.map((c) => ({ code: c.cciudad, label: String(c.xdescripcion_l ?? '').trim() }));
}

/** @returns {Promise<Array<{ code: string, label: string }>>} */
async function getValrepList(domain) {
  const response = await axios.post(
    `${getBaseUrl()}/api/v1/valrep/getLists`,
    { cdominio: domain, xtipo_orden: 'ASC' },
    await axiosOpts({ validateStatus: () => true }),
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
    await axiosOpts({ validateStatus: () => true }),
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
    ndias: f.ndias != null && !Number.isNaN(Number(f.ndias)) ? Number(f.ndias) : null,
  }));
}

/**
 * Genera anexo conductor habitual vía POST /api/v1/documents/conductor-habitual.
 * Requiere scope documents:write (Bearer o apikey).
 */
async function generateConductorHabitualViaNestApi(body) {
  const url = `${getBaseUrl()}/api/v1/documents/conductor-habitual`;
  const response = trackResponse(await axios.post(url, body, {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
  }));

  if (response.status >= 200 && response.status < 300 && response.data?.url) {
    return String(response.data.url);
  }

  const err = new Error(
    response.data?.message || response.data?.error || `HTTP ${response.status} generando anexo conductor`,
  );
  err.code = 'NEST_API_CONDUCTOR_PDF_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

/**
 * Envía documentos emitidos por correo vía POST /api/v1/mail/policy-emission.
 * Fire-and-forget desde policyService; no bloquea la respuesta al cliente.
 */
async function sendPolicyEmailViaNestApi(payload) {
  const url = `${getBaseUrl()}/api/v1/mail/policy-emission`;
  const response = trackResponse(await axios.post(url, payload, {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
  }));

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  const err = new Error(
    response.data?.error
      || response.data?.message
      || `HTTP ${response.status} enviando correo póliza`,
  );
  err.code = 'NEST_API_MAIL_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

module.exports = {
  getCotizacionViaNestApi,
  createEmissionAutoViaNestApi,
  validateEmissionAutoViaNestApi,
  generateConductorHabitualViaNestApi,
  sendPolicyEmailViaNestApi,
  getBaseUrl,
  getApiKey,
  buildHeaders,
  buildAuthHeaders,
  trackResponse,
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
