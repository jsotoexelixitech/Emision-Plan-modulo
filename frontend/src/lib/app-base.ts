/** Base URL del módulo (Vite `base`). Ej. `/ocr/` → API en `/ocr/api`. */
export function moduleApiBase(): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
  return `${base}api`;
}
