import type { Connect, Plugin } from 'vite';
import http from 'node:http';
import { URL } from 'node:url';

export function nexusPreviewProxyPlugin(
  modulePrefix: string,
  target = 'http://127.0.0.1:3092',
): Plugin {
  const prefix = modulePrefix.replace(/\/$/, '');
  const mounts = [`${prefix}/nexus-api`, '/nexus-api'];

  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      const raw = req.url ?? '/';
      const pathname = raw.split('?')[0] ?? '/';
      const mount = mounts.find((m) => pathname === m || pathname.startsWith(`${m}/`));
      if (!mount) {
        next();
        return;
      }

      const rest = pathname.slice(mount.length) || '/';
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
      let dest: URL;
      try {
        dest = new URL(`${rest}${qs}`, target);
      } catch {
        res.statusCode = 502;
        res.end('Bad Gateway');
        return;
      }

      const headers = { ...req.headers, host: dest.host };
      const proxyReq = http.request(
        dest,
        { method: req.method, headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        if (!res.headersSent) {
          res.statusCode = 502;
          res.end('Bad Gateway');
        }
      });
      req.pipe(proxyReq);
    });
  };

  return {
    name: 'nexus-preview-proxy',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}
