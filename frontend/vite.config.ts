import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5183,
      allowedHosts: true,
      hmr: tunnel ? { clientPort: 443, protocol: 'wss' } : true,
      proxy: {
        '/api': { target: 'http://localhost:4004', changeOrigin: true },
        '/files': { target: 'http://localhost:4004', changeOrigin: true },
      },
    },
  }
})
