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
const { getCotizacionAuto } = require('./lamundialClient');
const axios = require('axios');
const { getCotizacionFromSis2000 } = require('./quoteSis2000');

/**
 * Emite la póliza vía sysip-nest-api (backend-api-sys), que inserta
 * directamente en eePoliza_Automovil_RCV2 en Sis2000.
 * Este es el mismo flujo que usa el monolito suscripcion-rcv.
 *
 * @param {object} payload - payload ya construido por buildEmissionRequest
 * @param {object} cotizacion - { mprima, mprimaext, ptasa }
 */
async function createEmissionAutoViaSysip(payload, cotizacion) {
  const sysipUrl = (process.env.SYSIP_API_URL || 'http://localhost:3002').replace(/\/$/, '');
  const apikey   = process.env.LAMUNDIAL_APIKEY || '';

  // Calcular fechas de vigencia (emisión + 1 año)
  const femision = payload.fecha_emision || new Date().toISOString().slice(0, 10);
  const fdesde   = femision;
  const dHasta   = new Date(femision + 'T00:00:00Z');
  dHasta.setUTCFullYear(dHasta.getUTCFullYear() + 1);
  dHasta.setUTCDate(dHasta.getUTCDate() - 1);
  const fhasta   = dHasta.toISOString().slice(0, 10);

  // El DTO de sysip-nest-api valida los mismos nombres que buildEmissionRequest produce.
  // Solo hay que: convertir rif a número, añadir alias x* que el service lee directamente,
  // y añadir las fechas femision/fdesde/fhasta que el service escribe en la BD.
  const sysipPayload = {
    // Pasa TODO el payload original (DTO acepta los mismos nombres)
    ...payload,
    // rif como número (@IsNumber en DTO); cusuario como string (@IsString en DTO)
    rif_tomador: parseInt(String(payload.rif_tomador).replace(/\D/g, ''), 10),
    rif_titular: parseInt(String(payload.rif_titular).replace(/\D/g, ''), 10),
    cusuario: payload.cusuario != null ? String(payload.cusuario) : undefined,
    // Alias que el service lee directamente (sin fallback a nombres sin prefijo)
    femision,               // service: b.femision
    fdesde,                 // service: b.fdesde
    fhasta,                 // service: b.fhasta
    // Campos requeridos por QA La Mundial para createEmissionAuto
    iplaca: payload.iplaca || 'N',
    estado_civil_tomador: payload.estado_civil_tomador || 'S',
    iestado_civil_tomador: payload.iestado_civil_tomador || payload.estado_civil_tomador || 'S',
    estado_civil_titular: payload.estado_civil_titular || payload.estado_civil_tomador || 'S',
    iestado_civil_titular: payload.iestado_civil_titular || payload.estado_civil_titular || 'S',
    xnombre_tomador:    payload.nombre_tomador,
    xapellido_tomador:  payload.apellido_tomador,
    isexo_tomador:      payload.sexo_tomador,
    xnombre_titular:    payload.nombre_titular,
    xapellido_titular:  payload.apellido_titular,
    isexo_titular:      payload.sexo_titular,
    // Campos financieros (la BD los necesita pero no están en el DTO)
    mprima:     cotizacion.mprima,
    mprima_ext: cotizacion.mprimaext,
    ptasa:      cotizacion.ptasa,
  };

  const ts = new Date().toISOString();
  console.log(`[sysip][${ts}] -> createEmissionAuto placa=${sysipPayload.placa} plan=${sysipPayload.plan}`);
  console.log('[sysip] payload completo:', JSON.stringify(sysipPayload));

  let response;
  try {
    response = await axios.post(
      `${sysipUrl}/api/v1/external/createEmissionAuto`,
      sysipPayload,
      {
        headers: { 'Content-Type': 'application/json', apikey },
        timeout: 60_000,
        validateStatus: () => true,
      },
    );
  } catch (netErr) {
    const err = new Error(`Red no disponible llamando sysip-nest-api: ${netErr.message}`);
    err.code = 'LAMUNDIAL_NETWORK';
    throw err;
  }

  console.log(`[sysip][${new Date().toISOString()}] <- createEmissionAuto HTTP ${response.status}`);

  if (response.status >= 200 && response.status < 300 && response.data?.status === true) {
    const r = response.data.result || {};
    // Construir número de póliza en el mismo formato que usa La Mundial
    const cnpoliza = r.cnpoliza
      ? String(r.cnpoliza)
      : `${payload.cramo}-1-${String(Date.now()).slice(-10)}`;
    return {
      cnpoliza,
      cnrecibo: r.cnrecibo || cnpoliza,
      urlpoliza: r.urlpoliza || '',
      ncuota: r.ncuota || 1,
      message: r.message,
      _raw: response.data,
    };
  }

  // Error de negocio de sysip-nest-api
  const errMsg = response.data?.message || JSON.stringify(response.data).slice(0, 300);
  const err = new Error(errMsg || 'Error al emitir en sysip-nest-api');
  err.code = response.status === 401 ? 'LAMUNDIAL_UNAUTHORIZED' : 'LAMUNDIAL_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}
const { buildQuoteRequest, buildEmissionRequest } = require('./policyMapper');
const { resolveCategoriaUsoFromVinma, resolveUsageCategory } = require('./catalogs');
const { validateEmissionPayload } = require('./policyValidator');

function getMode() {
  return (process.env.POLICY_MODE || 'live').toLowerCase();
}

class PolicyError extends Error {
  constructor(code, message, httpStatus = 400, extra = {}) {
    super(message);
    this.name = 'PolicyError';
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

  const v = state.vehicle || {};
  let enrichedState = state;
  const fano = parseInt(String(v.año || v.ano || ''), 10);
  const needsCategoria =
    (v.ccategoria_uso == null || v.ccategoria_uso === '') &&
    fano && v.cmarca && v.cmodelo && v.cversion;
  if (needsCategoria) {
    const fromVinma = await resolveCategoriaUsoFromVinma(fano, v.cmarca, v.cmodelo, v.cversion);
    const ccategoria_uso = fromVinma ?? resolveUsageCategory(v.uso);
    enrichedState = {
      ...state,
      vehicle: { ...v, ccategoria_uso },
    };
    if (fromVinma == null) {
      console.warn(
        `[Policy][quote] ccategoria_uso no encontrada en VInma; usando fallback uso="${v.uso}" -> ${ccategoria_uso}`,
      );
    }
  }

  const { payload, metadata } = buildQuoteRequest(enrichedState, overrides);
  const quoteSource = (process.env.QUOTE_SOURCE || 'sis2000').toLowerCase();
  console.log(`[Policy][quote] source=${quoteSource} payload:`, JSON.stringify(payload));

  try {
    let result;
    if (quoteSource === 'lamundial_api') {
      result = await getCotizacionAuto(payload);
    } else {
      result = await getCotizacionFromSis2000({
        ...payload,
        cramo: parseInt(process.env.LAMUNDIAL_RAMO, 10) || 18,
        iplaca: enrichedState.vehicle?.tipoPlaca === 'extranjera' ? 'E' : 'N',
      });
      metadata.quoteSource = 'sis2000';
    }
    return {
      mprima: result.mprima,
      mprimaext: result.mprimaext,
      ptasa: result.ptasa,
      metadata,
    };
  } catch (err) {
    if (err.code === 'SIS2000_QUOTE_ZERO' || err.code === 'SIS2000_QUOTE_ERROR') {
      throw new PolicyError(err.code, err.message, 400, { stage: 'quote' });
    }
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

  // 5) Emitir via sysip-nest-api (inserta en eePoliza_Automovil_RCV2)
  let emission;
  try {
    emission = await createEmissionAutoViaSysip(payload, {
      mprima:    quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa:     quoteResult.ptasa,
    });
  } catch (err) {
    throw mapClientError(err, 'emit', { internalPolicyId: payload.poliza });
  }

  // 5.5) Generar anexo de Conductor Habitual si existe
  let url_conductor_habitual = undefined;
  if (payload.conductor && payload.conductor.xrif_conductor) {
    try {
      const SYSIP_URL = (process.env.SYSIP_API_URL || 'http://localhost:3002').replace(/\/$/, '');
      const docRes = await axios.post(`${SYSIP_URL}/api/v1/documents/conductor-habitual`, {
        poliza: emission.cnpoliza,
        certificado: "0",
        fechaEmision: payload.femision,
        sucursal: "CARACAS",
        intermediario: String(payload.cproductor || '80080'),
        tomadorNombre: `${payload.xnombre_tomador} ${payload.xapellido_tomador}`.trim(),
        tomadorRif: String(payload.xrif_tomador),
        vigenciaDesde: payload.fdesde,
        vigenciaHasta: payload.fhasta,
        conductorNombre: `${payload.conductor.xnombre_conductor} ${payload.conductor.xapellido_conductor}`.trim(),
        conductorRif: String(payload.conductor.xrif_conductor)
      });
      if (docRes.data && docRes.data.url) {
        url_conductor_habitual = docRes.data.url;
      }
    } catch (err) {
      console.error(`[Policy] Error al generar anexo de conductor habitual:`, err.message);
    }
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
    url_conductor_habitual,
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
