/**
 * Cuestionario de salud funerario — preguntas por plan y persistencia en BD local.
 *
 *   GET  /api/funeral/health-questions?cplan=XXX  → preguntas según plan
 *   POST /api/funeral/health-answers              → guardar respuestas
 *   GET  /api/funeral/health-answers?sessionId=&cplan=  → recuperar (opcional)
 */
const express = require('express');
const { getQuestionsForPlan } = require('../config/funeralHealthQuestions');
const { upsertHealthAnswers, getHealthAnswers } = require('../services/healthDb');

const router = express.Router();

router.get('/health-questions', (req, res) => {
  const cplan = String(req.query.cplan || '').trim();
  if (!cplan) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_PLAN',
      message: 'El parámetro cplan es obligatorio.',
    });
  }
  const questions = getQuestionsForPlan(cplan);
  res.json({ success: true, cplan, questions });
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
