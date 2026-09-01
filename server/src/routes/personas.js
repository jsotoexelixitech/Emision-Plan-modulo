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
const { assertPersonasCanEmit } = require('../services/assertPersonasCanEmit');
const { resolveIngresoCajaAfterPayment } = require('../services/collectionAfterPayment');
const { recordFuneralEmission } = require('../services/nexusFuneralSubmission');

const router = express.Router();

const DEFAULT_RAMO = parseInt(process.env.LAMUNDIAL_RAMO_PERSON, 10) || 9;

/** Calcula la edad (años cumplidos) a partir de una fecha ISO (yyyy-mm-dd). */
function edadDesdeFecha(fechaIso) {
  if (!fechaIso) return null;
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

/**
 * Normaliza un asegurado del front al formato de la API:
 *   { cparen, xrif_asegurado, nedad_asegurado }
 * Acepta tanto el formato API como el formato amigable del wizard.
 */
function mapAsegurado(a) {
  const cparen = Number(a.cparen ?? a.parentesco ?? 0) || 0;
  const xrif = String(a.xrif_asegurado ?? a.identificacion ?? '').replace(/\D/g, '');
  const nedad =
    a.nedad_asegurado != null
      ? Number(a.nedad_asegurado)
      : edadDesdeFecha(a.fechaNac ?? a.fnac ?? a.fecha_nacimiento);
  return { cparen, xrif_asegurado: xrif, nedad_asegurado: nedad };
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
    console.error('[personas/cotizacion]', msg);
    res.status(502).json({
      success: false,
      code: err.code || 'LAMUNDIAL_PERSON_ERROR',
      message: `No se pudo cotizar: ${msg}`,
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
  const cplan = bodyPlan || state?.selectedPlan?.cplan;

  try {
    const validation = await assertPersonasCanEmit(state, { plan: cplan });
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
  const { state, frecuencia } = req.body || {};
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

    const submissionId = String(state?.funeralSubmissionId ?? '').trim();
    if (submissionId) {
      recordFuneralEmission(submissionId, {
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
      }).catch(() => {});
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
