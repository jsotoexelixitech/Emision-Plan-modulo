/**
 * PM2 — Módulo Emisión (Desarrollo)
 *
 * Uso:
 *   pm2 start ecosystem.dev.config.js
 *   pm2 logs emision-api
 *   pm2 restart emision-api
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'emision-api',
      cwd: path.join(ROOT, 'server'),
      script: 'node_modules/.bin/nodemon',
      args: 'src/index.js',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
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
      script: 'node_modules/.bin/vite',
      args: '--host',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
      out_file:   path.join(ROOT, 'logs', 'emision-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'emision-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
