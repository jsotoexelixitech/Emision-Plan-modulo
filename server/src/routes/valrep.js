/**
 * /api/valrep — Catálogos de estados, ciudades y dominios.
 *
 * Fuente única: sysip-nest-api (:3002).
 */
const express = require('express');
const {
  getValrepStates,
  getValrepCities,
  getValrepList,
  getValrepFrecuencias,
} = require('../services/sysipClient');

const router = express.Router();

const ALLOWED_LIST_DOMAINS = ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'];

function logError(tag, err) {
  console.error(`[valrep/${tag}]`, err?.response?.status, err?.message);
}

router.get('/state', async (_req, res) => {
  try {
    const items = await getValrepStates();
    res.json({ ok: true, source: 'sysip-nest-api', items });
  } catch (err) {
    logError('state', err);
    res.status(502).json({ ok: false, error: 'No se pudo obtener estados' });
  }
});

router.get('/city', async (req, res) => {
  const cestado = req.query.cestado ?? req.query.estado ?? null;
  try {
    const items = await getValrepCities(cestado ? parseInt(String(cestado), 10) : null);
    res.json({
      ok: true,
      source: 'sysip-nest-api',
      cestado: cestado ? parseInt(String(cestado), 10) : null,
      items,
    });
  } catch (err) {
    logError('city', err);
    res.status(502).json({ ok: false, error: 'No se pudo obtener ciudades' });
  }
});

router.get('/list/:domain', async (req, res) => {
  const domain = (req.params.domain || '').toUpperCase();
  if (!ALLOWED_LIST_DOMAINS.includes(domain)) {
    return res.status(400).json({
      ok: false,
      error: `Dominio no permitido: ${domain}. Válidos: ${ALLOWED_LIST_DOMAINS.join(', ')}`,
    });
  }

  try {
    const items = await getValrepList(domain);
    res.json({ ok: true, domain, source: 'sysip-nest-api', items });
  } catch (err) {
    logError(`list/${domain}`, err);
    res.status(502).json({ ok: false, error: `No se pudo obtener la lista ${domain}` });
  }
});

router.post('/frecuencia', async (req, res) => {
  try {
    const { cplan, cramo } = req.body;
    const items = await getValrepFrecuencias(cplan, cramo);
    res.json({ ok: true, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[valrep/frecuencia]', msg);
    res.status(502).json({
      ok: false,
      error: 'No se pudo conectar con el servicio de frecuencias',
      detail: msg,
    });
  }
});

module.exports = router;
