/**
 * PM2 — Módulo Emisión (Producción)
 *
 * Uso:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 stop emision-api emision-web
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'emision-api',
      cwd: path.join(ROOT, 'server'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4004,
      },
      out_file:   path.join(ROOT, 'logs', 'emision-api.out.log'),
      error_file: path.join(ROOT, 'logs', 'emision-api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'emision-web',
      cwd: path.join(ROOT, 'frontend'),
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host --port 5183 --strictPort',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
      },
      out_file:   path.join(ROOT, 'logs', 'emision-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'emision-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
