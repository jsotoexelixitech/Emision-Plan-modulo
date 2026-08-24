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
const {
  getCotizacionViaNestApi,
  calculatePlanCoberturasViaNestApi,
  computeCoverageTotalUsd,
  fetchCoberturaComponentPremiums,
  extractTasasFromMount,
  buildTasasPayloadForCober,
  createEmissionAutoViaNestApi: emitViaNestApi,
  validateEmissionAutoViaNestApi,
  generateConductorHabitualViaNestApi,
  sendPolicyEmailViaNestApi,
  getValrepFrecuencias,
  getBaseUrl: getNestApiUrl,
} = require('./nestApiClient');
const { resolveIngresoCajaAfterPayment } = require('./collectionAfterPayment');
const {
  buildQuoteRequest,
  buildCalculatePlanCoberturasRequest,
  buildEmissionRequest,
  toLaMundialEmissionPayload,
  resolveSelectedCoberturas,
  resolvePrimaryCoberAdicional,
  resolveIplaca,
} = require('./policyMapper');
const { resolveCategoriaUsoFromVinma, resolveUsageCategory } = require('./catalogs');
const { validateEmissionPayload } = require('./policyValidator');
const { resolveCusuarioCoberturas } = require('./planesClient');

/** URL del PDF conductor accesible desde el navegador del cliente (HTTPS público). */
function mapConductorPdfPublicUrl(url) {
  if (!url) return url;
  const publicOrigin = String(
    process.env.NEST_PUBLIC_API_ORIGIN || process.env.PUBLIC_API_ORIGIN || '',
  ).trim().replace(/\/$/, '');
  const publicPrefix = String(
    process.env.NEST_PUBLIC_API_PREFIX || process.env.PUBLIC_API_PREFIX || '',
  ).trim().replace(/\/$/, '');
  if (publicOrigin) {
    const parsed = new URL(url);
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    return `${publicOrigin}${publicPrefix}${pathAndQuery}`;
  }
  return url
    .replace('://localhost:', '://127.0.0.1:')
    .replace('localhost', '127.0.0.1');
}

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

  // No enviar poliza/cnpoliza_rel: Sis2000 genera cnpoliza; INT-* solo queda en logs locales.
  // mprima siempre 0 al SP (La Mundial recalcula; no reinyectar prima cotizada).
  const emissionBody = {
    ...laMundialPayload,
    mprima: 0,
    mprimaext: cotizacion.mprimaext,
    ptasa: cotizacion.ptasa,
    tasa: cotizacion.ptasa,
  };
  console.log(
    `[nest-api][${ts}] prima emit mprimaext=${emissionBody.mprimaext} mprima=0 ifrecuencia=${emissionBody.ifrecuencia} cusuario=${emissionBody.cusuario ?? '?'} coberAdicional=${emissionBody.coberAdicional ?? 'RC'} msumaaseg=${emissionBody.msumaaseg ?? 'null'} tasaCa=${emissionBody.tasaCa ?? 0} tasaPt=${emissionBody.tasaPt ?? 0} tasaPp=${emissionBody.tasaPp ?? 0}`,
  );

  const emission = await emitViaNestApi(emissionBody);

  return {
    cnpoliza: emission.cnpoliza,
    cnrecibo: emission.cnrecibo,
    urlpoliza: emission.urlpoliza || '',
    url_club_arys: emission.url_club_arys || '',
    ncuota: emission.ncuota || 1,
    message: emission.message,
    fanopol: emission.fanopol,
    fmespol: emission.fmespol,
    _raw: emission._raw,
  };
}

function resolveClubArysFallbackUrl(iplaca) {
  const plate = String(iplaca || 'N').trim().toUpperCase();
  const bi =
    process.env.ARYS_AUTO_BI_PDF_URL
    || 'https://qasys2000.lamundialdeseguros.com/assets/ArysAutoBi.pdf';
  const trad =
    process.env.ARYS_TRADICIONAL_PDF_URL
    || 'https://qasys2000.lamundialdeseguros.com/assets/Arys_Tradicional.pdf';
  return plate === 'B' ? bi : trad;
}

function getMode() {
  return (process.env.POLICY_MODE || 'live').toLowerCase();
}

/** Opciones "Incluir" desde flags calculate-plan si el catálogo no trae xcober. */
function buildCoverageOptionsFromFlags(breakdown, planOptions) {
  if (Array.isArray(planOptions) && planOptions.length > 0) return planOptions;
  if (!breakdown) return undefined;
  const opts = [];
  if (breakdown.boolCA) opts.push({ value: 'CA', text: 'COBERTURA AMPLIA' });
  if (breakdown.boolPT) opts.push({ value: 'PT', text: 'PERDIDA TOTAL' });
  if (breakdown.boolPP) opts.push({ value: 'PP', text: 'PERDIDA PARCIAL' });
  if (breakdown.boolAP) opts.push({ value: 'AP', text: 'APOV' });
  return opts.length > 0 ? opts : undefined;
}

/** Resuelve frecuencia/ndias para emisión (bridge pagos puede omitir state.rcv). */
async function resolveEmitOverrides(state, overrides = {}) {
  const plan =
    overrides.plan ||
    state.selectedPlan?.cplan ||
    process.env.LAMUNDIAL_PLAN_DEFAULT ||
    'RCVBAS';
  const frecuencia =
    overrides.frecuencia ||
    state.rcv?.frecuencia ||
    process.env.LAMUNDIAL_FRECUENCIA_DEFAULT ||
    'A';
  let ndias = overrides.ndias ?? state.rcv?.ndias;
  if ((ndias == null || ndias === '') && frecuencia && plan) {
    try {
      const cramo = resolveRcvCramo(state.vehicle, state.metadataCanal || {});
      const items = await getValrepFrecuencias(plan, cramo);
      const code = String(frecuencia).trim().toUpperCase().charAt(0);
      const match = items.find(
        (i) => String(i.code).trim().toUpperCase().charAt(0) === code,
      );
      if (match?.ndias != null && !Number.isNaN(Number(match.ndias))) {
        ndias = Number(match.ndias);
      }
    } catch (err) {
      console.warn(
        `[Policy] ndias no resuelto plan=${plan} frecuencia=${frecuencia}: ${err.message}`,
      );
    }
  }
  return { ...overrides, plan, frecuencia, ndias };
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
  if (quoteSource === 'sis2000') {
    throw new PolicyError(
      'QUOTE_SOURCE_DEPRECATED',
      'QUOTE_SOURCE=sis2000 ya no está soportado. Cotiza solo vía nest-api (POST /api/v1/valrep/cotizacion).',
      500,
      { stage: 'quote' },
    );
  }
  console.log(`[Policy][quote] source=nest-api payload:`, JSON.stringify(payload));

  try {
    const cusuario = resolveCusuarioCoberturas(enrichedState.metadataCanal || {});
    const result = await getCotizacionViaNestApi({
      cmarca: payload.cmarca,
      cmodelo: payload.cmodelo,
      cversion: payload.cversion,
      fano: payload.fano,
      cplan: payload.cplan,
      ccategoria_uso: payload.ccategoria_uso,
      iplaca: payload.iplaca || resolveIplaca(enrichedState.vehicle),
      ntoneladas: payload.ntoneladas,
      precargorcv: payload.precargorcv,
      cramo: payload.cramo || parseInt(process.env.LAMUNDIAL_RAMO || '18', 10),
      ifrecuencia: payload.ifrecuencia,
      ndias: payload.ndias,
      sumaAsegurada: payload.sumaAsegurada,
      cusuario,
    });
    metadata.quoteSource = 'nest-api';
    let coberturas;
    let breakdown;
    const selectedCoberturas = resolveSelectedCoberturas(enrichedState.rcv, overrides);
    const primaryCober = resolvePrimaryCoberAdicional(selectedCoberturas);
    const coverageEnabled = process.env.COVERAGE_BREAKDOWN_ENABLED !== 'false';
    if (coverageEnabled) {
      try {
        const { payload: covPayload } = buildCalculatePlanCoberturasRequest(
          enrichedState,
          overrides,
          { referenceSuma: result.referenceSuma },
        );
        if (covPayload) {
          const optionCodes = (enrichedState.selectedPlan?.coberturasAdicionales ?? [])
            .map((o) => String(o.value || '').trim().toUpperCase())
            .filter(Boolean);
          const codesForPremiums = selectedCoberturas.length > 0
            ? selectedCoberturas
            : (optionCodes.length > 0 ? optionCodes : ['CA', 'PT', 'PP']);

          const { pa, premiums, rcBreakdown, tasas: tasasFromFetch } = await fetchCoberturaComponentPremiums(
            covPayload,
            codesForPremiums,
          );

          const enrichedCov = {
            ...covPayload,
            tasaCa: tasasFromFetch.tasaCA ?? covPayload.tasaCa ?? 0,
            tasaPt: tasasFromFetch.tasaPT ?? covPayload.tasaPt ?? 0,
            tasaPp: tasasFromFetch.tasaPP ?? covPayload.tasaPp ?? 0,
          };
          breakdown = await calculatePlanCoberturasViaNestApi({
            ...enrichedCov,
            coberAdicional: primaryCober,
            ...buildTasasPayloadForCober(primaryCober, enrichedCov),
          });
          coberturas = breakdown.coberturas;
          const tasasMount = extractTasasFromMount(breakdown.mount);
          const tasas = (tasasMount.tasaCA || tasasMount.tasaPT || tasasMount.tasaPP)
            ? tasasMount
            : (tasasFromFetch || {});
          metadata.coverageTotals = {
            pa,
            ca: premiums.CA ?? 0,
            pt: premiums.PT ?? 0,
            ap: premiums.AP ?? 0,
            pp: premiums.PP ?? 0,
            cproducto: breakdown.cproducto ?? rcBreakdown.cproducto,
          };
          metadata.componentPremiums = premiums;
          metadata.coberAdicionales = selectedCoberturas;
          metadata.coberAdicional = primaryCober;
          metadata.coverageFlags = {
            boolCA: (premiums.CA ?? 0) > 0,
            boolPT: (premiums.PT ?? 0) > 0,
            boolPP: (premiums.PP ?? 0) > 0,
            boolAP: (premiums.AP ?? 0) > 0,
          };
          metadata.tasas = tasas;
          metadata.coverageOptions = buildCoverageOptionsFromFlags(
            breakdown,
            enrichedState.selectedPlan?.coberturasAdicionales,
          );
        }
      } catch (covErr) {
        console.warn(`[Policy][quote] coberturas no disponibles: ${covErr.message}`);
        metadata.coverageWarning = covErr.message;
      }
    }

    let mprimaext = result.mprimaext;
    let mprima = result.mprima;
    if (breakdown && metadata.coverageTotals?.pa > 0) {
      const totalUsd = computeCoverageTotalUsd(
        metadata.coverageTotals,
        selectedCoberturas,
        metadata.componentPremiums,
      );
      if (totalUsd > 0) {
        mprimaext = totalUsd;
        if (result.ptasa > 0) {
          mprima = totalUsd * result.ptasa;
        }
      }
    }

    return {
      mprima,
      mprimaext,
      ptasa: result.ptasa,
      coberturas,
      metadata: {
        ...metadata,
        referenceSuma: result.referenceSuma,
        sumaAsegurada: result.referenceSuma,
      },
    };
  } catch (err) {
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
  const emitOverrides = await resolveEmitOverrides(state, overrides);
  const quoteResult = await quote(state, emitOverrides);

  // 2) Construir payload de emision
  const { payload, metadata } = buildEmissionRequest(
    state,
    {
      mprima: quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa: quoteResult.ptasa,
    },
    {
      ...emitOverrides,
      quoteMeta: quoteResult.metadata,
    },
  );

  // 3) Validar placa/serial en Sis2000 (mismo plan que la emisión)
  const emitPlan =
    emitOverrides.plan ||
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
        internalPolicyId: metadata.internalPolicyId,
      });
    }
    throw new PolicyError(err.code || 'VALIDATE_EMISSION_ERROR', err.message, 502, {
      stage: 'validate',
      internalPolicyId: metadata.internalPolicyId,
    });
  }

  // 4) Validar localmente antes de quemar cupo
  const errors = validateEmissionPayload(payload);
  if (errors.length > 0) {
    throw new PolicyError(
      'INVALID_PAYLOAD',
      `Validacion fallida: ${errors.join('; ')}`,
      400,
      { details: errors, internalPolicyId: metadata.internalPolicyId }
    );
  }

  // 5) Log antes de emitir (idempotencia manual; INT-* no se envía al SP)
  const ts = new Date().toISOString();
  console.log(`[Policy][${ts}] EMITIENDO internalId=${metadata.internalPolicyId} placa=${payload.placa}`);

  // 6) Emitir via nest-api (inserta en eePoliza_Automovil_RCV2)
  let emission;
  try {
    emission = await createEmissionAutoViaNestApi(payload, {
      mprima:    quoteResult.mprima,
      mprimaext: quoteResult.mprimaext,
      ptasa:     quoteResult.ptasa,
    });
  } catch (err) {
    throw mapClientError(err, 'emit', { internalPolicyId: metadata.internalPolicyId });
  }

  // 5.1) Activar recibo en Sis2000 solo tras pago verificado (ref. bancaria real, monto Bs)
  let url_ingreso_caja;
  if (emission.cnrecibo) {
    url_ingreso_caja = await resolveIngresoCajaAfterPayment(state, {
      cnrecibo: emission.cnrecibo,
      mpagoFallback: quoteResult.mprima,
      metadata,
    });
    if (url_ingreso_caja) {
      console.log(`[Policy] URL ingreso caja: ${url_ingreso_caja}`);
    } else if (metadata.collectionSkipped === 'pago_no_verificado') {
      console.warn(
        `[Policy] Cobro omitido cnrecibo=${emission.cnrecibo}: state.paymentVerified=false (emit sin datos de pago)`,
      );
    } else if (metadata.collectionSkipped === 'sin_referencia_bancaria') {
      console.warn(
        `[Policy] Cobro omitido cnrecibo=${emission.cnrecibo}: pago verificado sin referencia bancaria`,
      );
    } else if (metadata.collectionError) {
      console.error(
        `[Policy] collection/activate falló cnrecibo=${emission.cnrecibo}:`,
        metadata.collectionError,
      );
    }
  }

  // 5.5) Generar anexo de Conductor Habitual si existe (solo RCV)
  let url_conductor_habitual = undefined;
  let url_club_arys =
    emission.url_club_arys
    || emission._raw?.result?.url_club_arys
    || emission._raw?.url_club_arys
    || undefined;
  if (!url_club_arys) {
    const planCode = String(payload.cplan || payload.plan || state.selectedPlan?.cplan || '')
      .trim()
      .toUpperCase();
    if (['RCVBAS', 'RUSPAT'].includes(planCode)) {
      url_club_arys = resolveClubArysFallbackUrl(payload.iplaca);
      console.log(`[Policy] URL Club Arys (fallback plan ${planCode}): ${url_club_arys}`);
    }
  }
  if (url_club_arys) {
    console.log(`[Policy] URL Club Arys: ${url_club_arys}`);
  }
  if (payload.conductor && payload.conductor.xrif_conductor) {
    try {
      const femision = payload.fecha_emision || payload.femision || new Date().toISOString().slice(0, 10);
      const fdesde = payload.fdesde || femision;
      const dHasta = new Date(femision + 'T00:00:00Z');
      dHasta.setUTCFullYear(dHasta.getUTCFullYear() + 1);
      dHasta.setUTCDate(dHasta.getUTCDate() - 1);
      const fhasta = payload.fhasta || dHasta.toISOString().slice(0, 10);

      const rawUrl = await generateConductorHabitualViaNestApi({
        poliza: emission.cnpoliza,
        certificado: '0',
        fechaEmision: femision,
        sucursal: 'CARACAS',
        intermediario: String(payload.cproductor || '80080'),
        tomadorNombre: `${payload.nombre_tomador || payload.xnombre_tomador || ''} ${payload.apellido_tomador || payload.xapellido_tomador || ''}`.trim(),
        tomadorRif: String(payload.rif_tomador || payload.xrif_tomador || ''),
        vigenciaDesde: fdesde,
        vigenciaHasta: fhasta,
        conductorNombre: `${payload.conductor.xnombre_conductor} ${payload.conductor.xapellido_conductor}`.trim(),
        conductorRif: String(payload.conductor.xrif_conductor),
      });
      url_conductor_habitual = mapConductorPdfPublicUrl(rawUrl);
      console.log(`[Policy] URL anexo conductor: ${url_conductor_habitual}`);
    } catch (err) {
      console.error(
        `[Policy] Error al generar anexo de conductor habitual:`,
        err.response?.data || err.message,
        err.code ? `(code=${err.code})` : '',
      );
      metadata.conductorPdfError = err.message;
    }
  }

  // 6) Log de exito
  console.log(
    `[Policy][${new Date().toISOString()}] EMITIDA internalId=${metadata.internalPolicyId} cnpoliza=${emission.cnpoliza}`
  );

  const emailTo = String(
    payload.correo_tomador || payload.xcorreo_tomador || state?.tomador?.email || '',
  ).trim();
  if (emailTo) {
    const tomadorNombre = [
      payload.nombre_tomador || payload.xnombre_tomador,
      payload.apellido_tomador || payload.xapellido_tomador,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    sendPolicyEmailViaNestApi({
      to: emailTo,
      name: tomadorNombre || undefined,
      cnpoliza: emission.cnpoliza,
      cnrecibo: emission.cnrecibo,
      fanopol: emission.fanopol,
      fmespol: emission.fmespol,
      urlpoliza: emission.urlpoliza,
      url_conductor_habitual,
      url_club_arys,
      url_ingreso_caja,
    }).then((mailRes) => {
      if (mailRes?.sent) {
        console.log(`[Policy] Correo enviado a ${emailTo} póliza ${emission.cnpoliza}`);
      } else {
        console.warn(
          `[Policy] Correo no enviado póliza ${emission.cnpoliza}:`,
          mailRes?.error || mailRes?.mode || 'sin detalle',
        );
      }
    }).catch((mailErr) => {
      console.warn(
        `[Policy] Error enviando correo póliza ${emission.cnpoliza}:`,
        mailErr.message || mailErr,
      );
    });
  }

  return {
    internalPolicyId: metadata.internalPolicyId,
    cnpoliza: emission.cnpoliza,
    cnrecibo: emission.cnrecibo,
    urlpoliza: emission.urlpoliza,
    url_conductor_habitual,
    url_club_arys,
    url_ingreso_caja,
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
    case 'NEST_API_QUOTE_ERROR':
    case 'NEST_API_QUOTE_ZERO':
    case 'SYSIP_QUOTE_ERROR':
    case 'SYSIP_QUOTE_ZERO':
      httpStatus = err.httpStatus && err.httpStatus >= 400 && err.httpStatus < 500
        ? err.httpStatus
        : 400;
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
