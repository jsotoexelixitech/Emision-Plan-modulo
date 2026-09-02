/** Flujo encadenado Nexus (OCR → Formulario → Emisión → Pagos) con ?sid= en la URL. */
export function isBridgeChained(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(new URLSearchParams(window.location.search).get('sid'));
}
