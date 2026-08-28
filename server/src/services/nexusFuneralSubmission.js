/**
 * Cliente Nexus — solicitudes funerario (revisión técnica).
 */

function nexusBases() {
  const primary = (process.env.NEXUS_API_URL || 'http://127.0.0.1:3092').replace(/\/$/, '');
  const bases = [primary];
  if (!primary.includes('127.0.0.1') && !primary.includes('localhost')) {
    bases.push('http://127.0.0.1:3092');
  }
  return bases;
}

function getApiKey() {
  return (
    process.env.NEXUS_API_KEY ||
    process.env.NEXUS_SERVICE_API_KEY ||
    ''
  );
}

/**
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function createFuneralSubmission(payload) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('NEXUS_API_KEY no configurada en emision-api');
    err.code = 'NEXUS_API_KEY_MISSING';
    throw err;
  }

  let lastErr = '';
  for (const base of nexusBases()) {
    const url = `${base}/api/funeral-submissions`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = body?.message || `HTTP ${res.status}`;
        continue;
      }
      return body.data;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  const err = new Error(`No se pudo registrar solicitud en Nexus: ${lastErr}`);
  err.code = 'NEXUS_SUBMISSION_ERROR';
  throw err;
}

/**
 * Registra póliza emitida en la solicitud funerario (estado paid + snapshot.emission).
 * @param {string} submissionId
 * @param {object} emission
 * @returns {Promise<object|null>}
 */
async function recordFuneralEmission(submissionId, emission) {
  const apiKey = getApiKey();
  if (!apiKey || !submissionId) return null;

  const payload = {
    cnpoliza: emission.cnpoliza,
    cnrecibo: emission.cnrecibo,
    urlpoliza: emission.urlpoliza,
    url_ingreso_caja: emission.url_ingreso_caja,
    url_conductor_habitual: emission.url_conductor_habitual,
    url_club_arys: emission.url_club_arys,
    emittedAt: emission.emittedAt,
    quote: emission.quote,
    empresaId: emission.empresaId,
  };

  let lastErr = '';
  for (const base of nexusBases()) {
    const url = `${base}/api/funeral-submissions/${encodeURIComponent(submissionId)}/emission`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = body?.message || `HTTP ${res.status}`;
        continue;
      }
      return body.data ?? null;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  console.warn(`[nexusFuneralSubmission] emission ${submissionId}: ${lastErr}`);
  return null;
}

module.exports = { createFuneralSubmission, recordFuneralEmission };
