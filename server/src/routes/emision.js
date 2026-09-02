/**
 * Rutas del modulo Emision.
 *
 * Cubre el ciclo completo:
 *   - POST /api/policies/quote → cotiza la prima sin emitir.
 *   - POST /api/policies/emit  → cotiza y emite la poliza con La Mundial.
 *
 * Body esperado (NUEVO formato):
 *   { state: { tomador, vehicle, payment? }, plan?: 'RCVBAS', frecuencia?: 'A' }
 *
 * Tambien acepta el formato legacy `{ tomador, plan, payment }` y devuelve
 * un mock para no romper integraciones viejas.
 */
const express = require('express');
const policyService = require('../services/policyService');
const { clasificarDiligencia } = require('../services/diligenciaService');

const router = express.Router();

/** Fusiona metadata SSO del JWT (nexusAuth) en state.metadataCanal. */
function withNexusMetadata(state, nexusMetadata) {
  if (!state || typeof state !== 'object') return state;
  const actorKeys = ['cgestor', 'cgestor_in', 'centidad', 'citem', 'cproductor', 'ccanalalt_in', 'cscanalalt_in'];
  const baseMeta = state.metadataCanal && typeof state.metadataCanal === 'object'
    ? state.metadataCanal
    : {};
  const jwtMeta = nexusMetadata && typeof nexusMetadata === 'object' ? nexusMetadata : {};
  const mergedMeta = { ...baseMeta, ...jwtMeta };

  for (const key of actorKeys) {
    const fromJwt = jwtMeta[key];
    const fromState = baseMeta[key];
    const val = fromJwt != null && String(fromJwt).trim() !== ''
      ? fromJwt
      : fromState;
    if (val != null && String(val).trim() !== '') {
      mergedMeta[key] = val;
    }
  }

  return { ...state, metadataCanal: mergedMeta };
}

/**
 * @openapi
 * /api/policies/quote:
 *   post:
 *     tags: [Pólizas]
 *     summary: Cotiza la prima sin emitir
 *     description: |
 *       Consulta la prima vigente con La Mundial de Seguros para el vehículo y plan indicados.
 *       No genera ningún número de póliza. Útil para mostrar el precio al cliente antes de pagar.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [state]
 *             properties:
 *               state:
 *                 $ref: '#/components/schemas/WizardState'
 *               plan:
 *                 type: string
 *                 default: RCVBAS
 *                 description: Código del plan en La Mundial
 *               frecuencia:
 *                 type: string
 *                 enum: [A, S, T, M]
 *                 default: A
 *                 description: A=Anual, S=Semestral, T=Trimestral, M=Mensual
 *     responses:
 *       200:
 *         description: Prima calculada exitosamente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/QuoteResponse' }
 *       400:
 *         description: Datos insuficientes
 *       502:
 *         description: Error de comunicación con La Mundial
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/policies/emit:
 *   post:
 *     tags: [Pólizas]
 *     summary: Cotiza y emite la póliza RCV
 *     description: |
 *       Flujo completo en un solo llamado:
 *       1. Valida el payload contra el schema esperado por La Mundial.
 *       2. Realiza la cotización.
 *       3. Emite la póliza y retorna número, recibo y URL del PDF.
 *
 *       **Nota:** Este endpoint es llamado por el Módulo Pagos después de confirmar el pago.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [state]
 *             properties:
 *               state:
 *                 $ref: '#/components/schemas/WizardState'
 *               plan:
 *                 type: string
 *                 default: RCVBAS
 *               frecuencia:
 *                 type: string
 *                 default: A
 *     responses:
 *       201:
 *         description: Póliza emitida exitosamente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/EmitResponse' }
 *       400:
 *         description: Payload inválido o incompleto
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       502:
 *         description: Error con La Mundial (placa asegurada, SP desactualizado, red…)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/policies/quote', async (req, res) => {
  try {
    const { state, plan } = req.body || {};
    if (!state || !state.vehicle) {
      return res.status(400).json({ success: false, code: 'MISSING_STATE', message: 'state.vehicle requerido.' });
    }
    const result = await policyService.quote(withNexusMetadata(state, req.nexusMetadata), { plan });
    return res.status(200).json({
      success: true,
      mprima: result.mprima,
      mprimaext: result.mprimaext,
      ptasa: result.ptasa,
      coberturas: result.coberturas,
      metadata: result.metadata,
    });
  } catch (err) {
    return _send(res, err, 'quote');
  }
});

router.post('/policies/clasificar-diligencia', async (req, res) => {
  try {
    const { state, plan, mprima, ptasa, diligenciaConfig } = req.body || {};
    const tomador = state?.tomador || {};
    const planCode = plan || state?.selectedPlan?.cplan || '';
    const prima = mprima ?? state?.quote?.mprima;
    const tasa = ptasa ?? state?.quote?.ptasa;

    const result = clasificarDiligencia({
      tipoDoc: tomador.tipoDoc,
      planCode,
      mprima: prima,
      ptasa: tasa,
      diligenciaConfig,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return _send(res, err, 'clasificar-diligencia');
  }
});

router.post('/policies/emit', async (req, res) => {
  try {
    const { state, plan, frecuencia, ndias } = req.body || {};
    if (!state || !state.vehicle || !state.tomador) {
      const { tomador, plan: legacyPlan, payment } = req.body || {};
      if (!tomador || !legacyPlan || !payment) {
        return res.status(400).json({ success: false, code: 'MISSING_STATE', message: 'Datos incompletos. Envia { state }.' });
      }
      const policyNumber = `LM-2026-${String(Math.floor(100000 + Math.random() * 899999))}`;
      return res.status(201).json({
        success: true, message: 'Poliza emitida (modo legacy/mock).',
        policy: {
          number: policyNumber, cnpoliza: policyNumber, cnrecibo: '',
          urlpoliza: '', internalPolicyId: `LEGACY-${Date.now()}`,
          holder: `${tomador.nombre} ${tomador.apellido}`,
          plan: legacyPlan.name, price: legacyPlan.price,
          emittedAt: new Date().toISOString(),
        },
      });
    }

    const mergedState = withNexusMetadata(state, req.nexusMetadata);
    const meta = mergedState.metadataCanal || {};
    console.log(
      `[modulo-emision/emit] metadataCanal centidad=${meta.centidad ?? '?'} citem=${meta.citem ?? '?'} cproductor=${meta.cproductor ?? 'default'} cusuario=${meta.cusuario ?? meta.cusuario_planes ?? 'default'} cgestor=${meta.cgestor ?? 'none'} jwtKeys=${Object.keys(req.nexusMetadata || {}).join(',') || 'none'}`,
    );

    const result = await policyService.quoteAndEmit(mergedState, {
      plan,
      frecuencia: frecuencia || state?.rcv?.frecuencia,
      ndias: ndias ?? state?.rcv?.ndias,
    });
    return res.status(201).json({
      success: true, message: 'Poliza emitida exitosamente.',
      policy: {
        number: result.cnpoliza,
        cnpoliza: result.cnpoliza,
        cnrecibo: result.cnrecibo,
        urlpoliza: result.urlpoliza,
        url_conductor_habitual: result.url_conductor_habitual,
        url_club_arys: result.url_club_arys,
        url_ingreso_caja: result.url_ingreso_caja,
        ncuota: result.ncuota,
        internalPolicyId: result.internalPolicyId,
        emittedAt: result.emittedAt,
        quote: result.quote,
        metadata: result.metadata,
      },
    });
  } catch (err) {
    return _send(res, err, 'emit');
  }
});

function _send(res, err, stage) {
  const code = err.code || 'POLICY_ERROR';
  const httpStatus = err.httpStatus || 502;
  const isOurError = err.name === 'PolicyError' || code.startsWith('LAMUNDIAL_') || code === 'INVALID_PAYLOAD';

  if (!isOurError) {
    console.error(`[modulo-emision/${stage}] uncaught:`, err);
    return res.status(500).json({ success: false, code: 'INTERNAL', message: 'Error interno emitiendo poliza.' });
  }

  console.warn(`[modulo-emision/${stage}] ${code} ${httpStatus} ${err.message}`);
  const detail =
    err.raw != null
      ? (typeof err.raw === 'string' ? err.raw.slice(0, 500) : err.raw)
      : undefined;
  return res.status(httpStatus).json({
    success: false, code, message: err.message,
    ...(err.details ? { details: err.details } : {}),
    ...(err.internalPolicyId ? { internalPolicyId: err.internalPolicyId } : {}),
    ...(detail ? { detail } : {}),
    ...(err.endpoint ? { endpoint: err.endpoint } : {}),
    stage,
  });
}

module.exports = router;
