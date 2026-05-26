/**
 * Matching tolerante de valores OCR contra opciones de catálogo de La Mundial.
 *
 * Problema: Gemini extrae `"Soltero(a)"` o `"Femenino"` de la cédula, pero
 * el catálogo Valrep devuelve `"SOLTERO"` / `"FEMENINO"` (mayúsculas, sin "(a)").
 * Si pasamos el valor crudo al `<SearchSelect>` no encuentra match y queda vacío.
 *
 * Estrategia (en orden de prioridad):
 *   1. Match exacto case-insensitive contra `value` o `label`.
 *   2. Match normalizado: quita acentos, paréntesis, espacios y "/a", compara
 *      como prefijo en ambas direcciones (OCR ⊂ Catálogo o Catálogo ⊂ OCR).
 *   3. Match por inicial (S, C, D, V) cuando OCR/Catálogo comparten primera letra.
 *
 * Si nada matchea, se devuelve el valor original tal cual: es mejor que el
 * usuario vea el dato del OCR (aunque no esté en el dropdown) y lo corrija,
 * que perderlo silenciosamente.
 */

export interface CatalogOption {
  value: string;
  label: string;
}

/** Normaliza un texto para matching: minúsculas, sin acentos, sin puntuación. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .replace(/\(a\)/g, '')             // "soltero(a)" -> "soltero"
    .replace(/\/a$/g, '')              // "soltero/a"  -> "soltero"
    .replace(/[^a-z0-9]/g, '')         // quita lo demás
    .trim();
}

export function matchCatalog(
  raw: string | undefined | null,
  options: CatalogOption[],
): string {
  if (!raw) return '';
  const value = String(raw).trim();
  if (!value) return '';
  if (options.length === 0) return value;

  const normRaw = normalize(value);
  if (!normRaw) return value;

  // 1) Exacto (case insensitive)
  for (const o of options) {
    if (
      o.value.toLowerCase() === value.toLowerCase() ||
      o.label.toLowerCase() === value.toLowerCase()
    ) {
      return o.value;
    }
  }

  // 2) Prefijo normalizado (3+ caracteres significativos)
  if (normRaw.length >= 3) {
    for (const o of options) {
      const normLabel = normalize(o.label);
      if (!normLabel) continue;
      if (normLabel.startsWith(normRaw) || normRaw.startsWith(normLabel)) {
        return o.value;
      }
    }
  }

  // 3) Misma inicial (último recurso para S/C/D/V o M/F)
  const initial = normRaw.charAt(0);
  if (initial) {
    for (const o of options) {
      if (normalize(o.label).startsWith(initial)) {
        return o.value;
      }
    }
  }

  return value;
}
