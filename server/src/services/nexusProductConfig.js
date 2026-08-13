/**
 * Lee product-config de Nexus API (parametrizador).
 * Cache corta para no golpear Nexus en cada GET de preguntas.
 */

const NEXUS_API = (process.env.NEXUS_API_URL || 'http://127.0.0.1:3092').replace(/\/$/, '');
const TTL_MS = 15_000;

/** @type {Map<string, { at: number, data: object|null }>} */
const cache = new Map();

/**
 * @param {number} empresaId
 * @param {'rcv'|'funerario'} producto
 * @param {'ocr'|'formulario'|'emision'|'pagos'} modulo
 * @returns {Promise<object|null>}
 */
async function fetchProductConfig(empresaId, producto, modulo) {
  const key = `${empresaId}:${producto}:${modulo}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = `${NEXUS_API}/api/config/${empresaId}/${producto}/${modulo}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[nexusProductConfig] HTTP ${res.status} ${url}`);
      cache.set(key, { at: Date.now(), data: null });
      return null;
    }
    const body = await res.json();
    const data = body?.success ? (body.data ?? null) : null;
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[nexusProductConfig] ${msg}`);
    cache.set(key, { at: Date.now(), data: null });
    return null;
  }
}

/** Invalida cache (p. ej. tras pruebas). */
function clearProductConfigCache() {
  cache.clear();
}

module.exports = { fetchProductConfig, clearProductConfigCache };
