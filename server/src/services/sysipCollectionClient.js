/**
 * Activa recibo pendiente tras pago bancario vía sysip-nest-api collection.
 * POST /api/v1/external/collection/activate (notific + collect).
 */
const axios = require('axios');
const { getBaseUrl, buildHeaders } = require('./sysipClient');

/**
 * @param {{ cnrecibo: string, mpago: number, xreferencia: string, fpago?: string, cusuario?: number }} params
 */
async function activateReceiptAfterPayment(params) {
  if (process.env.COLLECTION_ENABLED === 'false') {
    console.log('[sysip-collection] COLLECTION_ENABLED=false — omitiendo activación de recibo.');
    return { skipped: true };
  }

  const fpago = params.fpago || new Date().toISOString().slice(0, 10);
  const url = `${getBaseUrl()}/api/v1/external/collection/activate`;

  console.log(
    `[sysip-collection] -> activate cnrecibo=${params.cnrecibo} mpago=${params.mpago} ref=${params.xreferencia}`,
  );

  const response = await axios.post(
    url,
    {
      cnrecibo: params.cnrecibo,
      mpago: params.mpago,
      xreferencia: params.xreferencia,
      fpago,
      ...(params.cusuario != null ? { cusuario: params.cusuario } : {}),
    },
    {
      headers: buildHeaders(),
      timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000,
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300 && response.data?.status !== false) {
    console.log(`[sysip-collection] <- activate OK HTTP ${response.status}`);
    return response.data?.result ?? response.data;
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} en collection/activate`,
  );
  err.code = 'SYSIP_COLLECTION_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

module.exports = { activateReceiptAfterPayment };
