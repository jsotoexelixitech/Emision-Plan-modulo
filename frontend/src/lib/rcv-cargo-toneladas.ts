/** Categoría Sis2000 “Más de 12 TM” — paridad SysIP vehicle-form (grupo.id == 11). */
export const CCATEGORIA_USO_TONELADAS = 11;

/** Mínimo efectivo cuando categoría 11 y valor < 12 (validateTA legacy). */
export const TONELADAS_MIN_LEGACY = 13;

export function isCategoriaToneladas(ccategoria_uso?: number | string | null): boolean {
  if (ccategoria_uso == null || ccategoria_uso === '') return false;
  return Number(ccategoria_uso) === CCATEGORIA_USO_TONELADAS;
}

/** Normaliza toneladas para categoría 11; fuera de 11 devuelve undefined (no enviar al SP). */
export function normalizeToneladasForCategoria(
  ccategoria_uso: number | string | undefined,
  raw: number | string | undefined | null,
): number | undefined {
  if (!isCategoriaToneladas(ccategoria_uso)) return undefined;
  const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(n) || n < 12) return TONELADAS_MIN_LEGACY;
  return n;
}
