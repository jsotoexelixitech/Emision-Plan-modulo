/**
 * Cotización RCV vía Sis2000 (spCalculoAuto) — misma lógica que SysIP-backend
 * externalChannelsModel.getCotizacionAuto.
 *
 * La API HTTP qaapisys2000.../CorreccionCalculo/api/v1/external/getCotizacionAuto
 * no existe en QA (404). El cálculo autoritativo está en la BD Sis2000.
 */
const { getSis2000Pool, sql } = require('./sis2000Pool');

const EXCLUDE_PA = new Set([1, 2, 3, 4, 5, 16]);

/**
 * @param {{ cmarca:string, cmodelo:string, cversion:string, fano:number,
 *   cplan:string, ccategoria_uso:number, ntoneladas?:number, cramo?:number, iplaca?:string }} input
 * @returns {Promise<{ mprima:number, mprimaext:number, ptasa:number }>}
 */
async function getCotizacionFromSis2000(input) {
  const pool = await getSis2000Pool();

  const rateResult = await pool.request().query(
    `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
  );
  const ptasa = Number(rateResult.recordset[0]?.ptasamon) || 0;
  if (!ptasa) {
    const err = new Error('No se obtuvo tasa BCV (mamonedas)');
    err.code = 'SIS2000_QUOTE_ERROR';
    throw err;
  }

  const vinmaReq = pool.request();
  vinmaReq.input('cmarca', sql.VarChar(4), String(input.cmarca).trim());
  vinmaReq.input('cmodelo', sql.VarChar(4), String(input.cmodelo).trim());
  vinmaReq.input('cversion', sql.VarChar(4), String(input.cversion).trim());
  vinmaReq.input('cano', sql.Int, input.fano);
  const vinmaResult = await vinmaReq.query(`
    SELECT ctipo, npasajero
    FROM   VInma
    WHERE  cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano
  `);
  const tipoV   = vinmaResult.recordset[0]?.ctipo ?? 0;
  const puestos = vinmaResult.recordset[0]?.npasajero ?? 0;

  const fdesde = new Date();
  const fhasta = new Date();
  fhasta.setFullYear(fhasta.getFullYear() + 1);

  const calcReq = pool.request();
  calcReq.input('cmarca', sql.VarChar(3), String(input.cmarca).trim());
  calcReq.input('cmodelo', sql.VarChar(3), String(input.cmodelo).trim());
  calcReq.input('cversion', sql.VarChar(3), String(input.cversion).trim());
  calcReq.input('cano', sql.Int, input.fano);
  calcReq.input('cplan', sql.NVarChar(50), input.cplan || 'RCVBAS');
  calcReq.input('sumaAseg', sql.Numeric(18, 2), null);
  calcReq.input('sumaAsegBl', sql.Numeric(18, 2), 0);
  calcReq.input('sumaAsegAd', sql.Numeric(18, 2), 0);
  calcReq.input('iplaca', sql.Char(1), input.iplaca || 'N');
  calcReq.input('fdesde', sql.Date, fdesde);
  calcReq.input('fhasta', sql.Date, fhasta);
  calcReq.input('tasaPt', sql.Numeric(18, 2), 0);
  calcReq.input('tasaCa', sql.Numeric(18, 2), 0);
  calcReq.input('recargo', sql.Numeric(18, 0), 0);
  calcReq.input('tipoV', sql.Numeric(4, 0), tipoV);
  calcReq.input('uso', sql.Numeric(4, 0), input.ccategoria_uso);
  calcReq.input('puestos', sql.Numeric(4, 0), puestos);
  calcReq.input('toneladas', sql.Numeric(4, 0), input.ntoneladas ?? 0);
  calcReq.input('recargoRcv', sql.Numeric(6, 4), 0);
  calcReq.input('cramo', sql.Numeric(5, 0), input.cramo ?? 18);

  const result = await calcReq.execute('spCalculoAuto');
  const rows = result.recordsets?.[0] ?? [];

  const pa = rows.filter((r) => {
    const cov = parseInt(String(r.ccobertura).trim(), 10);
    return !EXCLUDE_PA.has(cov);
  });
  const totalPa = pa.reduce((acc, r) => acc + (Number(r.prima) || 0), 0);

  if (totalPa === 0) {
    const err = new Error(
      'La cotización retornó prima cero. Verifique plan, vehículo y categoría de uso.',
    );
    err.code = 'SIS2000_QUOTE_ZERO';
    throw err;
  }

  const mprimaext = parseFloat(totalPa.toFixed(2));
  const mprima = parseFloat((totalPa * ptasa).toFixed(2));

  console.log(
    `[quoteSis2000] plan=${input.cplan} fano=${input.fano} uso=${input.ccategoria_uso} mprimaext=$${mprimaext} mprima=Bs${mprima} ptasa=${ptasa}`,
  );

  return { mprima, mprimaext, ptasa };
}

module.exports = { getCotizacionFromSis2000 };
