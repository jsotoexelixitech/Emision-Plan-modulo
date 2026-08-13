/**
 * Cuestionario de salud funerario — preguntas por plan y persistencia en BD local.
 *
 *   GET  /api/funeral/health-questions?cplan=XXX  → preguntas según plan
 *   POST /api/funeral/health-answers              → guardar respuestas
 *   GET  /api/funeral/health-answers?sessionId=&cplan=  → recuperar (opcional)
 */
const express = require('express');
const { resolveQuestionsForPlan } = require('../config/funeralHealthQuestions');
const { upsertHealthAnswers, getHealthAnswers } = require('../services/healthDb');
const { isFunerarioCplan } = require('../lib/funerarioPlan');

const router = express.Router();

function rejectNonFunerarioPlan(res, cplan) {
  return res.status(400).json({
    success: false,
    code: 'NOT_FUNERARIO_PLAN',
    message: `El cplan "${cplan}" no corresponde a un plan funerario. Este endpoint es solo para ramo 9.`,
  });
}

router.get('/health-questions', async (req, res) => {
  const cplan = String(req.query.cplan || '').trim();
  if (!cplan) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_PLAN',
      message: 'El parámetro cplan es obligatorio.',
    });
  }
  if (!isFunerarioCplan(cplan)) {
    return rejectNonFunerarioPlan(res, cplan);
  }
  try {
    const empresaId =
      Number(
        req.empresa?.id ??
          req.query.empresaId ??
          process.env.EMPRESA_ID ??
          process.env.VITE_EMPRESA_ID ??
          1,
      ) || 1;
    const { questions, source } = await resolveQuestionsForPlan(cplan, { empresaId });
    res.json({ success: true, cplan, questions, source, count: questions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[funeral/health-questions]', msg);
    res.status(500).json({
      success: false,
      code: 'QUESTIONS_ERROR',
      message: `No se pudieron obtener las preguntas: ${msg}`,
    });
  }
});

router.post('/health-answers', (req, res) => {
  const {
    sessionId,
    cplan,
    cramo,
    tomadorRif,
    planName,
    answers,
  } = req.body || {};

  if (!sessionId || !cplan) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'sessionId y cplan son obligatorios.',
    });
  }
  if (!isFunerarioCplan(cplan)) {
    return rejectNonFunerarioPlan(res, cplan);
  }
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_ANSWERS',
      message: 'Debe enviar el objeto answers con las respuestas.',
    });
  }

  try {
    const result = upsertHealthAnswers({
      sessionId: String(sessionId),
      cplan: String(cplan),
      cramo: cramo != null ? Number(cramo) : undefined,
      tomadorRif: tomadorRif ? String(tomadorRif) : undefined,
      planName: planName ? String(planName) : undefined,
      answers,
    });
    res.status(result.updated ? 200 : 201).json({
      success: true,
      message: result.updated ? 'Respuestas actualizadas.' : 'Respuestas guardadas.',
      id: result.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[funeral/health-answers]', msg);
    res.status(500).json({
      success: false,
      code: 'DB_ERROR',
      message: `No se pudieron guardar las respuestas: ${msg}`,
    });
  }
});

router.get('/health-answers', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  const cplan = String(req.query.cplan || '').trim();
  if (!sessionId || !cplan) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: 'sessionId y cplan son obligatorios.',
    });
  }
  if (!isFunerarioCplan(cplan)) {
    return rejectNonFunerarioPlan(res, cplan);
  }
  const record = getHealthAnswers(sessionId, cplan);
  if (!record) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'No hay respuestas guardadas para esta sesión y plan.',
    });
  }
  res.json({ success: true, record });
});

module.exports = router;
