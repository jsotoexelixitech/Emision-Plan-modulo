/**
 * Cliente HTTP hacia product-builder (catálogo Exélixi).
 * Solo lectura — login con cuenta de servicio y caché de token.
 */
const axios = require('axios');

const BASE_URL = (process.env.PRODUCT_BUILDER_API_URL || 'http://127.0.0.1:3015').replace(/\/$/, '');
const API_PREFIX = (process.env.PRODUCT_BUILDER_API_PREFIX || 'producto-builder-api').replace(/^\/|\/$/g, '');
const EMAIL = process.env.PRODUCT_BUILDER_API_EMAIL?.trim() || '';
const PASSWORD = process.env.PRODUCT_BUILDER_API_PASSWORD?.trim() || '';

let cachedToken = null;

async function login() {
  if (!EMAIL || !PASSWORD) {
    const err = new Error(
      'Configure PRODUCT_BUILDER_API_EMAIL y PRODUCT_BUILDER_API_PASSWORD en server/.env del módulo emisión.',
    );
    err.status = 503;
    err.code = 'BUILDER_AUTH_MISSING';
    throw err;
  }

  const { data } = await axios.post(
    `${BASE_URL}/${API_PREFIX}/auth/login`,
    { email: EMAIL, password: PASSWORD },
    { timeout: 15000 },
  );

  const token = data?.accessToken || data?.access_token;
  if (!token) {
    const err = new Error('product-builder no devolvió accessToken en login');
    err.status = 502;
    err.code = 'BUILDER_AUTH_FAILED';
    throw err;
  }

  cachedToken = token;
  return token;
}

async function authHeaders() {
  if (!cachedToken) {
    await login();
  }
  return { Authorization: `Bearer ${cachedToken}` };
}

async function builderGet(path) {
  const url = `${BASE_URL}/${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;

  async function attempt(retry) {
    try {
      const headers = await authHeaders();
      const { data, status } = await axios.get(url, { headers, timeout: 20000, validateStatus: () => true });
      if (status === 401 && retry) {
        cachedToken = null;
        return attempt(false);
      }
      if (status >= 400) {
        const err = new Error(data?.message || `product-builder respondió ${status}`);
        err.status = status === 401 ? 503 : 502;
        err.code = 'BUILDER_UPSTREAM_ERROR';
        throw err;
      }
      return data;
    } catch (err) {
      if (err.code === 'BUILDER_UPSTREAM_ERROR' || err.code === 'BUILDER_AUTH_MISSING') throw err;
      const wrapped = new Error(err.message || 'Error conectando a product-builder');
      wrapped.status = 502;
      wrapped.code = 'BUILDER_UNREACHABLE';
      throw wrapped;
    }
  }

  return attempt(true);
}

function isEmitible(product) {
  if (!product || product.status === 'REJECTED') return false;
  const coverageCount = product.coverages?.length ?? 0;
  if (coverageCount === 0) return false;
  const planCount = product.productPlans?.length ?? 0;
  return planCount > 0 || coverageCount > 0;
}

async function getProduct(id) {
  const product = await builderGet(`/products/${encodeURIComponent(id)}`);
  if (!isEmitible(product)) {
    const err = new Error('Producto no disponible para emisión (sin planes/coberturas o rechazado)');
    err.status = 404;
    err.code = 'PRODUCT_NOT_EMITIBLE';
    throw err;
  }
  return product;
}

async function getPlans(productId) {
  return builderGet(`/products/${encodeURIComponent(productId)}/plans`);
}

module.exports = {
  getProduct,
  getPlans,
  isEmitible,
};
