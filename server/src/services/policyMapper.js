/**
 * Mapper: estado del wizard (frontend) -> payloads de La Mundial.
 *
 * Reglas:
 *   - rif/cedula del API NO lleva prefijo de letra; la letra va aparte en
 *     `tipo_cedula_*` (V|E|J). Limpiamos cualquier prefijo y dejamos solo digitos.
 *   - Fechas en formato YYYY-MM-DD. Aceptamos varios formatos de entrada
 *     (ISO, DD/MM/YYYY, DD-MM-YYYY).
 *   - `placa` mayusculas, sin guiones ni espacios. La Mundial valida 6-8 alfanum.
 *   - mprima/mprimaext se envian como Number, NO como string.
 *   - Los codigos numericos de catalogo (marca/modelo/version/estado/ciudad)
 *     pasan por `catalogs.js`. Si no se conoce, cae al default validado.
 */

const {
  resolveVehicleCodes,
  resolveUsageCategory,
  resolveStateCode,
  resolveCityCode,
} = require('./catalogs');

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
  const ano = parseInt(String(v.año || v.ano || ''), 10) || new Date().getFullYear();
  // Prioridad: código real del selector dinámico (getCategoriasUso) → fallback al mapa estático por texto
  const ccategoria_uso = (v.ccategoria_uso != null && v.ccategoria_uso !== '')
    ? parseInt(v.ccategoria_uso, 10)
    : resolveUsageCategory(v.uso);
  const cplan = overrides.plan || process.env.LAMUNDIAL_PLAN_DEFAULT || 'RCVBAS';

  return {
    payload: {
      cmarca: codes.cmarca,
      cmodelo: codes.cmodelo,
      cversion: codes.cversion,
      fano: ano,
      cplan,
      ccategoria_uso,
      ntoneladas: 60,
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
 * @param {{ plan?:'RCVBAS'|'RUSPAT', frecuencia?:string,
 *   internalPolicyId?:string, fechaEmision?:string }} [overrides]
 */
function buildEmissionRequest(state, cotizacion, overrides = {}) {
  const tomador = state.tomador || {};
  const v = state.vehicle || {};
  const sameInsured = state.sameInsured !== false;
  const titular = sameInsured ? tomador : (state.asegurado || tomador);

  const codes = resolveCodesFromVehicle(v);
  const ano = parseInt(String(v.año || v.ano || ''), 10) || new Date().getFullYear();

  const productor = parseInt(process.env.LAMUNDIAL_PRODUCTOR, 10) || 80080;
  const cusuario = parseInt(process.env.LAMUNDIAL_CUSUARIO, 10) || 4;
  const cramo = parseInt(process.env.LAMUNDIAL_RAMO, 10) || 18;
  const plan = overrides.plan || process.env.LAMUNDIAL_PLAN_DEFAULT || 'RCVBAS';
  const frecuencia = overrides.frecuencia || process.env.LAMUNDIAL_FRECUENCIA_DEFAULT || 'A';
  const fecha_emision = overrides.fechaEmision || todayYmd();
  const internalId = overrides.internalPolicyId || genInternalPolicyId();

  const tipo_cedula_tomador = normalizeTipoCedula(tomador.tipoDoc);
  const tipo_cedula_titular = normalizeTipoCedula(titular.tipoDoc || tipo_cedula_tomador);

  // Prioridad: código real del selector (cestado/cciudad) → fallback al mapa estático por texto
  const stateCodeTomador = tomador.cestado   ? parseInt(tomador.cestado, 10)  : resolveStateCode(tomador.estado);
  const cityCodeTomador  = tomador.cciudad   ? parseInt(tomador.cciudad, 10)  : resolveCityCode(tomador.ciudad, stateCodeTomador);
  const stateCodeTitular = sameInsured ? stateCodeTomador
    : (titular.cestado  ? parseInt(titular.cestado, 10)  : resolveStateCode(titular.estado));
  const cityCodeTitular  = sameInsured ? cityCodeTomador
    : (titular.cciudad  ? parseInt(titular.cciudad, 10)  : resolveCityCode(titular.ciudad, stateCodeTitular));

  const payload = {
    poliza: internalId,
    cramo,
    plan,
    frecuencia,
    fecha_emision,

    productor,
    cusuario,

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
    rif_titular: onlyDigits(titular.identificacion || tomador.identificacion),
    nombre_titular: cleanString(titular.nombre || tomador.nombre),
    apellido_titular: cleanString(titular.apellido || tomador.apellido),
    sexo_titular: normalizeSexo(titular.sexo || tomador.sexo),
    fnac_titular: normalizeDate(titular.fechaNac || tomador.fechaNac),
    estado_titular: stateCodeTitular,
    ciudad_titular: cityCodeTitular,
    direccion_titular: cleanString(titular.direccion || tomador.direccion),
    telefono_titular: cleanPhone(titular.telefono || tomador.telefono),
    correo_titular: cleanString(titular.email || tomador.email),

    // Vehiculo
    marca: codes.cmarca,
    modelo: codes.cmodelo,
    version: codes.cversion,
    fano: ano,
    color: cleanString(v.color) || 'Blanco',
    placa: upperPlate(v.placa),
    serial_carroceria: cleanString(v.serial),
    serial_motor: '',
    ccategoria_uso: (v.ccategoria_uso != null && v.ccategoria_uso !== '')
      ? parseInt(v.ccategoria_uso, 10)
      : resolveUsageCategory(v.uso),
    ntoneladas: 60,

    // Datos economicos (vienen de cotizacion; se envian como Number)
    mprima: Number(cotizacion.mprima),
    mprimaext: Number(cotizacion.mprimaext),
    ptasa: Number(cotizacion.ptasa),

    // Declaraciones legales (defaults aceptados por La Mundial)
    dec_persona_politica: '0',
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

module.exports = {
  buildQuoteRequest,
  buildEmissionRequest,
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
