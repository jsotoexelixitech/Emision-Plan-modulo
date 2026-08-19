/** Coberturas de casco (no RCV puro) — ocultas en QA. */
export const CASCO_COBER_CODES = new Set(['CA', 'PT', 'PP']);

/**
 * Entorno QA (srv001qa / nexusqa). Dev (cierrelmds) no aplica estas reglas.
 */
export function isQaDeploy(): boolean {
  const flag = import.meta.env.VITE_EXELIXI_QA;
  if (flag === '1' || flag === 'true') return true;
  if (typeof window !== 'undefined') {
    return /nexusqa\.exelixitech\.com/i.test(window.location.hostname);
  }
  return false;
}

export function filterRcvOnlyCoberturas<T extends { value: string }>(items: T[]): T[] {
  if (!isQaDeploy()) return items;
  return items.filter((c) => !CASCO_COBER_CODES.has(String(c.value).toUpperCase()));
}
