/**
 * Activa recibo pendiente tras pago bancario vía nest-api collection.
 * POST /api/v1/external/collection/activate (notific + collect).
 */
const axios = require('axios');
const { getBaseUrl } = require('./nestApiClient');
const { buildAuthHeaders, trackResponse } = require('./nestTokenService');

/**
 * @param {{
 *   cnrecibo: string,
 *   mpago: number,
 *   xreferencia: string,
 *   fpago?: string,
 *   cusuario?: number,
 *   cbanco?: number,
 *   cbanco_ref?: string,
 *   cbanco_destino?: number,
 *   xtelefono?: string,
 *   telefono_dest?: string,
 *   cci_rif?: string,
 *   cbanco_dest_ref?: string,
 * }} params
 */
async function activateReceiptAfterPayment(params) {
  if (process.env.COLLECTION_ENABLED === 'false') {
    console.log('[nest-api-collection] COLLECTION_ENABLED=false — omitiendo activación de recibo.');
    return { skipped: true };
  }

  const fpago = params.fpago || new Date().toISOString().slice(0, 10);
  const url = `${getBaseUrl()}/api/v1/external/collection/activate`;

  console.log(
    `[nest-api-collection] -> activate cnrecibo=${params.cnrecibo} mpago=${params.mpago} ref=${params.xreferencia}`,
  );

  const response = trackResponse(await axios.post(
    url,
    {
      cnrecibo: params.cnrecibo,
      mpago: params.mpago,
      xreferencia: params.xreferencia,
      fpago,
      ...(params.cusuario != null ? { cusuario: params.cusuario } : {}),
      ...(params.cbanco != null ? { cbanco: params.cbanco } : {}),
      ...(params.cbanco_ref ? { cbanco_ref: params.cbanco_ref } : {}),
      ...(params.cbanco_destino != null ? { cbanco_destino: params.cbanco_destino } : {}),
      ...(params.xtelefono ? { xtelefono: params.xtelefono } : {}),
      ...(params.telefono_dest ? { telefono_dest: params.telefono_dest } : {}),
      ...(params.cci_rif ? { cci_rif: params.cci_rif } : {}),
      ...(params.cbanco_dest_ref ? { cbanco_dest_ref: params.cbanco_dest_ref } : {}),
    },
    {
      headers: await buildAuthHeaders(),
      timeout: parseInt(process.env.LAMUNDIAL_TIMEOUT_MS, 10) || 60_000,
      validateStatus: () => true,
    },
  ));

  if (response.status >= 200 && response.status < 300 && response.data?.status !== false) {
    console.log(`[nest-api-collection] <- activate OK HTTP ${response.status}`);
    return response.data?.result ?? response.data;
  }

  const err = new Error(
    response.data?.message || `HTTP ${response.status} en collection/activate`,
  );
  err.code = 'NEST_API_COLLECTION_ERROR';
  err.httpStatus = response.status;
  err.raw = response.data;
  throw err;
}

module.exports = { activateReceiptAfterPayment };
