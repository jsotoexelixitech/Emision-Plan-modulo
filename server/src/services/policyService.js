/**
 * Orquestador de polizas (cotizar -> emitir).
 *
 * Es el unico punto de entrada para emitir polizas reales contra La Mundial.
 * Mantiene 2 modos:
 *   - 'live' (POLICY_MODE=live, default): llama API real.
 *   - 'mock': devuelve numero LM-2026-XXXXXX (para pruebas UI sin red).
 *
 * Reglas:
 *   1. NUNCA emitir sin cotizar primero.
 *   2. Validar payload completo antes de llamar createEmissionAuto.
 *   3. Loggear timestamp y `internalPolicyId` antes y despues de emitir
 *      (idempotencia manual: si la red falla justo despues de emitir,
 *      el log permite al operador escalar a La Mundial con la placa).
 */
const { getCotizacionAuto, createEmissionAuto } = require('./lamundialClient');
const { buildQuoteRequest, buildEmissionRequest } = require('./policyMapper');
const { validateEmissionPayload } = require('./policyValidator');

function getMode() {
  return (process.env.POLICY_MODE || 'live').toLowerCase();
}

class PolicyError extends Error {
  constructor(code, message, httpStatus = 400, extra = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    Object.assign(this, extra);
  }
}

/**
 * Cotiza la prima del vehiculo. Retorna { mprima, mprimaext, ptasa, metadata }.
 */
async function quote(state, overrides = {}) {
  if (getMode() === 'mock') {
    return {
      mprima: 198114.5,
      mprimaext: 408.29,
      ptasa: 485.2251,
      metadata: { mock: true, vehicleLabel: 'TOYOTA / COROLLA (mock)' },
    };
  }

  const { payload, metadata } = buildQuoteRequest(state, overrides);
  try {
    const result = await getCotizacionAuto(payload);
    return {
      mprima: result.mprima,
      mprimaext: result.mprimaext,
      ptasa: result.ptasa,
      metadata,
    };
  } catch (err) {
    throw mapClientError(err, 'quote');
  }
}

/**
 * Cotiza y emite poliza en una sola operacion (recomendado).
 * El cliente del frontend solo llama a esta y recibe el resultado final.
 *
 * @param {object} state wizardState completo (tomador, vehicle, asegurado, ...)
 * @param {object} [overrides] { plan, frecuencia, fechaEmision, internalPolicyId }
 * @returns {Promise<{
 *   internalPolicyId: string,
 *   cnpoliza: string, cnrecibo: string, urlpoliza: string, ncuota: number,
 *   quote: { mprima:number, mprimaext:number, ptasa:number },
 *   emittedAt: string,
 *   metadata: object
 * }>}
 */
async function quoteAndEmit(state, overrides = {}) {
  if (getMode() === 'mock') {
    const policyNumber = `LM-2026-${String(Math.floor(100000 + Math.random() * 899999))}`;
    return {
      internalPolicyId: `MOCK-${Date.now()}`,
      cnpoliza: policyNumber,
      cnrecibo: `MOCK-RECIBO-${Date.now()}`,
      urlpoliza: '',
      ncuota: 1,
      quote: { mprima: 198114.5, mprimaext: 408.29, ptasa: 485.2251 },
      emittedAt: new Date().toISOString(),
      metadata: { mock: true },
    };
  }

  // 1) Cotizar
  const quoteResult = await quote(state, overrides);

  // 2) Construir payload de emision
  const { payload, metadata } = buildEmissionRequest(
    state,
    {
      mprima: quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa: quoteResult.ptasa,
    },
    overrides
  );

  // 3) Validar localmente antes de quemar cupo
  const errors = validateEmissionPayload(payload);
  if (errors.length > 0) {
    throw new PolicyError(
      'INVALID_PAYLOAD',
      `Validacion fallida: ${errors.join('; ')}`,
      400,
      { details: errors, internalPolicyId: payload.poliza }
    );
  }

  // 4) Log antes de emitir (idempotencia manual)
  const ts = new Date().toISOString();
  console.log(`[Policy][${ts}] EMITIENDO internalId=${payload.poliza} placa=${payload.placa}`);

  // 5) Emitir
  let emission;
  try {
    emission = await createEmissionAuto(payload);
  } catch (err) {
    throw mapClientError(err, 'emit', { internalPolicyId: payload.poliza });
  }

  // 6) Log de exito
  console.log(
    `[Policy][${new Date().toISOString()}] EMITIDA internalId=${payload.poliza} cnpoliza=${emission.cnpoliza}`
  );

  return {
    internalPolicyId: payload.poliza,
    cnpoliza: emission.cnpoliza,
    cnrecibo: emission.cnrecibo,
    urlpoliza: emission.urlpoliza,
    ncuota: emission.ncuota,
    quote: {
      mprima: quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa: quoteResult.ptasa,
    },
    emittedAt: new Date().toISOString(),
    metadata: {
      ...quoteResult.metadata,
      ...metadata,
    },
  };
}

/**
 * Convierte errores del cliente HTTP en PolicyError tipados con HTTP status
 * adecuado para que el frontend pueda discriminar.
 */
function mapClientError(err, stage, extra = {}) {
  const code = err.code || 'LAMUNDIAL_ERROR';
  let httpStatus = 502;
  switch (code) {
    case 'LAMUNDIAL_PLATE_ALREADY_INSURED':
      httpStatus = 409;
      break;
    case 'LAMUNDIAL_MISSING_FIELDS':
    case 'INVALID_PAYLOAD':
      httpStatus = 400;
      break;
    case 'LAMUNDIAL_UNAUTHORIZED':
      httpStatus = 502;
      break;
    case 'LAMUNDIAL_SP_OUTDATED':
      httpStatus = 502;
      break;
    case 'LAMUNDIAL_NETWORK':
      httpStatus = 504;
      break;
    case 'LAMUNDIAL_APIKEY_MISSING':
      httpStatus = 500;
      break;
    case 'LAMUNDIAL_SERVER_ERROR':
      httpStatus = 502;
      break;
  }
  return new PolicyError(code, err.message, httpStatus, {
    stage,
    endpoint: err.endpoint,
    raw: err.raw,
    ...extra,
  });
}

module.exports = { quote, quoteAndEmit, PolicyError, getMode };
