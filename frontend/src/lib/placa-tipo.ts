/** Normaliza placa para comparación (sin espacios ni guiones). */
export function normalizePlaca(placa?: string | null): string {
  return String(placa ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/** Formato INTT Venezuela (ej. AC124KB, AB12345). */
export function looksLikeVePlacaNacional(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (!p) return false;
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{2}\d{5}$/.test(p);
}

/** Formato Colombia (ej. SLP935, WON028) — flujo binacional, no extranjera genérica. */
export function looksLikeCoPlaca(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (!p) return false;
  return /^[A-Z]{3}\d{2,3}[A-Z]?$/.test(p);
}

/** Placa extranjera genérica (no VE ni Colombia). */
export function looksLikePlacaExtranjeraGenerica(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (p.length < 4) return false;
  if (looksLikeVePlacaNacional(p)) return false;
  if (looksLikeCoPlaca(p)) return false;
  return /[A-Z]/.test(p) && /\d/.test(p);
}

type CertHint = { tipoPlaca?: string; placa?: string };

/**
 * Bloquea selector en Extranjera cuando OCR o la placa indican emisión extranjera.
 * Colombia (SLP935) no fuerza extranjera — ahí el usuario elige binacional.
 */
export function shouldLockTipoPlacaExtranjera(
  placa?: string | null,
  cert?: CertHint | null,
): boolean {
  const ocrTipo = String(cert?.tipoPlaca ?? '').toLowerCase().trim();
  if (ocrTipo === 'extranjera') return true;
  const p = normalizePlaca(placa || cert?.placa);
  return looksLikePlacaExtranjeraGenerica(p);
}

export function placaPlaceholder(tipoPlaca: string): string {
  if (tipoPlaca === 'binacional') return 'SLP935';
  if (tipoPlaca === 'extranjera') return 'ABC-1234';
  return 'AE123KT';
}

export function placaMaxLength(tipoPlaca: string): number {
  return tipoPlaca === 'nacional' ? 8 : 12;
}
