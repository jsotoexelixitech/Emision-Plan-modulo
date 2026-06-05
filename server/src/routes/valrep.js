/**
 * /api/valrep — Catálogos de La Mundial de Seguros + Sis2000.
 *
 * Endpoints expuestos:
 *   GET /api/valrep/state          → estados   (Sis2000 maestados)
 *   GET /api/valrep/city?cestado=N → ciudades  (Sis2000 maciudades)
 *   GET /api/valrep/list/:domain   → lista genérica (Sis2000 macatvalores)
 *
 * Fuente: Sis2000 SQL Server — La Mundial no expone estos endpoints externamente
 * con datos limpios. macatvalores cubre SEXO, EDOCIVIL, PARENTESCOS, FRECUENCIAS,
 * MATIPCANAL — todas con bactivo=1.
 */
const express = require('express');
const axios = require('axios');
const { getSis2000Pool, sql } = require('../services/sis2000Pool');

const router = express.Router();

async function getListFromSis2000(domain) {
  const pool = await getSis2000Pool();
  const req  = pool.request();
  req.input('cdom', sql.NVarChar(30), domain);

  const result = await req.query(`
    SELECT TRIM(cvalor)       AS cvalor,
           TRIM(xdescripcion) AS xdescripcion
    FROM   macatvalores
    WHERE  cdominio = @cdom
      AND  bactivo  = 1
    ORDER  BY iorden, cvalor
  `);

  if (!result.recordset?.length) {
    throw new Error(`Dominio ${domain} no encontrado en macatvalores (Sis2000)`);
  }

  return result.recordset;
}

// GET /api/valrep/state — Sis2000 producción (maestados)
router.get('/state', async (_req, res) => {
  try {
    const pool   = await getSis2000Pool();
    const result = await pool.request().query(`
      SELECT cestado AS code, TRIM(xdescripcion_l) AS label
      FROM   maestados
      WHERE  cpais = 58
      ORDER  BY xdescripcion_l
    `);
    res.json({ ok: true, source: 'sis2000', items: result.recordset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[valrep/state] sis2000 error:', msg);
    res.status(502).json({ ok: false, error: 'No se pudo obtener estados de Sis2000', detail: msg });
  }
});

// GET /api/valrep/city?cestado=<codigo> — Sis2000 producción (maciudades)
router.get('/city', async (req, res) => {
  const cestado = req.query.cestado ?? req.query.estado ?? null;
  try {
    const pool = await getSis2000Pool();
    const req2 = pool.request();
    let query;
    if (cestado) {
      req2.input('cestado', sql.Int, parseInt(String(cestado), 10));
      query = `
        SELECT cciudad AS code, TRIM(xdescripcion_l) AS label
        FROM   maciudades
        WHERE  cestado = @cestado
        ORDER  BY xdescripcion_l
      `;
    } else {
      query = `
        SELECT cciudad AS code, TRIM(xdescripcion_l) AS label
        FROM   maciudades
        ORDER  BY xdescripcion_l
      `;
    }
    const result = await req2.query(query);
    res.json({ ok: true, source: 'sis2000', cestado: cestado ? parseInt(cestado, 10) : null, items: result.recordset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[valrep/city] sis2000 error:', msg);
    res.status(502).json({ ok: false, error: 'No se pudo obtener ciudades de Sis2000', detail: msg });
  }
});

// GET /api/valrep/list/:domain
router.get('/list/:domain', async (req, res) => {
  const domain = (req.params.domain || '').toUpperCase();
  const ALLOWED = ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'];
  if (!ALLOWED.includes(domain)) {
    return res.status(400).json({ ok: false, error: `Dominio no permitido: ${domain}` });
  }

  try {
    const raw = await getListFromSis2000(domain);
    const items = (Array.isArray(raw) ? raw : [])
      .map((i) => ({ code: String(i.cvalor ?? ''), label: String(i.xdescripcion ?? '') }))
      .filter((it) => it.code !== '' && it.label !== '');
    res.json({ ok: true, domain, source: 'sis2000', items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[valrep/list/${domain}] sis2000 error:`, msg);
    res.status(502).json({
      ok: false,
      error: `No se pudo obtener la lista ${domain} de Sis2000`,
      detail: msg,
    });
  }
});

// POST /api/valrep/frecuencia
// Proxy al nest-api (sysip-nest-api)
router.post('/frecuencia', async (req, res) => {
  try {
    const { cplan, cramo } = req.body;
    // URL del sysip-nest-api
    const baseUrl = (process.env.NESTAPI_BASE_URL || process.env.LAMUNDIAL_BASE_URL || 'http://apiqa.exelixitech.com:3003').replace(/\/$/, '');
    const url = `${baseUrl}/api/v1/valrep/frecuencia`;
    
    const response = await axios.post(url, { cplan, cramo }, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    
    if (response.status >= 400 || !response.data || !response.data.ok) {
      return res.status(response.status >= 400 ? response.status : 502).json({
        ok: false,
        error: 'Error al consultar frecuencias',
        detail: response.data
      });
    }
    
    res.json(response.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[valrep/frecuencia] proxy error:`, msg);
    res.status(502).json({
      ok: false,
      error: 'No se pudo conectar con el servicio de frecuencias',
      detail: msg,
    });
  }
});

module.exports = router;
