/**
 * Rutas de catálogos INMA (vehículos) — Módulo Emisión.
 *
 * Fuente: sysip-nest-api (puerto 3002) — API central Exelixi.
 */
const express = require('express');
const {
  getInmaAnios,
  getInmaMarcas,
  getInmaModelos,
  getInmaVersiones,
  getCategoriasUso,
} = require('../services/sysipClient');
const { fetchPlanesV2 } = require('../services/planesClient');

const router = express.Router();

function normCatalogText(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

router.get('/anios', async (_req, res) => {
  try {
    const data = await getInmaAnios();
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
    const data = await getInmaMarcas(fano);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/marcas]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/modelos', async (req, res) => {
  const fano = parseInt(req.query.fano, 10);
  const cmarca = req.query.cmarca;
  if (!fano || !cmarca) return res.status(400).json({ success: false, message: 'fano y cmarca requeridos' });
  try {
    const data = await getInmaModelos(fano, cmarca);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/modelos]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/versiones', async (req, res) => {
  const fano = parseInt(req.query.fano, 10);
  const cmarca = req.query.cmarca;
  const cmodelo = req.query.cmodelo;
  if (!fano || !cmarca || !cmodelo) {
    return res.status(400).json({ success: false, message: 'fano, cmarca y cmodelo requeridos' });
  }
  try {
    const data = await getInmaVersiones(fano, cmarca, cmodelo);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/versiones]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/categorias-uso', async (req, res) => {
  const fano = parseInt(req.query.fano, 10);
  const cmarca = req.query.cmarca;
  const cmodelo = req.query.cmodelo;
  const cversion = req.query.cversion;
  if (!fano || !cmarca || !cmodelo || !cversion) {
    return res.status(400).json({ success: false, message: 'fano, cmarca, cmodelo y cversion son requeridos' });
  }
  try {
    const data = await getCategoriasUso(fano, cmarca, cmodelo, cversion);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[catalogo/categorias-uso]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/resolver', async (req, res) => {
  const fano = parseInt(req.query.fano, 10);
  const marca = (req.query.marca || '').trim();
  const modelo = (req.query.modelo || '').trim();
  if (!fano || !marca) return res.status(400).json({ success: false, message: 'fano y marca requeridos' });

  const norm = normCatalogText;

  try {
    const marcas = await getInmaMarcas(fano);
    const normMarca = norm(marca);
    const marcaMatch = marcas.find((m) => norm(m.xmarca) === normMarca)
      ?? marcas.find((m) => norm(m.xmarca).includes(normMarca) || normMarca.includes(norm(m.xmarca)));

    if (!marcaMatch) {
      return res.json({ success: false, fallback: true, message: `Marca "${marca}" no encontrada` });
    }

    const modelos = await getInmaModelos(fano, marcaMatch.cmarca);
    const normModelo = norm(modelo);
    const modeloMatch = modelo
      ? (modelos.find((m) => norm(m.xmodelo) === normModelo)
        ?? modelos.find((m) => norm(m.xmodelo).includes(normModelo) || normModelo.includes(norm(m.xmodelo))))
      : null;
    const resolvedModelo = modeloMatch ?? modelos[0];

    if (!resolvedModelo) {
      return res.json({
        success: true,
        fallback: true,
        cmarca: marcaMatch.cmarca,
        xmarca: marcaMatch.xmarca,
      });
    }

    const versiones = await getInmaVersiones(fano, marcaMatch.cmarca, resolvedModelo.cmodelo);

    res.json({
      success: true,
      fallback: !modeloMatch,
      cmarca: marcaMatch.cmarca,
      xmarca: marcaMatch.xmarca,
      cmodelo: resolvedModelo.cmodelo,
      xmodelo: resolvedModelo.xmodelo,
      versiones,
    });
  } catch (err) {
    console.error('[catalogo/resolver]', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/planes', async (req, res) => {
  const meta = req.nexusMetadata || {};
  const ctipo = req.query.ctipo != null ? parseInt(String(req.query.ctipo), 10) : null;

  console.log(
    `[catalogo/planes] GET ctipo=${ctipo ?? 'null'} cproductor=${meta.cproductor ?? '(default)'} cramo=${meta.cramo ?? '(default)'}`,
  );

  try {
    const result = await fetchPlanesV2(meta, ctipo);

    res.json({
      success: true,
      planes: result.planes,
      source: result.source,
      productor: result.request?.citem ?? result.request?.cproductor,
    });
  } catch (err) {
    console.error('[catalogo/planes]', err.message);
    const status = err.status === 401 || err.status === 403 ? err.status : 502;
    res.status(status).json({
      success: false,
      message: `No se pudieron obtener los planes vía sysip-nest-api: ${err.message}`,
      code: err.code || 'PLANES_API_ERROR',
    });
  }
});

module.exports = router;
