/** Base normalizada del módulo (Vite `base`). Ej. `/` o `/emision/`. */
function normalizedBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

/** Base URL del módulo (Vite `base`). Ej. `/emision/` → API en `/emision/api`. */
export function moduleApiBase(): string {
  return `${normalizedBase()}api`;
}

/**
 * Ruta de un archivo en `public/` respetando el prefijo de despliegue.
 * Ej. publicAsset('logo.png') → `/emision/logo.png` cuando base es `/emision/`.
 */
export function publicAsset(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${normalizedBase()}${clean}`;
}
