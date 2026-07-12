/**
 * Cliente HTTP hacia sysip-nest-api (puente Exelixi → Sis2000).
 * Cotización y emisión RCV sin depender de qaapisys2000 La Mundial.
 */
const axios = require('axios');

function getBaseUrl() {
  return (process.env.SYSIP_API_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
}

function getApiKey() {
  return (
    process.env.SYSIP_API_KEY ||
    process.env.LAMUNDIAL_APIKEY ||
    process.env.LAMUNDIAL_EMISSION_APIKEY ||
    ''
  ).trim();
}

/**
 * Cotiza vía POST /api/v1/valrep/cotizacion (spCalculoAuto en Sis2000).
 * @param {object} payload - { cmarca, cmodelo, cversion, fano, cplan, ccategoria_uso, iplaca?, ntoneladas?, cramo? }
 */
async function getCotizacionViaSysip(payload) {
  const url = `${getBaseUrl()}/api/v1/valrep/cotizacion`;
  const response = await axios.post(url, payload, {
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000,
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    const data = response.data?.data ?? response.data?.result ?? response.data;
    const mprimaext = Number(data?.mprimaext ?? 0);
    const mprima = Number(data?.mprima ?? 0);
    const ptasa = Number(data?.ptasa ?? 0);
    if (!mprimaext) {
      const err = new Error('Cotización sysip-nest-api retornó prima cero.');
      err.code = 'SYSIP_QUOTE_ZERO';
      throw err;
    }
    return { mprima, mprimaext, ptasa };
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} cotizando en sysip-nest-api`,
  );
  err.code = 'SYSIP_QUOTE_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

/**
 * Emite vía POST /api/v1/external/createEmissionAuto (INSERT eePoliza_Automovil_RCV2).
 * @param {object} payload - payload de emisión (policyMapper)
 */
async function createEmissionAutoViaSysip(payload) {
  const apikey = getApiKey();
  if (!apikey) {
    const err = new Error('SYSIP_API_KEY (o LAMUNDIAL_APIKEY) no configurada en .env');
    err.code = 'SYSIP_APIKEY_MISSING';
    throw err;
  }

  const url = `${getBaseUrl()}/api/v1/external/createEmissionAuto`;
  const ts = new Date().toISOString();
  console.log(`[sysip][${ts}] -> createEmissionAuto placa=${payload.placa ?? payload.xplaca}`);

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', apikey },
    timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000,
    validateStatus: () => true,
  });

  console.log(`[sysip][${new Date().toISOString()}] <- createEmissionAuto HTTP ${response.status}`);

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
    body.message || result.message || result.error || `HTTP ${response.status} emitiendo en sysip-nest-api`,
  );
  err.code = 'SYSIP_EMISSION_ERROR';
  err.httpStatus = response.status;
  err.raw = body;
  throw err;
}

module.exports = { getCotizacionViaSysip, createEmissionAutoViaSysip, getBaseUrl, getApiKey };
