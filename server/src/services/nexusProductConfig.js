/**
 * Lee product-config de Nexus API (parametrizador).
 */

function nexusBases() {
  const primary = (process.env.NEXUS_API_URL || 'http://127.0.0.1:3092').replace(/\/$/, '');
  const bases = [primary];
  // Fallback local si el .env apunta a IP y falla
  if (!primary.includes('127.0.0.1') && !primary.includes('localhost')) {
    bases.push('http://127.0.0.1:3092');
  }
  return bases;
}

/** @type {Map<string, { at: number, data: object|null }>} */
const cache = new Map();
const TTL_MS = 5_000;

/**
 * @param {number} empresaId
 * @param {'rcv'|'funerario'} producto
 * @param {'ocr'|'formulario'|'emision'|'pagos'} modulo
 * @param {{ bypassCache?: boolean }} [opts]
 * @returns {Promise<object|null>}
 */
async function fetchProductConfig(empresaId, producto, modulo, opts = {}) {
  const key = `${empresaId}:${producto}:${modulo}`;
  if (!opts.bypassCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  }

  let lastErr = '';
  for (const base of nexusBases()) {
    const url = `${base}/api/config/${empresaId}/${producto}/${modulo}?_=${Date.now()}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${url}`;
        console.warn(`[nexusProductConfig] ${lastErr}`);
        continue;
      }
      const body = await res.json();
      const data = body?.success ? (body.data ?? null) : null;
      cache.set(key, { at: Date.now(), data });
      if (data && Array.isArray(data.healthQuestions)) {
        console.log(
          `[nexusProductConfig] OK ${producto}/${modulo} empresa=${empresaId} healthQuestions=${data.healthQuestions.length} via ${base}`,
        );
      }
      return data;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[nexusProductConfig] ${url} → ${lastErr}`);
    }
  }

  cache.set(key, { at: Date.now(), data: null });
  console.warn(`[nexusProductConfig] sin config (${lastErr})`);
  return null;
}

function clearProductConfigCache() {
  cache.clear();
}

module.exports = { fetchProductConfig, clearProductConfigCache };
