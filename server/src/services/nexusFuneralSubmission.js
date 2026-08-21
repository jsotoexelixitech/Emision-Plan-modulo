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

module.exports = { createFuneralSubmission };
