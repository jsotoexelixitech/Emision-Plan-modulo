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
const axios = require('axios');
const { getCotizacionFromSis2000 } = require('./quoteSis2000');
const {
  getCotizacionViaNestApi,
  createEmissionAutoViaNestApi: emitViaNestApi,
  validateEmissionAutoViaNestApi,
  getBaseUrl: getNestApiUrl,
} = require('./nestApiClient');
const { activateReceiptAfterPayment } = require('./nestApiCollectionClient');
const { buildQuoteRequest, buildEmissionRequest, toLaMundialEmissionPayload } = require('./policyMapper');
const { resolveCategoriaUsoFromVinma, resolveUsageCategory } = require('./catalogs');
const { validateEmissionPayload } = require('./policyValidator');

/**
 * Emite la póliza vía nest-api (Sis2000 directo, sin HTTP La Mundial).
 *
 * @param {object} payload - payload ya construido por buildEmissionRequest
 * @param {object} cotizacion - { mprima, mprimaext, ptasa }
 */
async function createEmissionAutoViaNestApi(payload, cotizacion) {
  const laMundialPayload = toLaMundialEmissionPayload(payload, cotizacion);
  const ts = new Date().toISOString();
  console.log(
    `[nest-api][${ts}] EMITIENDO placa=${laMundialPayload.xplaca ?? payload.placa} plan=${laMundialPayload.cplan ?? payload.plan}`,
  );

  const emission = await emitViaNestApi({
    ...laMundialPayload,
    poliza: payload.poliza,
    mprima: cotizacion.mprima,
    mprimaext: cotizacion.mprimaext,
    tasa: cotizacion.ptasa,
    ptasa: cotizacion.ptasa,
  });

  return {
    cnpoliza: emission.cnpoliza,
    cnrecibo: emission.cnrecibo,
    urlpoliza: emission.urlpoliza || '',
    ncuota: emission.ncuota || 1,
    message: emission.message,
    fanopol: emission.fanopol,
    fmespol: emission.fmespol,
    _raw: emission._raw,
  };
}

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
  if (!payload?.cplan) {
    throw new PolicyError(
      'MISSING_PLAN',
      'Se requiere cplan para cotizar (plan seleccionado o LAMUNDIAL_PLAN_DEFAULT en .env).',
      400,
      { stage: 'quote' },
    );
  }
  if (!payload.cmarca || !payload.cmodelo || !payload.cversion) {
    throw new PolicyError(
      'MISSING_VEHICLE_CODES',
      'Faltan códigos de vehículo (marca/modelo/versión) para cotizar.',
      400,
      { stage: 'quote' },
    );
  }

  const quoteSourceRaw = (process.env.QUOTE_SOURCE || 'nest-api').toLowerCase();
  const quoteSource = quoteSourceRaw === 'sysip' ? 'nest-api' : quoteSourceRaw;
  console.log(`[Policy][quote] source=${quoteSource} payload:`, JSON.stringify(payload));

  try {
    let result;
    if (quoteSource === 'sis2000') {
      result = await getCotizacionFromSis2000({
        ...payload,
        cramo: parseInt(process.env.LAMUNDIAL_RAMO, 10),
        iplaca: enrichedState.vehicle?.tipoPlaca === 'extranjera' ? 'E' : 'N',
      });
      metadata.quoteSource = 'sis2000';
    } else {
      try {
        result = await getCotizacionViaNestApi({
          cmarca: payload.cmarca,
          cmodelo: payload.cmodelo,
          cversion: payload.cversion,
          fano: payload.fano,
          cplan: payload.cplan,
          ccategoria_uso: payload.ccategoria_uso,
          iplaca: enrichedState.vehicle?.tipoPlaca === 'extranjera' ? 'E' : 'N',
          ntoneladas: payload.ntoneladas,
          cramo: parseInt(process.env.LAMUNDIAL_RAMO || '18', 10),
        });
        metadata.quoteSource = 'nest-api';
      } catch (nestApiErr) {
        const isNestQuoteErr =
          nestApiErr.code === 'NEST_API_QUOTE_ERROR' ||
          nestApiErr.code === 'NEST_API_QUOTE_ZERO' ||
          nestApiErr.code === 'SYSIP_QUOTE_ERROR' ||
          nestApiErr.code === 'SYSIP_QUOTE_ZERO';
        if (process.env.SIS2000_SERVER && isNestQuoteErr) {
          console.warn(`[Policy][quote] nest-api falló (${nestApiErr.message}), reintentando SQL local`);
          result = await getCotizacionFromSis2000({
            ...payload,
            cramo: parseInt(process.env.LAMUNDIAL_RAMO || '18', 10),
            iplaca: enrichedState.vehicle?.tipoPlaca === 'extranjera' ? 'E' : 'N',
          });
          metadata.quoteSource = 'sis2000_fallback';
        } else {
          throw nestApiErr;
        }
      }
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
    if (
      err.code === 'NEST_API_QUOTE_ZERO' ||
      err.code === 'NEST_API_QUOTE_ERROR' ||
      err.code === 'SYSIP_QUOTE_ZERO' ||
      err.code === 'SYSIP_QUOTE_ERROR'
    ) {
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

  // 3) Validar placa/serial en Sis2000 (mismo plan que la emisión)
  const emitPlan =
    overrides.plan ||
    state.selectedPlan?.cplan ||
    payload.plan ||
    process.env.LAMUNDIAL_PLAN_DEFAULT ||
    'RCVBAS';
  try {
    await validateEmissionAutoViaNestApi({
      plan: emitPlan,
      placa: payload.placa,
      serial_carroceria: payload.serial_carroceria,
      serial_motor: payload.serial_motor || payload.serial_carroceria,
    });
  } catch (err) {
    if (err.code === 'PLATE_ALREADY_INSURED') {
      throw new PolicyError('LAMUNDIAL_PLATE_ALREADY_INSURED', err.message, 409, {
        stage: 'validate',
        internalPolicyId: payload.poliza,
      });
    }
    throw new PolicyError(err.code || 'VALIDATE_EMISSION_ERROR', err.message, 502, {
      stage: 'validate',
      internalPolicyId: payload.poliza,
    });
  }

  // 4) Validar localmente antes de quemar cupo
  const errors = validateEmissionPayload(payload);
  if (errors.length > 0) {
    throw new PolicyError(
      'INVALID_PAYLOAD',
      `Validacion fallida: ${errors.join('; ')}`,
      400,
      { details: errors, internalPolicyId: payload.poliza }
    );
  }

  // 5) Log antes de emitir (idempotencia manual)
  const ts = new Date().toISOString();
  console.log(`[Policy][${ts}] EMITIENDO internalId=${payload.poliza} placa=${payload.placa}`);

  // 6) Emitir via nest-api (inserta en eePoliza_Automovil_RCV2)
  let emission;
  try {
    emission = await createEmissionAutoViaNestApi(payload, {
      mprima:    quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa:     quoteResult.ptasa,
    });
  } catch (err) {
    throw mapClientError(err, 'emit', { internalPolicyId: payload.poliza });
  }

  // 5.1) Activar recibo en Sis2000 solo tras pago verificado (ref. bancaria real, monto Bs)
  if (emission.cnrecibo && state.paymentVerified) {
    const pay = state.paymentCapture || {};
    const xreferencia = pay.reference || pay.transactionId || pay.xreferencia;
    if (!xreferencia || String(xreferencia).trim() === '' || /^EX-/i.test(String(xreferencia))) {
      metadata.collectionSkipped = 'sin_referencia_bancaria';
      console.warn(
        `[Policy] Cobro omitido cnrecibo=${emission.cnrecibo}: pago verificado sin referencia bancaria`,
      );
    } else {
      const fpago = pay.paidOn || pay.fpago || new Date().toISOString().slice(0, 10);
      const mpago = pay.amount != null ? Number(pay.amount) : quoteResult.mprima;

      try {
        const collectionResult = await activateReceiptAfterPayment({
          cnrecibo: emission.cnrecibo,
          mpago,
          xreferencia: String(xreferencia).trim(),
          fpago: String(fpago).slice(0, 10),
          cusuario: pay.cusuario,
          cbanco_ref: pay.bankCode ? String(pay.bankCode).trim() : undefined,
          cbanco: pay.cbanco,
          cbanco_destino: pay.cbanco_destino,
        });
        metadata.collection = collectionResult;
        console.log(
          `[Policy] Recibo ${emission.cnrecibo} activado en Sis2000 ref=${xreferencia} mpago=${mpago} Bs`,
        );
      } catch (collErr) {
        console.error(
          `[Policy] collection/activate falló cnrecibo=${emission.cnrecibo}:`,
          collErr.message,
        );
        metadata.collectionError = collErr.message;
      }
    }
  } else if (emission.cnrecibo) {
    metadata.collectionSkipped = 'pago_no_verificado';
    console.warn(
      `[Policy] Cobro omitido cnrecibo=${emission.cnrecibo}: state.paymentVerified=false (emit sin datos de pago)`,
    );
  }

  // 5.5) Generar anexo de Conductor Habitual si existe
  let url_conductor_habitual = undefined;
  if (payload.conductor && payload.conductor.xrif_conductor) {
    try {
      const nestApiUrl = getNestApiUrl();
      const femision = payload.fecha_emision || payload.femision || new Date().toISOString().slice(0, 10);
      const fdesde = payload.fdesde || femision;
      const dHasta = new Date(femision + 'T00:00:00Z');
      dHasta.setUTCFullYear(dHasta.getUTCFullYear() + 1);
      dHasta.setUTCDate(dHasta.getUTCDate() - 1);
      const fhasta = payload.fhasta || dHasta.toISOString().slice(0, 10);

      const docRes = await axios.post(`${nestApiUrl}/api/v1/documents/conductor-habitual`, {
        poliza: emission.cnpoliza,
        certificado: "0",
        fechaEmision: femision,
        sucursal: "CARACAS",
        intermediario: String(payload.cproductor || '80080'),
        tomadorNombre: `${payload.nombre_tomador || payload.xnombre_tomador || ''} ${payload.apellido_tomador || payload.xapellido_tomador || ''}`.trim(),
        tomadorRif: String(payload.rif_tomador || payload.xrif_tomador || ''),
        vigenciaDesde: fdesde,
        vigenciaHasta: fhasta,
        conductorNombre: `${payload.conductor.xnombre_conductor} ${payload.conductor.xapellido_conductor}`.trim(),
        conductorRif: String(payload.conductor.xrif_conductor)
      });
      if (docRes.data && docRes.data.url) {
        // En srv001, nest-api devuelve localhost:3002 en la URL a veces
        // Vamos a parchear la IP para asegurar que el cliente pueda abrir el PDF
        let url = docRes.data.url;
        console.log(`[Policy] URL de anexo devuelta por nest-api: ${url}`);
        url = url.replace('localhost', '192.168.8.120');
        url_conductor_habitual = url;
        console.log(`[Policy] URL final mapeada para el frontend: ${url_conductor_habitual}`);
      }
    } catch (err) {
      console.error(`[Policy] Error al generar anexo de conductor habitual:`, err.response?.data || err.message);
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
    case 'NEST_API_COUNTER_COLLISION':
      httpStatus = 503;
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
    case 'NEST_API_KEY_MISSING':
    case 'SYSIP_APIKEY_MISSING':
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
