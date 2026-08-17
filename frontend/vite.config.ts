import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  prefixDevProxy,
  resolveAppBase,
  resolvePublicModulePrefix,
  withNexusPreviewProxy,
} from './vite-paths'
import { nexusPreviewProxyPlugin } from './vite-nexus-preview-proxy'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'
  const base = resolveAppBase(env)

  // Mismo mapa de proxy para el dev server (`vite`) y para `vite preview`
  // (producción sirve el build con preview, que NO hereda `server.proxy`).
  const modulePrefix = resolvePublicModulePrefix(env, base) || '/emision';
  const nexusTarget = env.VITE_NEXUS_API_PROXY || 'http://127.0.0.1:3092';

  const proxy = withNexusPreviewProxy(
    prefixDevProxy(base, {
      '/api': { target: 'http://localhost:4004', changeOrigin: true },
      '/files': { target: 'http://localhost:4004', changeOrigin: true },
      '/docs': { target: 'http://localhost:4004', changeOrigin: true },
      '/docs.json': { target: 'http://localhost:4004', changeOrigin: true },
    }),
    modulePrefix,
    nexusTarget,
  )

  return {
    base,
    plugins: [nexusPreviewProxyPlugin(modulePrefix, nexusTarget), react(), tailwindcss()],
    server: {
      host: true,
      port: 5183,
      allowedHosts: true,
      hmr: tunnel ? { clientPort: 443, protocol: 'wss' } : true,
      proxy,
    },
    preview: {
      host: true,
      allowedHosts: true,
      proxy,
    },
  }
})
