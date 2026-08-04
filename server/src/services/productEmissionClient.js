/**
 * Cliente hacia nest-api /api/v1/product-emission (emisión genérica Exélixi).
 * Aislado del flujo La Mundial (Sis2000 / valrep / personas).
 */
const axios = require('axios');
const {
  getBaseUrl,
  buildAuthHeaders,
  trackResponse,
} = require('./nestTokenService');

function getTimeout() {
  return parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000;
}

async function axiosOpts(extra = {}) {
  return {
    headers: await buildAuthHeaders(),
    timeout: getTimeout(),
    validateStatus: () => true,
    ...extra,
  };
}

async function quoteProductEmission({ productId, planName }) {
  const url = `${getBaseUrl()}/api/v1/product-emission/quote`;
  const response = await axios.post(url, { productId, planName }, await axiosOpts());

  if (response.status >= 200 && response.status < 300) {
    return response.data?.data ?? response.data;
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} cotizando product-emission`,
  );
  err.code = 'PRODUCT_EMISSION_QUOTE_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

async function emitProductEmission(dto) {
  const url = `${getBaseUrl()}/api/v1/product-emission/emit`;
  const response = trackResponse(await axios.post(url, dto, await axiosOpts()));

  if (response.status >= 200 && response.status < 300) {
    return response.data?.data ?? response.data;
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} emitiendo product-emission`,
  );
  err.code = 'PRODUCT_EMISSION_EMIT_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

module.exports = {
  quoteProductEmission,
  emitProductEmission,
};
