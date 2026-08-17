/** Utilidades compartidas: base path HTTPS (cierrelmds) en vite.config. */

export function resolveAppBase(env: Record<string, string>): string {
  const raw = env.VITE_APP_BASE?.trim() || '/';
  if (raw === './' || raw === '.') return './';
  if (raw === '/') return '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function isBackendProxyPath(pathname: string): boolean {
  return (
    /\/nexus-api(\/|$)/.test(pathname)
    || /\/api(\/|$)/.test(pathname)
    || /\/files(\/|$)/.test(pathname)
    || /\/docs(\/|$)/.test(pathname)
    || pathname.endsWith('/docs.json')
  );
}

export function resolvePublicModulePrefix(
  env: Record<string, string>,
  base: string,
): string {
  const deploy = env.VITE_DEPLOY_PREFIX?.trim();
  if (deploy) return deploy.replace(/\/$/, '');
  if (base !== '/' && base !== './') return base.replace(/\/$/, '');
  return '';
}

type ProxyRoutes = Record<
  string,
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
>;

function nexusProxyEntry(mount: string, nexusTarget: string) {
  const escaped = mount.replace(/\//g, '\\/');
  return {
    target: nexusTarget,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(new RegExp(`^${escaped}`), '') || '/',
  };
}

export function withNexusPreviewProxy(
  proxy: ProxyRoutes,
  modulePublicPrefix: string,
  nexusTarget = 'http://127.0.0.1:3092',
): ProxyRoutes {
  const prefix = modulePublicPrefix.replace(/\/$/, '');
  if (!prefix) return proxy;

  const out = { ...proxy };
  out[`${prefix}/nexus-api`] = nexusProxyEntry(`${prefix}/nexus-api`, nexusTarget);
  out['/nexus-api'] = nexusProxyEntry('/nexus-api', nexusTarget);
  return out;
}

export function prefixDevProxy(
  base: string,
  routes: Record<string, { target: string; changeOrigin?: boolean }>,
  deployPrefix?: string,
): Record<
  string,
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
> {
  const root =
    base !== '/' && base !== './'
      ? base.replace(/\/$/, '')
      : deployPrefix?.replace(/\/$/, '') ?? '';

  if (!root) return routes;
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
