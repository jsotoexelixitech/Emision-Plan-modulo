import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { prefixDevProxy, resolveAppBase } from './vite-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'
  const base = resolveAppBase(env)

  // Mismo mapa de proxy para el dev server (`vite`) y para `vite preview`
  // (producción sirve el build con preview, que NO hereda `server.proxy`).
  const proxy = prefixDevProxy(base, {
    '/api': { target: 'http://localhost:4004', changeOrigin: true },
    '/files': { target: 'http://localhost:4004', changeOrigin: true },
    '/docs': { target: 'http://localhost:4004', changeOrigin: true },
    '/docs.json': { target: 'http://localhost:4004', changeOrigin: true },
  })

  return {
    base,
    plugins: [react(), tailwindcss()],
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
