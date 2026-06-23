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
      ntoneladas: (v.ntoneladas != null && !Number.isNaN(Number(v.ntoneladas)))
        ? parseInt(v.ntoneladas, 10)
        : 60,
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
  const titular = sameInsured ? tomador : (state.asegurado || {});
  const cond = state.hasDriver ? state.conductor : null;
  const ben = state.hasBeneficiary ? state.beneficiario : null;

  const codes = resolveCodesFromVehicle(v);
  const ano = parseInt(String(v.año || v.ano || ''), 10) || new Date().getFullYear();

  const metadata = state.metadataCanal || {};

  const productor = metadata.cproductor !== undefined ? metadata.cproductor : (process.env.LAMUNDIAL_PRODUCTOR || 80080);
  const cusuario = metadata.cusuario !== undefined ? metadata.cusuario : (process.env.LAMUNDIAL_CUSUARIO || 4);
  const cramo = metadata.cramo !== undefined ? metadata.cramo : (process.env.LAMUNDIAL_RAMO || 18);
  const ctipocanal = metadata.ctipocanal !== undefined ? metadata.ctipocanal : undefined;
  const ccanalalt = metadata.ccanalalt_in !== undefined ? metadata.ccanalalt_in : undefined;
  const cscanalalt = metadata.cscanalalt_in !== undefined ? metadata.cscanalalt_in : undefined;
  
  const plan = overrides.plan || process.env.LAMUNDIAL_PLAN_DEFAULT || 'RCVBAS';
  const frecuencia = overrides.frecuencia || process.env.LAMUNDIAL_FRECUENCIA_DEFAULT || 'A';
  const fecha_emision = overrides.fechaEmision || todayYmd();
  const internalId = overrides.internalPolicyId || genInternalPolicyId();

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
    poliza: internalId,
    cramo,
    plan,
    frecuencia,
    fecha_emision,

    productor: productor != null ? String(productor) : undefined,
    cusuario,
    ...(ctipocanal !== undefined ? { ctipocanal } : {}),
    ...(ccanalalt !== undefined ? { ccanalalt } : {}),
    ...(cscanalalt !== undefined ? { cscanalalt } : {}),

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
