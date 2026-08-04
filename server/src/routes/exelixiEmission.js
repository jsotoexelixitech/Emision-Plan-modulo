/**
 * Emisión genérica Exélixi — proxy a nest-api product-emission.
 * No usa Sis2000 ni APIs La Mundial.
 */
const express = require('express');
const exelixiQuoteService = require('../services/exelixiQuoteService');
const productEmissionClient = require('../services/productEmissionClient');
const { mapWizardToEmitDto } = require('../services/exelixiEmitMapper');

const router = express.Router();

/**
 * @openapi
 * /api/exelixi/quote:
 *   post:
 *     tags: [Exélixi]
 *     summary: Cotizar plan de product-builder vía nest-api
 */
router.post('/quote', async (req, res, next) => {
  try {
    const { productId, planName } = req.body ?? {};
    if (!productId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PRODUCT_ID',
        message: 'productId es obligatorio.',
      });
    }

    const quote = await exelixiQuoteService.quoteProductEmission({ productId, planName });
    res.json({ success: true, ...quote });
  } catch (err) {
    err.status = err.status || err.httpStatus || 500;
    next(err);
  }
});

/**
 * @openapi
 * /api/exelixi/emit:
 *   post:
 *     tags: [Exélixi]
 *     summary: Emitir póliza genérica (product-builder + PDF nest-api)
 */
router.post('/emit', async (req, res, next) => {
  try {
    const state = req.body?.state;
    if (!state || typeof state !== 'object') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Se requiere { state: wizardStore }.',
      });
    }

    const dto = mapWizardToEmitDto(state);
    const emitted = await productEmissionClient.emitProductEmission(dto);

    const primaTotal = Number(emitted.primaTotal ?? 0);
    const numeroPoliza = emitted.numeroPoliza ?? emitted.number ?? '';

    res.status(201).json({
      success: true,
      message: 'Póliza emitida correctamente.',
      policy: {
        number: numeroPoliza,
        cnpoliza: numeroPoliza,
        cnrecibo: '',
        urlpoliza: emitted.documentUrl ?? '',
        internalPolicyId: numeroPoliza,
        emittedAt: new Date().toISOString(),
        quote: {
          mprima: primaTotal,
          mprimaext: primaTotal,
          ptasa: 1,
        },
        metadata: {
          exelixiCatalog: true,
          moneda: emitted.moneda ?? 'USD',
          productName: emitted.productName,
          planName: emitted.planName,
          persisted: emitted.persisted,
        },
      },
    });
  } catch (err) {
    if (err.code === 'MISSING_BUILDER_PRODUCT' || err.code === 'MISSING_PLAN' || err.code === 'INVALID_TOMADOR') {
      return res.status(err.status || 400).json({
        success: false,
        code: err.code,
        message: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
