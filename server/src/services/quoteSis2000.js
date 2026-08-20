/**
 * Cotización RCV vía Sis2000 (sp_calculo_auto_nexus) — alineado con nest-api valrep.
 */
const { getSis2000Pool, sql } = require('./sis2000Pool');

const SP_CALCULO_AUTO_NEXUS =
  process.env.MSSQL_SP_CALCULO_AUTO_NEXUS?.trim() || 'sp_calculo_auto_nexus';

function resolveCusuario() {
  const raw =
    process.env.LAMUNDIAL_CUSUARIO_PLANES ||
    process.env.LAMUNDIAL_CUSUARIO ||
    '6';
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : 6;
}

/**
 * @param {{ cmarca:string, cmodelo:string, cversion:string, fano:number,
 *   cplan:string, ccategoria_uso:number, ntoneladas?:number, cramo?:number, iplaca?:string,
 *   ifrecuencia?:string }} input
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
    SELECT ctipo, npasajero, mvalor
    FROM   VInma
    WHERE  cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano
  `);
  const tipoV = vinmaResult.recordset[0]?.ctipo ?? 0;
  const puestos = vinmaResult.recordset[0]?.npasajero ?? 0;
  const mvalor = Number(vinmaResult.recordset[0]?.mvalor) || null;

  const fdesde = new Date();
  const fhasta = new Date();
  fhasta.setFullYear(fhasta.getFullYear() + 1);

  const ifrecuencia =
    String(input.ifrecuencia ?? 'A').trim().toUpperCase().charAt(0) || 'A';
  const cusuario = resolveCusuario();

  const calcReq = pool.request();
  calcReq.input('cmarca', sql.NVarChar(4), String(input.cmarca).trim());
  calcReq.input('cmodelo', sql.NVarChar(4), String(input.cmodelo).trim());
  calcReq.input('cversion', sql.NVarChar(4), String(input.cversion).trim());
  calcReq.input('cano', sql.Int, input.fano);
  calcReq.input('cplan', sql.Char, input.cplan || 'RCVBAS');
  calcReq.input('sumaAseg', sql.Numeric(18, 2), mvalor);
  calcReq.input('sumaAsegBl', sql.Numeric(18, 2), null);
  calcReq.input('sumaAsegAd', sql.Numeric(18, 2), null);
  calcReq.input('iplaca', sql.Char(1), input.iplaca || 'N');
  calcReq.input('fdesde', sql.Date, fdesde);
  calcReq.input('fhasta', sql.Date, fhasta);
  calcReq.input('tasaPt', sql.Numeric(18, 2), null);
  calcReq.input('tasaCa', sql.Numeric(18, 2), null);
  calcReq.input('tasaPp', sql.Numeric(18, 2), null);
  calcReq.input('recargo', sql.Numeric(18, 2), null);
  calcReq.input('tipoV', sql.Numeric(4), tipoV);
  calcReq.input('uso', sql.Numeric(4), input.ccategoria_uso);
  calcReq.input('puestos', sql.Numeric(4), puestos);
  calcReq.input('toneladas', sql.Numeric(4), input.ntoneladas ?? 0);
  calcReq.input('recargoRcv', sql.Numeric(6, 4), input.precargorcv ?? 0);
  calcReq.input('cramo', sql.Numeric(5), input.cramo ?? 18);
  calcReq.input('cusuario', sql.Numeric(20), cusuario);
  calcReq.input('coberAdicional', sql.VarChar(2), 'RC');
  calcReq.input('ifrecuencia', sql.Char(1), ifrecuencia);

  const result = await calcReq.execute(SP_CALCULO_AUTO_NEXUS);
  const totals = result.recordsets?.[1]?.[0] ?? {};
  const totalPa = Number(totals.totalPA ?? 0);

  if (totalPa === 0) {
    const err = new Error(
      'La cotización retornó prima cero. Verifique plan, vehículo y categoría de uso.',
    );
    err.code = 'SIS2000_QUOTE_ZERO';
    throw err;
  }

  const mprimaext = parseFloat(totalPa.toFixed(2));
  const mprima = parseFloat((totalPa * ptasa).toFixed(2));

  return { mprima, mprimaext, ptasa };
}

module.exports = { getCotizacionFromSis2000 };
