/**
 * Rutas del producto Funerario (personas) — ramo 9.
 *
 *   GET  /api/personas/planes?cramo=9   → planes vigentes de personas
 *   POST /api/personas/cotizacion       → cotización (getCotizacionPer)
 *   POST /api/personas/validacion       → póliza vigente (paso 4, antes del técnico)
 *   POST /api/personas/emision          → cotiza + valida + emite (pasos 4–6)
 *
 * Estas rutas hablan con nest-api (módulo personas, QA por defecto) vía
 * personasClient.js. Multi-tenant: protegidas por nexusAuth (montadas en index.js).
 */
const express = require('express');
const personasClient = require('../services/personasClient');
const personasMapper = require('../services/personasMapper');
const { resolveNedadAsegurado } = personasMapper;
const { assertPersonasCanEmit } = require('../services/assertPersonasCanEmit');
const { resolveIngresoCajaAfterPayment } = require('../services/collectionAfterPayment');
const {
  recordFuneralEmissionFlexible,
} = require('../services/nexusFuneralSubmission');

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

/** Refs para persistir la póliza en Nexus (cualquier empresa). */
function resolveFuneralRefs(state) {
  const payload = asRecord(state?.checkoutPayload);
  const canal = asRecord(state?.metadataCanal);
  return {
    submissionId: String(
      state?.funeralSubmissionId
      || payload.funeralSubmissionId
      || canal.funeralSubmissionId
      || '',
    ).trim(),
    paymentSid: String(state?.paymentSid || state?.sid || payload.paymentSid || '').trim(),
    sessionId: String(
      state?.originSessionId
      || payload.originSessionId
      || canal.originSessionId
      || state?.sessionId
      || payload.sessionId
      || '',
    ).trim(),
  };
}

/** Fusiona metadata SSO del JWT (nexusAuth) en state.metadataCanal — igual que RCV. */
function withNexusMetadata(state, nexusMetadata) {
  if (!state || typeof state !== 'object') return state;
  if (!nexusMetadata || typeof nexusMetadata !== 'object' || !Object.keys(nexusMetadata).length) {
    return state;
  }
  return {
    ...state,
    metadataCanal: { ...(state.metadataCanal || {}), ...nexusMetadata },
  };
}

const router = express.Router();

const DEFAULT_RAMO = parseInt(process.env.LAMUNDIAL_RAMO_PERSON, 10) || 9;

/**
 * Normaliza un asegurado del front al formato de la API:
 *   { cparen, xrif_asegurado, nedad_asegurado }
 * Acepta tanto el formato API como el formato amigable del wizard.
 */
function mapAsegurado(a) {
  const cparen = Number(a.cparen ?? a.parentesco ?? 0) || 0;
  const xrif = String(a.xrif_asegurado ?? a.identificacion ?? '').replace(/\D/g, '');
  return { cparen, xrif_asegurado: xrif, nedad_asegurado: resolveNedadAsegurado(a) };
}

// ── GET /planes ─────────────────────────────────────────────────────────────
router.get('/planes', async (req, res) => {
  const cramo = req.query.cramo ? parseInt(req.query.cramo, 10) : DEFAULT_RAMO;
  try {
    const { planes } = await personasClient.getPlanesPer(cramo);
    res.json({ success: true, planes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[personas/planes]', msg);
    res.status(502).json({
      success: false,
      code: err.code || 'LAMUNDIAL_PERSON_ERROR',
      message: `No se pudieron obtener los planes de personas: ${msg}`,
    });
  }
});

// ── POST /cotizacion ──────────────────────────────────────────────────────────
router.post('/cotizacion', async (req, res) => {
  const { cplan, ifrecuencia } = req.body || {};
  const cramo = req.body?.cramo ? parseInt(req.body.cramo, 10) : DEFAULT_RAMO;
  const asegurados = Array.isArray(req.body?.asegurados) ? req.body.asegurados.map(mapAsegurado) : [];

  if (!cplan) {
    return res.status(400).json({ success: false, code: 'MISSING_PLAN', message: 'cplan es obligatorio' });
  }
  if (asegurados.length === 0) {
    return res.status(400).json({ success: false, code: 'MISSING_INSURED', message: 'Debe enviar al menos un asegurado' });
  }
  const invalid = asegurados.find((a) => !a.xrif_asegurado || a.nedad_asegurado == null);
  if (invalid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_INSURED',
      message: 'Cada asegurado requiere identificación y fecha de nacimiento válidas',
    });
  }

  try {
    const quote = await personasClient.getCotizacionPer({ cramo, cplan, asegurados, ifrecuencia });
    res.json({
      success: true,
      mprima: quote.mprima,
      mprimaext: quote.mprimaext,
      ptasa: quote.ptasa,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const edades = asegurados
      .map((a) => `${a.xrif_asegurado || '?'} (${a.nedad_asegurado} años, parentesco ${a.cparen})`)
      .join('; ');
    console.error('[personas/cotizacion]', msg, edades);
    const isAge = /criterios de edad/i.test(msg);
    res.status(isAge ? 422 : 502).json({
      success: false,
      code: err.code || (isAge ? 'PERSONAS_AGE' : 'LAMUNDIAL_PERSON_ERROR'),
      message: `No se pudo cotizar: ${msg}${edades ? ` Edad calculada: ${edades}.` : ''}`,
    });
  }
});

// ── POST /poliza-vigente ──────────────────────────────────────────────────────
router.post('/poliza-vigente', async (req, res) => {
  const rif = String(req.body?.rif ?? req.body?.identificacion ?? '').replace(/\D/g, '');
  const cramo = req.body?.cramo != null ? Number(req.body.cramo) : DEFAULT_RAMO;
  if (rif.length < 6) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_CEDULA',
      message: 'La cédula debe tener al menos 6 dígitos.',
    });
  }
  try {
    const result = await personasClient.checkPolizaVigente({ rif, cramo });
    if (result.hasVigente) {
      return res.json({
        success: true,
        blocked: true,
        code: 'PERSONAS_DUPLICATE',
        cnpoliza: result.cnpoliza,
        message: 'Ya existe una póliza funeraria vigente para esta cédula.',
      });
    }
    return res.json({
      success: true,
      blocked: false,
      message: 'No hay póliza funeraria vigente para esta cédula.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[personas/poliza-vigente]', msg);
    return res.status(err.httpStatus || 502).json({
      success: false,
      code: err.code || 'PERSONAS_POLIZA_CHECK_ERROR',
      message: msg,
    });
  }
});

// ── POST /validacion ──────────────────────────────────────────────────────────
router.post('/validacion', async (req, res) => {
  const { state, plan: bodyPlan } = req.body || {};
  const mergedState = withNexusMetadata(state, req.nexusMetadata);
  const cplan = bodyPlan || mergedState?.selectedPlan?.cplan;

  try {
    const validation = await assertPersonasCanEmit(mergedState, { plan: cplan });
    res.json({ success: true, validation: validation.result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const httpStatus = err.httpStatus || 502;
    console.error('[personas/validacion]', msg);
    res.status(httpStatus).json({
      success: false,
      code: err.code || 'PERSONAS_VALIDATION_ERROR',
      message: msg,
      stage: 'validate',
    });
  }
});

// ── POST /emision ─────────────────────────────────────────────────────────────
// Flujo completo: cotiza (spCalculoPer) → valida (speeValidatePersonGeneral) →
// emite la póliza (vista eePoliza_Personas_General) vía nest-api.
// Recibe el estado del wizard: { state: { tomador, funeral, selectedPlan }, frecuencia? }
router.post('/emision', async (req, res) => {
  const { state: rawState, frecuencia } = req.body || {};
  const state = withNexusMetadata(rawState, req.nexusMetadata);
  const funeral = state?.funeral || {};
  const cplan = state?.selectedPlan?.cplan;
  const cramo = DEFAULT_RAMO;

  if (!state || !state.tomador) {
    return res.status(400).json({ success: false, code: 'MISSING_STATE', message: 'state.tomador requerido.' });
  }
  if (!cplan) {
    return res.status(400).json({ success: false, code: 'MISSING_PLAN', message: 'Debe seleccionar un plan funerario (selectedPlan.cplan).' });
  }

  const ifrecuencia = frecuencia || funeral.frecuencia || 'M';
  const asegurados = personasMapper.buildAseguradosForQuote(funeral);

  if (asegurados.length === 0) {
    return res.status(400).json({ success: false, code: 'MISSING_INSURED', message: 'Debe registrar al menos un asegurado.' });
  }
  const invalid = asegurados.find((a) => !a.xrif_asegurado || a.nedad_asegurado == null);
  if (invalid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_INSURED',
      message: 'Cada asegurado requiere identificación y fecha de nacimiento válidas.',
    });
  }

  try {
    // 1. Cotiza para obtener la prima autoritativa.
    const cotizacion = await personasClient.getCotizacionPer({ cramo, cplan, asegurados, ifrecuencia });

    // 2. Valida titular/plan (paso 5 — speeValidatePersonGeneral).
    const validatePayload = personasMapper.buildValidateEmissionPersonRequest(state, {
      plan: cplan,
      frecuencia: ifrecuencia,
    });
    if (!validatePayload.rif_titular || !validatePayload.fnac_titular) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TITULAR',
        message: 'Titular requiere identificación y fecha de nacimiento válidas.',
        stage: 'validate',
      });
    }
    await personasClient.validateEmissionPerson(validatePayload);

    // 3. Construye el payload de emisión y emite.
    const { payload, metadata } = personasMapper.buildEmissionPersonRequest(
      state,
      cotizacion,
      { plan: cplan, frecuencia: ifrecuencia },
    );

    const meta = state.metadataCanal || {};
    console.log(
      `[personas/emision] metadataCanal cproductor=${meta.cproductor ?? 'default'} cusuario=${meta.cusuario ?? 'default'} canal=${meta.canal ?? 'default'} cgestor_in=${meta.cgestor_in ?? 'none'} jwtKeys=${Object.keys(req.nexusMetadata || {}).join(',') || 'none'}`,
    );

    const emitted = await personasClient.createEmissionPerson(payload);

    const emitMetadata = { ...metadata };
    const url_ingreso_caja = await resolveIngresoCajaAfterPayment(state, {
      cnrecibo: emitted.cnrecibo,
      mpagoFallback: cotizacion.mprima,
      metadata: emitMetadata,
    });
    if (url_ingreso_caja) {
      console.log(`[personas/emision] URL ingreso caja: ${url_ingreso_caja}`);
    }

    const emissionRecord = {
      cnpoliza: emitted.cnpoliza,
      cnrecibo: emitted.cnrecibo,
      urlpoliza: emitted.urlpoliza,
      url_ingreso_caja,
      emittedAt: new Date().toISOString(),
      quote: {
        mprima: cotizacion.mprima,
        mprimaext: cotizacion.mprimaext,
        ptasa: cotizacion.ptasa,
      },
    };
    const funeralRefs = resolveFuneralRefs(state);
    try {
      const saved = await recordFuneralEmissionFlexible(funeralRefs, emissionRecord);
      if (!saved) {
        console.warn(
          `[personas/emision] póliza ${emissionRecord.cnpoliza} sin historial`
          + ` (id=${funeralRefs.submissionId || '-'} sid=${funeralRefs.paymentSid || '-'}`
          + ` session=${funeralRefs.sessionId || '-'})`,
        );
      } else {
        console.log(
          `[personas/emision] historial funerario id=${saved.id} empresa=${saved.empresaId}`
          + ` cnpoliza=${saved.cnpoliza}`,
        );
      }
    } catch (err) {
      console.warn('[personas/emision] no se pudo guardar URL en historial:', err?.message || err);
    }

    return res.status(201).json({
      success: true,
      message: 'Póliza funeraria emitida exitosamente.',
      policy: {
        number: emitted.cnpoliza,
        cnpoliza: emitted.cnpoliza,
        cnrecibo: emitted.cnrecibo,
        urlpoliza: emitted.urlpoliza,
        url_ingreso_caja,
        ncuota: emitted.ncuota,
        internalPolicyId: metadata.internalPolicyId,
        emittedAt: new Date().toISOString(),
        quote: {
          mprima: cotizacion.mprima,
          mprimaext: cotizacion.mprimaext,
          ptasa: cotizacion.ptasa,
        },
        metadata: emitMetadata,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const httpStatus = err.httpStatus || 502;
    console.error('[personas/emision]', err.code || '', msg);
    return res.status(httpStatus).json({
      success: false,
      code: err.code || 'LAMUNDIAL_PERSON_ERROR',
      message: msg,
      ...(err.endpoint ? { endpoint: err.endpoint } : {}),
      stage: 'emit',
    });
  }
});

module.exports = router;
