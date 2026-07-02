/**
 * Exelixi · Modulo Emision
 *
 * Backend que cotiza y emite polizas RCV contra el endpoint corporativo
 * de La Mundial (puede operar contra QA o produccion segun configuracion).
 *
 * Endpoints:
 *   POST /api/policies/quote
 *   POST /api/policies/emit
 *   GET  /api/health
 */
require('dotenv').config();
const cors = require('cors');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const emisionRoutes  = require('./routes/emision');
const valrepRoutes   = require('./routes/valrep');
const catalogoRoutes = require('./routes/catalogo');
const personasRoutes = require('./routes/personas');
const nexusAuth      = require('./middleware/nexusAuth');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 4004;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

app.use(cors({
  origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));

// ── Swagger UI ────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Emisión API · Exelixi',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    module: 'emision',
    upstream: process.env.LAMUNDIAL_BASE_URL || 'no configurado',
    productor: process.env.LAMUNDIAL_PRODUCTOR || null,
    ramo: process.env.LAMUNDIAL_RAMO || null,
    nexusAuth: process.env.NEXUS_AUTH_ENABLED === 'true',
  });
});

// Multi-tenant: todas las rutas /api requieren nexus_token
// Catálogos (valrep + INMA) consultados directamente desde Sis2000.
app.use('/api/valrep',   nexusAuth, valrepRoutes);
app.use('/api/catalogo', nexusAuth, catalogoRoutes);
// Producto Funerario (personas) — planes y cotización vía API de Personas
app.use('/api/personas', nexusAuth, personasRoutes);
// Cotizaciones y emisiones
app.use('/api', nexusAuth, emisionRoutes);

app.use((err, _req, res, _next) => {
  console.error('[modulo-emision] error:', err);
  res.status(err.status || 500).json({ success: false, code: err.code || 'INTERNAL', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[modulo-emision] escuchando en http://localhost:${PORT}`);
  console.log(`[modulo-emision] LAMUNDIAL_BASE_URL=${process.env.LAMUNDIAL_BASE_URL || '(no set)'}`);
  console.log(`[modulo-emision] LAMUNDIAL_EMISSION_URL=${process.env.LAMUNDIAL_EMISSION_URL || 'https://qaapisys2000.lamundialdeseguros.com (default)'}`);
  console.log(`[modulo-emision] LAMUNDIAL_APIKEY=${process.env.LAMUNDIAL_APIKEY ? 'configurada' : 'NO CONFIGURADA'}`);
  console.log(`[modulo-emision] Swagger UI → http://localhost:${PORT}/docs`);
});
