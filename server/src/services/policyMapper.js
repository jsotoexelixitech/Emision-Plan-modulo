/**
 * Mapper: estado del wizard (frontend) -> payloads de La Mundial.
 *
 * Reglas:
 *   - rif/cedula del API NO lleva prefijo de letra; la letra va aparte en
 *     `tipo_cedula_*` (V|E|J). Limpiamos cualquier prefijo y dejamos solo digitos.
 *   - Fechas en formato YYYY-MM-DD. Aceptamos varios formatos de entrada
 *     (ISO, DD/MM/YYYY, DD-MM-YYYY).
 *   - `placa` mayusculas, sin guiones ni espacios. La Mundial valida 6-8 alfanum.
 *   - mprima/mprimaext/ptasa se usan solo en validacion interna; no se envian a La Mundial.
 *   - Los codigos numericos de catalogo (marca/modelo/version/estado/ciudad)
 *     pasan por `catalogs.js`. Si no se conoce, cae al default validado.
 */

const {
  resolveVehicleCodes,
  resolveUsageCategory,
  resolveStateCode,
  resolveCityCode,
} = require('./catalogs');
const { resolveCusuarioCoberturas } = require('./planesClient');

// ---------- helpers ----------

function onlyDigits(v) {
  if (v == null) return '';
  return String(v).replace(/\D+/g, '');
}

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** Limpia un telefono dejando solo digitos */
function cleanPhone(v) {
  if (v == null) return '';
  return String(v).replace(/\D/g, '');
}

/**
 * Canal alterno La Mundial (ccanalalt / cscanalalt): vacío/ausente → null;
 * valor numérico válido → entero positivo. La API no acepta 0 ni strings vacíos.
 * @param {unknown} value
 * @returns {number|null}
 */
function parseCanalAltOptional(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function upperPlate(v) {
  return cleanString(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normaliza una fecha a YYYY-MM-DD. Retorna '' si no se puede parsear.
 * Acepta:
 *   - ISO completo o YYYY-MM-DD
 *   - DD/MM/YYYY
 *   - DD-MM-YYYY
 */
function normalizeDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  // YYYY-MM-DD o ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // ultimo intento: Date.parse
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

/**
 * Tipo de cedula: V|E|J. Si llega texto raro lo mapeamos al mas probable.
 */
function normalizeTipoCedula(v) {
  const s = cleanString(v).toUpperCase();
  if (['V', 'E', 'J', 'P', 'G'].includes(s)) {
    // V/E/J son los que documenta La Mundial; si llega P o G los respetamos
    // por si en el futuro los aceptan.
    return s === 'P' || s === 'G' ? 'V' : s;
  }
  return 'V';
}

function normalizeSexo(v) {
  const s = cleanString(v).toUpperCase().charAt(0);
  return s === 'F' ? 'F' : 'M';
}

function normalizeEstadoCivil(v) {
  const s = cleanString(v).toUpperCase().charAt(0);
  if (['S', 'C', 'D', 'V'].includes(s)) return s;
  return 'S';
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genInternalPolicyId(prefix = 'INT') {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.]/g, '')
    .slice(0, 14); // YYYYMMDDHHMMSS
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${ts}-${rand}`;
}

function resolveRcvFrecuencia(state, overrides = {}) {
  return String(
    overrides.frecuencia ||
    state.rcv?.frecuencia ||
    process.env.LAMUNDIAL_FRECUENCIA_DEFAULT ||
    'A',
  ).trim().toUpperCase().charAt(0);
}

function resolveRcvNdias(state, overrides = {}) {
  if (overrides.ndias != null && !Number.isNaN(Number(overrides.ndias))) {
    return Number(overrides.ndias);
  }
  if (state.rcv?.ndias != null && !Number.isNaN(Number(state.rcv.ndias))) {
    return Number(state.rcv.ndias);
  }
  return null;
}

/** Vigencia fdesde/fhasta; ndias null = anual (+1 año). */
function resolveVigencia(femisionYmd, ndias) {
  const fdesde = femisionYmd || todayYmd();
  const base = new Date(`${fdesde}T12:00:00`);
  const fhastaDate = new Date(base);
  const n = ndias != null ? Number(ndias) : null;
  if (n != null && !Number.isNaN(n) && n > 0) {
    fhastaDate.setDate(fhastaDate.getDate() + n);
  } else if (n != null && !Number.isNaN(n) && n < 0) {
    fhastaDate.setDate(fhastaDate.getDate() + Math.abs(n));
  } else {
    fhastaDate.setFullYear(fhastaDate.getFullYear() + 1);
  }
  const fhasta = fhastaDate.toISOString().slice(0, 10);
  return { fdesde, fhasta };
}

/** Póliza RCV: vigencia siempre anual; ndias de maplanes_frec solo aplica a recibos (ifrecuencia). */
function resolveVigenciaAnual(femisionYmd) {
  return resolveVigencia(femisionYmd, null);
}

function resolveMsumaaseg(state, quoteMeta = {}) {
  const fromMeta = quoteMeta.referenceSuma ?? quoteMeta.sumaAsegurada;
  if (fromMeta != null && Number(fromMeta) > 0) return Number(fromMeta);
  const fromVehicle = state.vehicle?.msumaaseg ?? state.vehicle?.mvalor;
  if (fromVehicle != null && Number(fromVehicle) > 0) return Number(fromVehicle);
  return null;
}

function resolveIplaca(v) {
  return v?.tipoPlaca === 'extranjera' ? 'E' : 'N';
}

// ---------- mappers principales ----------

/**
 * Resuelve los códigos INMA desde el estado del vehículo.
 * Prioridad:
 *   1. Códigos explícitos en v.cmarca / v.cmodelo / v.cversion (elegidos por el usuario
 *      en el selector de catálogo INMA del frontend).
 *   2. Resolución estática por texto (v.marca / v.modelo) — fallback para
 *      flujos legacy o precarga por OCR.
 */
function resolveCodesFromVehicle(v) {
  if (v.cmarca && v.cmodelo && v.cversion) {
    // Códigos explícitos: usar directamente sin resolución por texto.
    return {
      cmarca:  String(v.cmarca),
      cmodelo: String(v.cmodelo),
      cversion:String(v.cversion),
      label: `${v.marca || v.cmarca} / ${v.modelo || v.cmodelo}`,
      fallback: false,
    };
  }
  // Fallback: resolución por texto con catálogo estático.
  return resolveVehicleCodes(v.marca, v.modelo);
}

/**
 * Construye payload para getCotizacionAuto desde el wizardState.
 * Solo necesita datos del vehiculo + plan.
 *
 * @param {{ vehicle: object, selectedPlan?: object }} state
 * @param {{ plan?: 'RCVBAS'|'RUSPAT' }} [overrides]
 */
function buildQuoteRequest(state, overrides = {}) {
  const v = state.vehicle || {};
  const codes = resolveCodesFromVehicle(v);
  const ano = parseInt(String(v.año || v.ano || ''), 10);
  if (!ano || Number.isNaN(ano)) {
    return { payload: null, metadata: { error: 'MISSING_YEAR' } };
  }
  const ccategoria_uso = (v.ccategoria_uso != null && v.ccategoria_uso !== '')
    ? parseInt(v.ccategoria_uso, 10)
    : resolveUsageCategory(v.uso);
  const cplan = (
    overrides.plan ||
    state.selectedPlan?.cplan ||
    process.env.LAMUNDIAL_PLAN_DEFAULT ||
    ''
  ).trim();
  const sumaAsegurada = resolveMsumaaseg(state, state.quoteMeta || {});

  return {
    payload: {
      fano: ano,
      cmarca: codes.cmarca,
      cmodelo: codes.cmodelo,
      cversion: codes.cversion,
      cplan,
      ccategoria_uso,
      iplaca: resolveIplaca(v),
      ntoneladas: (v.ntoneladas != null && !Number.isNaN(Number(v.ntoneladas)))
        ? parseInt(v.ntoneladas, 10)
        : undefined,
      cramo: parseInt(process.env.LAMUNDIAL_RAMO || '18', 10),
      ifrecuencia: resolveRcvFrecuencia(state, overrides),
      ndias: resolveRcvNdias(state, overrides),
      sumaAsegurada: sumaAsegurada ?? undefined,
    },
    metadata: {
      vehicleLabel: codes.label,
      vehicleFallback: !!codes.fallback,
      vehicleFallbackReason: codes.fallbackReason,
    },
  };
}

/**
 * Construye payload para createEmissionAuto desde el wizardState COMPLETO
 * + valores de cotizacion (mprima, mprimaext, ptasa).
 *
 * @param {object} state - wizardState con tomador, vehicle, selectedPlan, etc.
 * @param {{ mprima:number, mprimaext:number, ptasa:number }} cotizacion
 * @param {{ plan?:string, frecuencia?:string, ndias?:number,
 *   internalPolicyId?:string, fechaEmision?:string, quoteMeta?:object }} [overrides]
 */
function buildEmissionRequest(state, cotizacion, overrides = {}) {
  const tomador = state.tomador || {};
  const v = state.vehicle || {};
  const sameInsured = state.sameInsured !== false;
  const titular = sameInsured ? tomador : (state.asegurado || {});
  const cond = state.hasDriver ? state.conductor : null;
  const ben = state.hasBeneficiary ? state.beneficiario : null;

  const codes = resolveCodesFromVehicle(v);
  const ano = parseInt(String(v.año || v.ano || ''), 10) || new Date().getFullYear();

  const metadata = state.metadataCanal || {};

  const productor = metadata.cproductor !== undefined ? metadata.cproductor : (process.env.LAMUNDIAL_PRODUCTOR || 80080);
  const cusuario = metadata.cusuario !== undefined ? metadata.cusuario : (process.env.LAMUNDIAL_CUSUARIO || 4);
  const cramo = metadata.cramo !== undefined ? metadata.cramo : (process.env.LAMUNDIAL_RAMO || 18);
  const ctipocanal = metadata.ctipocanal !== undefined && String(metadata.ctipocanal).trim() !== ''
    ? metadata.ctipocanal
    : undefined;
  const ccanalalt = parseCanalAltOptional(metadata.ccanalalt_in);
  const cscanalalt = parseCanalAltOptional(metadata.cscanalalt_in);
  
  const plan = (
    overrides.plan ||
    state.selectedPlan?.cplan ||
    process.env.LAMUNDIAL_PLAN_DEFAULT ||
    'RCVBAS'
  ).trim();
  const frecuencia = resolveRcvFrecuencia(state, overrides);
  const ndias = resolveRcvNdias(state, overrides);
  const fecha_emision = overrides.fechaEmision || todayYmd();
  const vigencia = resolveVigenciaAnual(fecha_emision);
  const msumaaseg = resolveMsumaaseg(state, overrides.quoteMeta || state.quoteMeta || {});
  const internalId = overrides.internalPolicyId || genInternalPolicyId();
  const rcv = state.rcv || {};
  const selectedCoberturas = resolveSelectedCoberturas(rcv, overrides);
  const coberAdicional = resolvePrimaryCoberAdicional(selectedCoberturas);

  const tipo_cedula_tomador = normalizeTipoCedula(tomador.tipoDoc);
  const tipo_cedula_titular = sameInsured ? tipo_cedula_tomador : (titular.tipoDoc ? normalizeTipoCedula(titular.tipoDoc) : null);

  // Prioridad: código real del selector (cestado/cciudad) → fallback al mapa estático por texto
  const stateCodeTomador = tomador.cestado   ? parseInt(tomador.cestado, 10)  : resolveStateCode(tomador.estado);
  const cityCodeTomador  = tomador.cciudad   ? parseInt(tomador.cciudad, 10)  : resolveCityCode(tomador.ciudad, stateCodeTomador);
  const stateCodeTitular = sameInsured ? stateCodeTomador
    : (titular.cestado ? parseInt(titular.cestado, 10) : (titular.estado ? resolveStateCode(titular.estado) : null));
  const cityCodeTitular  = sameInsured ? cityCodeTomador
    : (titular.cciudad ? parseInt(titular.cciudad, 10) : (titular.ciudad ? resolveCityCode(titular.ciudad, stateCodeTitular) : null));

  const payload = {
    // No enviar a Nest/SP: cnpoliza_rel debe ir vacío; internalId solo en metadata/logs.
    cramo,
    plan,
    frecuencia,
    ndias,
    fecha_emision,
    fdesde: vigencia.fdesde,
    fhasta: vigencia.fhasta,
    msumaaseg,
    iplaca: resolveIplaca(v),

    productor: productor != null ? String(productor) : undefined,
    cusuario,
    ...(ctipocanal !== undefined ? { ctipocanal } : {}),
    ccanalalt,
    cscanalalt,

    // Tomador
    tipo_cedula_tomador,
    rif_tomador: onlyDigits(tomador.identificacion),
    nombre_tomador: cleanString(tomador.nombre),
    apellido_tomador: cleanString(tomador.apellido),
    telefono_tomador: cleanPhone(tomador.telefono),
    correo_tomador: cleanString(tomador.email),
    sexo_tomador: normalizeSexo(tomador.sexo),
    fnac_tomador: normalizeDate(tomador.fechaNac),
    estado_tomador: stateCodeTomador,
    ciudad_tomador: cityCodeTomador,
    direccion_tomador: cleanString(tomador.direccion),

    // Titular del vehiculo
    tipo_cedula_titular,
    rif_titular: sameInsured ? onlyDigits(tomador.identificacion) : onlyDigits(titular.identificacion),
    nombre_titular: sameInsured ? cleanString(tomador.nombre) : cleanString(titular.nombre),
    apellido_titular: sameInsured ? cleanString(tomador.apellido) : cleanString(titular.apellido),
    sexo_titular: sameInsured ? normalizeSexo(tomador.sexo) : (titular.sexo ? normalizeSexo(titular.sexo) : ''),
    fnac_titular: sameInsured ? normalizeDate(tomador.fechaNac) : normalizeDate(titular.fechaNac),
    estado_titular: stateCodeTitular,
    ciudad_titular: cityCodeTitular,
    direccion_titular: sameInsured ? cleanString(tomador.direccion) : cleanString(titular.direccion),
    telefono_titular: sameInsured ? cleanPhone(tomador.telefono) : cleanPhone(titular.telefono),
    correo_titular: sameInsured ? cleanString(tomador.email) : cleanString(titular.email),

    ...(cond ? {
      conductor: {
        icedula_conductor: normalizeTipoCedula(cond.tipoDoc),
        xrif_conductor: Number(onlyDigits(cond.identificacion)),
        xnombre_conductor: cleanString(cond.nombre),
        xapellido_conductor: cleanString(cond.apellido),
        isexo_conductor: normalizeSexo(cond.sexo),
        iestado_civil_conductor: normalizeEstadoCivil(cond.estadoCivil),
        fnac_conductor: normalizeDate(cond.fechaNac),
        cestado_conductor: cond.cestado ? parseInt(cond.cestado, 10) : resolveStateCode(cond.estado),
        cciudad_conductor: cond.cciudad ? parseInt(cond.cciudad, 10) : resolveCityCode(cond.ciudad, cond.cestado ? parseInt(cond.cestado, 10) : resolveStateCode(cond.estado)),
        xdireccion_conductor: cleanString(cond.direccion),
        xtelefono_conductor: cleanPhone(cond.telefono),
        xcorreo_conductor: cleanString(cond.email),
      }
    } : {}),

    ...(ben ? {
      beneficiario: {
        icedula_beneficiario: normalizeTipoCedula(ben.tipoDoc),
        xrif_beneficiario: Number(onlyDigits(ben.identificacion)),
        xnombre_beneficiario: cleanString(ben.nombre),
        xapellido_beneficiario: cleanString(ben.apellido),
        isexo_beneficiario: normalizeSexo(ben.sexo),
        iestado_civil_beneficiario: normalizeEstadoCivil(ben.estadoCivil),
        fnac_beneficiario: normalizeDate(ben.fechaNac),
        cestado_beneficiario: ben.cestado ? parseInt(ben.cestado, 10) : resolveStateCode(ben.estado),
        cciudad_beneficiario: ben.cciudad ? parseInt(ben.cciudad, 10) : resolveCityCode(ben.ciudad, ben.cestado ? parseInt(ben.cestado, 10) : resolveStateCode(ben.estado)),
        xdireccion_beneficiario: cleanString(ben.direccion),
        xtelefono_beneficiario: cleanPhone(ben.telefono),
        xcorreo_beneficiario: cleanString(ben.email),
      }
    } : {}),

    // Vehiculo
    marca: codes.cmarca,
    xmarca: cleanString(v.marca) || cleanString(v.cmarca) || '',
    modelo: codes.cmodelo,
    xmodelo: cleanString(v.modelo) || cleanString(v.cmodelo) || '',
    version: codes.cversion,
    xversion: cleanString(v.version) || cleanString(v.cversion) || '',
    fano: ano,
    color: cleanString(v.color) || 'Blanco',
    placa: upperPlate(v.placa),
    serial_carroceria: cleanString(v.serial),
    // serial_motor: opcional (String 60, nullable en La Mundial). Se envía vacío si no se provee.
    serial_motor: cleanString(v.serialMotor) || '',
    ccategoria_uso: (v.ccategoria_uso != null && v.ccategoria_uso !== '')
      ? parseInt(v.ccategoria_uso, 10)
      : resolveUsageCategory(v.uso),
    // ntoneladas: nullable, default 60. Se usa el valor del usuario si fue ingresado.
    ntoneladas: (v.ntoneladas != null && !Number.isNaN(Number(v.ntoneladas)))
      ? parseInt(v.ntoneladas, 10)
      : 60,

    coberAdicional,
    tasa_ca: rcv.tasaCA != null ? Number(rcv.tasaCA) : 0,
    tasa_pt: rcv.tasaPT != null ? Number(rcv.tasaPT) : 0,
    tasa_pp: rcv.tasaPP != null ? Number(rcv.tasaPP) : 0,

    // Datos economicos (vienen de cotizacion; se envian como Number)
    mprima: Number(cotizacion.mprima),
    mprimaext: Number(cotizacion.mprimaext),
    ptasa: Number(cotizacion.ptasa),

    // Declaraciones legales
    // dec_persona_politica: NOT NULL en La Mundial → 1 si PPE, 0 si no
    dec_persona_politica: (tomador.personaPoliticamenteExpuesta === true) ? '1' : '0',
    dec_term_y_cod: '1',
    dec_diagnos_enferm: null,
    dec_descrip_enferm: null,
  };

  return {
    payload,
    metadata: {
      internalPolicyId: internalId,
      vehicleLabel: codes.label,
      vehicleFallback: !!codes.fallback,
      vehicleFallbackReason: codes.fallbackReason,
    },
  };
}

/**
 * Transforma el payload interno al formato POST /api/v1/external/createEmissionAuto.
 * Prima, moneda y tasa los calcula La Mundial desde su BD — no se incluyen en el body.
 * @param {object} p Payload de buildEmissionRequest
 * @param {{ mprima: number, mprimaext: number, ptasa: number }} _cotizacion Reservado (validacion previa en orquestador)
 * @returns {object}
 */
function toLaMundialEmissionPayload(p, _cotizacion) {
  const femision = p.femision || p.fecha_emision || todayYmd();
  const fdesde = p.fdesde || femision;
  let fhasta = p.fhasta;
  if (!fhasta) {
    fhasta = resolveVigenciaAnual(fdesde).fhasta;
  }
  const msumaaseg =
    p.msumaaseg != null && Number(p.msumaaseg) > 0 ? Number(p.msumaaseg) : null;

  const rifTom = parseInt(String(p.rif_tomador).replace(/\D/g, ''), 10);
  const rifTit = parseInt(String(p.rif_titular).replace(/\D/g, ''), 10);
  const ecTom = p.iestado_civil_tomador || p.estado_civil_tomador || 'S';
  const ecTit = p.iestado_civil_titular || p.estado_civil_titular || ecTom;

  const body = {
    cramo: parseInt(p.cramo, 10),
    cplan: p.plan,
    icedula_tomador: p.tipo_cedula_tomador,
    xrif_tomador: rifTom,
    xnombre_tomador: p.nombre_tomador,
    xapellido_tomador: p.apellido_tomador,
    isexo_tomador: p.sexo_tomador,
    iestado_civil_tomador: ecTom,
    fnac_tomador: p.fnac_tomador,
    cestado_tomador: p.estado_tomador,
    cciudad_tomador: p.ciudad_tomador,
    xdireccion_tomador: p.direccion_tomador,
    xtelefono_tomador: p.telefono_tomador,
    xcorreo_tomador: p.correo_tomador,
    icedula_titular: p.tipo_cedula_titular,
    xrif_titular: rifTit,
    xnombre_titular: p.nombre_titular,
    xapellido_titular: p.apellido_titular,
    isexo_titular: p.sexo_titular,
    iestado_civil_titular: ecTit,
    fnac_titular: p.fnac_titular,
    cestado_titular: p.estado_titular,
    cciudad_titular: p.ciudad_titular,
    xdireccion_titular: p.direccion_titular,
    xtelefono_titular: p.telefono_titular || p.telefono_tomador,
    xcorreo_titular: p.correo_titular || p.correo_tomador,
    cmarca: p.marca,
    xmarca: p.xmarca,
    cmodelo: p.modelo,
    xmodelo: p.xmodelo,
    cversion: p.version,
    xversion: p.xversion,
    cano: p.fano,
    xcolor: p.color,
    xplaca: p.placa,
    xsercar: p.serial_carroceria,
    xsermot: p.serial_motor || null,
    ccategoria_uso: p.ccategoria_uso,
    npuestos: p.npuestos ?? 5,
    ntoneladas: p.ntoneladas ?? 60,
    iplaca: p.iplaca || 'N',
    precargorcv: 0,
    cpersona_politica: parseInt(p.dec_persona_politica || '0', 10),
    cterm_y_cod: parseInt(p.dec_term_y_cod || '1', 10),
    cproductor: parseInt(p.productor || process.env.LAMUNDIAL_PRODUCTOR || 80080, 10),
    ctipocanal: p.ctipocanal ?? 'E',
    cusuario: parseInt(p.cusuario || process.env.LAMUNDIAL_CUSUARIO || 4, 10),
    msumaaseg,
    ifrecuencia: p.frecuencia || 'A',
    femision,
    fdesde,
    fhasta,
  };

  body.ccanalalt = parseCanalAltOptional(p.ccanalalt);
  body.cscanalalt = parseCanalAltOptional(p.cscanalalt);
  if (p.conductor) body.conductor = p.conductor;
  if (p.beneficiario) body.beneficiario = p.beneficiario;
  if (p.coberAdicional) body.coberAdicional = String(p.coberAdicional).trim().toUpperCase();
  if (p.tasa_ca != null) body.tasaCa = Number(p.tasa_ca);
  if (p.tasa_pt != null) body.tasaPt = Number(p.tasa_pt);
  if (p.tasa_pp != null) body.tasaPp = Number(p.tasa_pp);

  return body;
}

/**
 * Body para POST /api/v1/valrep/calculate-plan-coberturas (réplica SysIP calculatePlanSis).
 * tipo/puestos los resuelve nest-api desde VInma si se omiten.
 */
/** Lista de coberturas opcionales activas (CA, PT, PP…). */
function resolveSelectedCoberturas(rcv = {}, overrides = {}) {
  if (Array.isArray(rcv.coberAdicionales) && rcv.coberAdicionales.length > 0) {
    return [...new Set(
      rcv.coberAdicionales
        .map((c) => String(c || '').trim().toUpperCase())
        .filter((c) => c && c !== 'RC'),
    )];
  }
  if (Array.isArray(overrides.coberAdicionales) && overrides.coberAdicionales.length > 0) {
    return overrides.coberAdicionales.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  }
  const one = String(rcv.coberAdicional || overrides.coberAdicional || 'RC').trim().toUpperCase();
  return one && one !== 'RC' ? [one] : [];
}

/** coberAdicional del SP cuando hay varias seleccionadas (prioridad PT > CA > PP > AP). */
function resolvePrimaryCoberAdicional(selected = []) {
  if (!selected.length) return 'RC';
  const order = ['PT', 'CA', 'PP', 'AP'];
  for (const code of order) {
    if (selected.includes(code)) return code;
  }
  return selected[0];
}

function buildCalculatePlanCoberturasRequest(state, overrides = {}, quoteMeta = {}) {
  const { payload, metadata } = buildQuoteRequest(state, overrides);
  if (!payload?.cplan) {
    return { payload: null, metadata: { error: 'MISSING_PLAN' } };
  }
  const { fdesde, fhasta } = resolveVigenciaAnual(todayYmd());
  const rcv = state.rcv || {};
  const selected = resolveSelectedCoberturas(rcv, overrides);
  const coberAdicional = resolvePrimaryCoberAdicional(selected);
  const suma =
    rcv.sumaAsegurada ??
    payload.sumaAsegurada ??
    quoteMeta.referenceSuma ??
    quoteMeta.sumaAsegurada ??
    undefined;

  return {
    payload: {
      cmarca: payload.cmarca,
      cmodelo: payload.cmodelo,
      cversion: payload.cversion,
      cano: payload.fano,
      idPlan: payload.cplan,
      fdesde,
      fhasta,
      uso: payload.ccategoria_uso,
      iplaca: payload.iplaca,
      toneladas: payload.ntoneladas,
      cramo: payload.cramo,
      ifrecuencia: payload.ifrecuencia || resolveRcvFrecuencia(state, overrides),
      suma: suma != null && Number(suma) > 0 ? Number(suma) : undefined,
      coberAdicional,
      tasaCa: rcv.tasaCA != null ? Number(rcv.tasaCA) : 0,
      tasaPt: rcv.tasaPT != null ? Number(rcv.tasaPT) : 0,
      tasaPp: rcv.tasaPP != null ? Number(rcv.tasaPP) : 0,
      sumaAsegBl: rcv.sumaAsegBl != null ? Number(rcv.sumaAsegBl) : 0,
      sumaAsegAd: rcv.sumaAsegAd != null ? Number(rcv.sumaAsegAd) : 0,
      recargo: 0,
      recargoRcv: 0,
      cusuario: resolveCusuarioCoberturas(state.metadataCanal || {}),
    },
    metadata,
  };
}

module.exports = {
  buildQuoteRequest,
  buildCalculatePlanCoberturasRequest,
  buildEmissionRequest,
  toLaMundialEmissionPayload,
  resolveSelectedCoberturas,
  resolvePrimaryCoberAdicional,
  // Helpers expuestos para tests:
  _internal: {
    onlyDigits,
    normalizeDate,
    normalizeTipoCedula,
    normalizeSexo,
    upperPlate,
    todayYmd,
    genInternalPolicyId,
  },
};
