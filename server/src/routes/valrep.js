/**
 * /api/valrep — Catálogos de estados, ciudades y dominios.
 *
 * Fuente única: nest-api (:3002).
 */
const express = require('express');
const {
  getValrepStates,
  getValrepCities,
  getValrepList,
  getValrepFrecuencias,
  validateEmissionAutoViaNestApi,
} = require('../services/nestApiClient');

const router = express.Router();

const ALLOWED_LIST_DOMAINS = ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'];

const LIST_FALLBACKS = {
  SEXO: [
    { code: 'M', label: 'Masculino' },
    { code: 'F', label: 'Femenino' },
  ],
  EDOCIVIL: [
    { code: 'S', label: 'Soltero(a)' },
    { code: 'C', label: 'Casado(a)' },
    { code: 'D', label: 'Divorciado(a)' },
    { code: 'V', label: 'Viudo(a)' },
  ],
  PARENTESCOS: [
    { code: 'T', label: 'TITULAR' },
    { code: 'C', label: 'CONYUGE' },
    { code: 'H', label: 'HIJO(A)' },
  ],
};

function logError(tag, err) {
  console.error(`[valrep/${tag}]`, err?.response?.status, err?.message);
}

router.get('/state', async (_req, res) => {
  try {
    const items = await getValrepStates();
    res.json({ ok: true, source: 'nest-api', items });
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
      source: 'nest-api',
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
    let items = await getValrepList(domain);
    if (!items.length && LIST_FALLBACKS[domain]) {
      items = LIST_FALLBACKS[domain];
    }
    res.json({ ok: true, domain, source: 'nest-api', items });
  } catch (err) {
    logError(`list/${domain}`, err);
    if (LIST_FALLBACKS[domain]) {
      return res.json({ ok: true, domain, source: 'fallback', items: LIST_FALLBACKS[domain] });
    }
    res.status(502).json({ ok: false, error: `No se pudo obtener la lista ${domain}` });
  }
});

router.post('/validate-vehicle', async (req, res) => {
  try {
    const { placa, serial, serialMotor, plan } = req.body ?? {};
    const result = await validateEmissionAutoViaNestApi({
      plan: plan || process.env.LAMUNDIAL_PLAN_DEFAULT || 'RCVBAS',
      placa,
      serial_carroceria: serial,
      serial_motor: serialMotor || serial,
    });
    res.json(result);
  } catch (err) {
    if (
      err.code === 'PLATE_ALREADY_INSURED'
      || err.code === 'SERIAL_ALREADY_INSURED'
      || err.code === 'VEHICLE_ALREADY_INSURED'
    ) {
      return res.status(400).json({
        success: false,
        code: err.code,
        message: err.message || 'Este vehículo ya cuenta con una póliza vigente.',
        error: err.message || 'Este vehículo ya cuenta con una póliza vigente.',
      });
    }
    if (err.code === 'INVALID_PLACA_FORMAT' || err.code === 'INVALID_SERIAL_FORMAT') {
      return res.status(400).json({
        success: false,
        code: err.code,
        message: err.message,
        error: err.message,
      });
    }
    logError('validate-vehicle', err);
    const msg = err.message || 'Error validando vehículo en nest-api';
    res.status(502).json({
      success: false,
      code: err.code || 'NEST_API_VALIDATE_ERROR',
      message: msg,
      error: msg,
    });
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
