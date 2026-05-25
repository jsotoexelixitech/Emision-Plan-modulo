/**
 * Rutas de catalogos INMA (vehiculos) — Modulo Emision.
 *
 * Fuente: Sis2000 SQL Server — vista VInma (misma fuente que usa SysIP-backend internamente).
 * La Mundial no expone endpoints INMA en su API externa con los paths correctos,
 * por lo que se consulta directamente la base de datos Sis2000 de La Mundial.
 */
const express = require('express');
const { getSis2000Pool, sql } = require('../services/sis2000Pool');

const router = express.Router();

// ── Helpers Sis2000 ────────────────────────────────────────────────────────────

async function inmaAnios() {
  const pool = await getSis2000Pool();
  const result = await pool.request().query(
    `SELECT MAX(cano) AS [max], MIN(cano) AS [min] FROM VInma`
  );
  return result.recordset[0] ?? { min: 2000, max: new Date().getFullYear() + 1 };
}

async function inmaMarcas(fano) {
  const pool = await getSis2000Pool();
  const req  = pool.request();
  req.input('fano', sql.Int, fano);
  const result = await req.query(
    `SELECT DISTINCT TRIM(cmarca) AS cmarca, TRIM(xmarca) AS xmarca
     FROM VInma WHERE cano = @fano
     ORDER BY xmarca`
  );
  return result.recordset;
}

async function inmaModelos(fano, cmarca) {
  const pool = await getSis2000Pool();
  const req  = pool.request();
  req.input('fano',   sql.Int,     fano);
  req.input('cmarca', sql.VarChar(20), String(cmarca));
  const result = await req.query(
    `SELECT DISTINCT TRIM(cmodelo) AS cmodelo, TRIM(cmarca) AS cmarca, TRIM(xmodelo) AS xmodelo
     FROM VInma WHERE cano = @fano AND cmarca = @cmarca
     ORDER BY xmodelo`
  );
  return result.recordset;
}

async function inmaVersiones(fano, cmarca, cmodelo) {
  const pool = await getSis2000Pool();
  const req  = pool.request();
  req.input('fano',    sql.Int,         fano);
  req.input('cmarca',  sql.VarChar(20), String(cmarca));
  req.input('cmodelo', sql.VarChar(20), String(cmodelo));
  const result = await req.query(
    `SELECT DISTINCT
       TRIM(cversion)       AS cversion,
       TRIM(xversion)       AS xversion,
       cmarca, cmodelo, mvalor,
       ctipo, npasajero, ccategotr, xclasificacion, ctarifabi, xtipo
     FROM VInma
     WHERE cano = @fano AND cmarca = @cmarca AND cmodelo = @cmodelo
     ORDER BY xversion`
  );
  return result.recordset;
}

async function inmaCategoriasUso(fano, cmarca, cmodelo, cversion) {
  const pool = await getSis2000Pool();
  const req  = pool.request();
  req.input('fano',     sql.Int,         fano);
  req.input('cmarca',   sql.VarChar(20), String(cmarca));
  req.input('cmodelo',  sql.VarChar(20), String(cmodelo));
  req.input('cversion', sql.VarChar(20), String(cversion));
  const result = await req.query(
    `SELECT DISTINCT ccategotr AS ccategoria_uso, TRIM(xclasificacion) AS xcategoria_uso
     FROM VInma
     WHERE cano = @fano AND cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion
     ORDER BY xcategoria_uso`
  );
  return result.recordset;
}

// ── Rutas ──────────────────────────────────────────────────────────────────────

router.get('/anios', async (_req, res) => {
  try {
    const data = await inmaAnios();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[catalogo/anios]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/marcas', async (req, res) => {
  const fano = parseInt(req.query.fano, 10);
  if (!fano) return res.status(400).json({ success: false, message: 'fano requerido' });
  try {
    const data = await inmaMarcas(fano);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/marcas]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/modelos', async (req, res) => {
  const fano   = parseInt(req.query.fano, 10);
  const cmarca = req.query.cmarca;
  if (!fano || !cmarca) return res.status(400).json({ success: false, message: 'fano y cmarca requeridos' });
  try {
    const data = await inmaModelos(fano, cmarca);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/modelos]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/versiones', async (req, res) => {
  const fano    = parseInt(req.query.fano, 10);
  const cmarca  = req.query.cmarca;
  const cmodelo = req.query.cmodelo;
  if (!fano || !cmarca || !cmodelo) {
    return res.status(400).json({ success: false, message: 'fano, cmarca y cmodelo requeridos' });
  }
  try {
    const data = await inmaVersiones(fano, cmarca, cmodelo);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/versiones]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/categorias-uso', async (req, res) => {
  const fano     = parseInt(req.query.fano, 10);
  const cmarca   = req.query.cmarca;
  const cmodelo  = req.query.cmodelo;
  const cversion = req.query.cversion;
  if (!fano || !cmarca || !cmodelo || !cversion) {
    return res.status(400).json({ success: false, message: 'fano, cmarca, cmodelo y cversion son requeridos' });
  }
  try {
    const data = await inmaCategoriasUso(fano, cmarca, cmodelo, cversion);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/categorias-uso]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/resolver', async (req, res) => {
  const fano   = parseInt(req.query.fano, 10);
  const marca  = (req.query.marca  || '').trim();
  const modelo = (req.query.modelo || '').trim();
  if (!fano || !marca) return res.status(400).json({ success: false, message: 'fano y marca requeridos' });

  const norm = (s) =>
    String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

  try {
    const marcas     = await inmaMarcas(fano);
    const normMarca  = norm(marca);
    const marcaMatch = marcas.find(m => norm(m.xmarca) === normMarca)
      ?? marcas.find(m => norm(m.xmarca).includes(normMarca) || normMarca.includes(norm(m.xmarca)));

    if (!marcaMatch) {
      return res.json({ success: false, fallback: true, message: `Marca "${marca}" no encontrada` });
    }

    const modelos    = await inmaModelos(fano, marcaMatch.cmarca);
    const normModelo = norm(modelo);
    const modeloMatch = modelo
      ? (modelos.find(m => norm(m.xmodelo) === normModelo)
        ?? modelos.find(m => norm(m.xmodelo).includes(normModelo) || normModelo.includes(norm(m.xmodelo))))
      : null;
    const resolvedModelo = modeloMatch ?? modelos[0];

    if (!resolvedModelo) {
      return res.json({
        success: true, fallback: true,
        cmarca: marcaMatch.cmarca, xmarca: marcaMatch.xmarca,
      });
    }

    const versiones = await inmaVersiones(fano, marcaMatch.cmarca, resolvedModelo.cmodelo);

    res.json({
      success: true,
      fallback: !modeloMatch,
      cmarca:  marcaMatch.cmarca,
      xmarca:  marcaMatch.xmarca,
      cmodelo: resolvedModelo.cmodelo,
      xmodelo: resolvedModelo.xmodelo,
      versiones,
    });
  } catch (err) {
    console.error('[catalogo/resolver]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

module.exports = router;
