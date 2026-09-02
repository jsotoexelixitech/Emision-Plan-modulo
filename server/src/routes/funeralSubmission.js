/**
 * Solicitudes funerario — scoring + registro en Nexus (revisión técnica).
 *
 * POST /api/funeral/submissions → valida póliza vigente, score y crea solicitud pending
 */
const express = require('express');
const { resolveQuestionsForPlan } = require('../config/funeralHealthQuestions');
const { computeHealthScore } = require('../lib/funeralHealthScoring');
const { upsertHealthAnswers } = require('../services/healthDb');
const { createFuneralSubmission } = require('../services/nexusFuneralSubmission');
const { assertPersonasCanEmit } = require('../services/assertPersonasCanEmit');
const { isFunerarioCplan } = require('../lib/funerarioPlan');
const { resolveCanalKey } = require('../lib/canalKey');

const router = express.Router();

function pickTomadorNombre(tomador) {
  if (!tomador || typeof tomador !== 'object') return '';
  const n = [tomador.nombre, tomador.apellido].filter(Boolean).join(' ').trim();
  return n || String(tomador.razonSocial ?? '').trim();
}

function pickTomadorRif(tomador) {
  if (!tomador || typeof tomador !== 'object') return '';
  const tipo = String(tomador.tipoDoc ?? 'V').trim();
  const id = String(tomador.identificacion ?? '').trim();
  if (!id) return '';
  return `${tipo}-${id}`;
}

router.post('/submissions', async (req, res) => {
  const body = req.body ?? {};
  const sessionId = String(body.sessionId ?? '').trim();
  const cplan = String(body.cplan ?? body.selectedPlan?.cplan ?? '').trim();
  const answers =
    body.healthAnswers && typeof body.healthAnswers === 'object'
      ? body.healthAnswers
      : body.answers;

  if (!sessionId || !cplan) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'sessionId y cplan son obligatorios.',
    });
  }

  if (!isFunerarioCplan(cplan)) {
    return res.status(400).json({
      success: false,
      code: 'NOT_FUNERARIO_PLAN',
      message: `El cplan "${cplan}" no es un plan funerario.`,
    });
  }

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_ANSWERS',
      message: 'Debe enviar healthAnswers con las respuestas del cuestionario.',
    });
  }

  const empresaId =
    Number(req.empresa?.id ?? body.empresaId ?? process.env.EMPRESA_ID ?? 1) || 1;

  const metadata = {
    ...(req.nexusMetadata && typeof req.nexusMetadata === 'object' ? req.nexusMetadata : {}),
    ...(body.metadataCanal && typeof body.metadataCanal === 'object' ? body.metadataCanal : {}),
  };
  const canal = resolveCanalKey(metadata);

  const tomador = body.tomador ?? {};
  const selectedPlan = body.selectedPlan ?? {};
  const cramo = body.cramo != null ? Number(body.cramo) : 9;
  const planName = String(selectedPlan.name ?? body.planName ?? '').trim() || null;
  const tomadorRif = pickTomadorRif(tomador) || body.tomadorRif;
  const tomadorNombre = pickTomadorNombre(tomador) || body.tomadorNombre;
  const tomadorEmail = String(tomador.email ?? body.tomadorEmail ?? '').trim() || null;

  try {
    // Gate Sis2000: si ya hay póliza vigente, no crear solicitud ni avisar al técnico.
    await assertPersonasCanEmit(
      {
        tomador,
        funeral: body.funeral,
        selectedPlan,
        metadataCanal: body.metadataCanal ?? metadata,
      },
      { plan: cplan },
    );

    const { questions } = await resolveQuestionsForPlan(cplan, {
      empresaId,
      metadata,
    });

    const scoring = computeHealthScore(questions, answers);

    if (scoring.blocked) {
      return res.status(422).json({
        success: false,
        code: 'HEALTH_BLOCKED',
        message:
          scoring.blockReason ||
          'La solicitud no cumple los criterios del cuestionario de salud.',
        scoring: {
          total: scoring.total,
          breakdown: scoring.breakdown,
          blocked: true,
          blockReason: scoring.blockReason,
        },
      });
    }

    upsertHealthAnswers({
      sessionId,
      cplan,
      cramo,
      tomadorRif: tomadorRif || undefined,
      planName: planName || undefined,
      answers,
    });

    const snapshot = {
      tomador: body.tomador ?? null,
      asegurado: body.asegurado ?? null,
      sameInsured: body.sameInsured,
      hasBeneficiary: body.hasBeneficiary,
      beneficiario: body.beneficiario ?? null,
      funeral: body.funeral ?? null,
      selectedPlan: body.selectedPlan ?? null,
      quote: body.quote ?? null,
      quoteState: body.quoteState ?? null,
      documents: body.documents ?? null,
      metadataCanal: body.metadataCanal ?? metadata,
      product: 'funerario',
    };

    const submission = await createFuneralSubmission({
      empresaId,
      sessionId,
      canal,
      tomadorRif: tomadorRif || undefined,
      tomadorNombre: tomadorNombre || undefined,
      tomadorEmail: tomadorEmail || undefined,
      cplan,
      planName: planName || undefined,
      cramo,
      scoreTotal: scoring.total,
      scoreBreakdown: scoring.breakdown,
      healthAnswers: answers,
      snapshot,
    });

    return res.status(201).json({
      success: true,
      submission,
      scoring: {
        total: scoring.total,
        breakdown: scoring.breakdown,
        blocked: scoring.blocked,
        blockReason: scoring.blockReason,
      },
      message:
        'Solicitud registrada. Un técnico revisará tu caso antes de continuar al pago.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === 'object' && 'code' in err ? err.code : 'SUBMISSION_ERROR';
    const httpStatus =
      (err && typeof err === 'object' && Number(err.httpStatus)) ||
      (code === 'NEXUS_API_KEY_MISSING' ? 503 : 500);
    console.error('[funeral/submissions]', code || '', msg);
    return res.status(httpStatus).json({
      success: false,
      code,
      message: msg,
      stage: 'validate',
    });
  }
});

module.exports = router;
