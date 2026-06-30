/** Utilidades compartidas: base path HTTPS (cierrelmds) en vite.config. */

/** Normaliza VITE_APP_BASE a formato Vite (`/` o `/ocr/`). */
export function resolveAppBase(env: Record<string, string>): string {
  const raw = env.VITE_APP_BASE?.trim() || '/';
  if (raw === '/') return '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** Prefija rutas de proxy cuando la app se sirve bajo un subpath. */
export function prefixDevProxy(
  base: string,
  routes: Record<string, { target: string; changeOrigin?: boolean }>,
): Record<
  string,
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
> {
  if (base === '/') return routes;

  const root = base.replace(/\/$/, '');
  const out: Record<
    string,
    { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
  > = {};

  for (const [path, cfg] of Object.entries(routes)) {
    out[`${root}${path}`] = {
      ...cfg,
      rewrite: (p: string) => p.slice(root.length) || '/',
    };
  }

  return out;
}
