/**
 * Pool de conexión compartido a Sis2000 (SQL Server de La Mundial).
 * Lazy-inicializado, reutilizado entre requests.
 */
const sql = require('mssql');

const sis2000Config = {
  server:   process.env.SIS2000_SERVER   || '172.30.149.67',
  database: process.env.SIS2000_DATABASE || 'Sis2000',
  user:     process.env.SIS2000_USER     || 'sa',
  password: process.env.SIS2000_PASSWORD || '',
  options: {
    encrypt:                process.env.SIS2000_ENCRYPT    === 'true',
    trustServerCertificate: process.env.SIS2000_TRUST_CERT !== 'false',
    enableArithAbort:       true,
    requestTimeout:         parseInt(process.env.SIS2000_TIMEOUT, 10) || 30_000,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
};

let _pool = null;

async function getSis2000Pool() {
  if (_pool) return _pool;
  _pool = await sql.connect(sis2000Config);
  _pool.on('error', (err) => {
    console.error('[Sis2000] Pool error:', err.message);
    _pool = null;
  });
  return _pool;
}

module.exports = { getSis2000Pool, sql };
