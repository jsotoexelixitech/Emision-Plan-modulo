/**
 * Mapper del producto Funerario (personas): estado del wizard (frontend) ->
 * payload que espera nest-api (CreateEmissionPersonDto, ramo 9).
 *
 * Reglas:
 *   - rif/cedula sin prefijo de letra; la letra va aparte en `tipo_cedula_*`.
 *   - rif_* se envían como Number (la vista usa Numeric(9)).
 *   - Fechas en YYYY-MM-DD.
 *   - El titular es el primer asegurado del flujo (parentesco = 1);
 *     si no hay asegurados, cae al tomador.
 *   - La prima/tasa vienen de la cotización (spCalculoPer) ya calculada.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function onlyDigits(v) {
  if (v == null) return '';
  return String(v).replace(/\D+/g, '');
}

function digitsToNumber(v) {
  const d = onlyDigits(v);
  return d ? Number(d) : null;
}

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

function cleanPhone(v) {
  if (v == null) return '';
  return String(v).replace(/\D/g, '');
}

/** Normaliza una fecha a YYYY-MM-DD. Retorna '' si no se puede parsear. */
function normalizeDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

/** Tipo de cédula/RIF: V|E|J|G. Default V. */
function normalizeTipoCedula(v) {
  const s = cleanString(v).toUpperCase().charAt(0);
  return ['V', 'E', 'J', 'G', 'P'].includes(s) ? (s === 'P' ? 'V' : s) : 'V';
}

function normalizeSexo(v) {
  const s = cleanString(v).toUpperCase().charAt(0);
  return s === 'F' ? 'F' : 'M';
}

function normalizeEstadoCivil(v) {
  const s = cleanString(v).toUpperCase().charAt(0);
  return s || null; // S|C|D|V… La Mundial valida Char(1)
}

/** Edad (años cumplidos) desde una fecha. null si no se puede calcular. */
function edadDesdeFecha(fecha) {
  const iso = normalizeDate(fecha);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genInternalPolicyId(prefix = 'PER') {
  const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${ts}-${rand}`;
}

// ── builders ──────────────────────────────────────────────────────────────────

/**
 * Lista de asegurados normalizada para la cotización (spCalculoPer).
 * @param {object} funeral - state.funeral con `asegurados` (FuneralPerson[]).
 * @returns {Array<{ cparen:number, xrif_asegurado:string, nedad_asegurado:number }>}
 */
function buildAseguradosForQuote(funeral = {}) {
  const lista = Array.isArray(funeral.asegurados) ? funeral.asegurados : [];
  return lista.map((a, idx) => ({
    // Primer asegurado = titular (parentesco 1) si no trae parentesco explícito.
    cparen: Number(a.cparen ?? a.parentesco ?? (idx === 0 ? 1 : 0)) || 0,
    xrif_asegurado: onlyDigits(a.xrif_asegurado ?? a.identificacion),
    nedad_asegurado:
      a.nedad_asegurado != null
        ? Number(a.nedad_asegurado)
        : edadDesdeFecha(a.fechaNac ?? a.fnac ?? a.fecha_nacimiento),
  }));
}

/**
 * Construye el payload de emisión de personas (CreateEmissionPersonDto).
 *
 * @param {object} state - wizardState (tomador, funeral, selectedPlan…).
 * @param {{ mprima:number, mprimaext:number, ptasa:number }} cotizacion
 * @param {{ plan?:string, frecuencia?:string, internalPolicyId?:string,
 *   fechaEmision?:string }} [overrides]
 */
function buildEmissionPersonRequest(state, cotizacion, overrides = {}) {
  const tomador = state.tomador || {};
  const funeral = state.funeral || {};
  const asegurados = Array.isArray(funeral.asegurados) ? funeral.asegurados : [];

  // El titular es el primer asegurado (parentesco 1). Si no hay, usamos el tomador.
  const titular = asegurados[0] || {};

  const metadata = state.metadataCanal || {};

  const cramo = metadata.cramo ? parseInt(metadata.cramo, 10) : (parseInt(process.env.LAMUNDIAL_RAMO_PERSON, 10) || 9);
  const productor = metadata.cproductor ? parseInt(metadata.cproductor, 10) : (parseInt(process.env.LAMUNDIAL_PRODUCTOR, 10) || 80080);
  const ctipocanal = metadata.ctipocanal ? parseInt(metadata.ctipocanal, 10) : undefined;
  const cusuario = metadata.cusuario ? parseInt(metadata.cusuario, 10) : undefined;
  const plan = overrides.plan || state.selectedPlan?.cplan || '';
  const frecuencia = overrides.frecuencia || funeral.frecuencia || 'M';
  const fecha_emision = overrides.fechaEmision || todayYmd();
  const internalId = overrides.internalPolicyId || genInternalPolicyId();

  // estado/ciudad: usa los códigos numéricos del selector (cestado/cciudad) si existen.
  const estado_tomador = tomador.cestado != null && tomador.cestado !== ''
    ? Number(tomador.cestado) : (tomador.estado || null);
  const ciudad_tomador = tomador.cciudad != null && tomador.cciudad !== ''
    ? Number(tomador.cciudad) : (tomador.ciudad || null);

  const payload = {
    cramo,
    plan,
    fecha_emision,
    frecuencia,

    // Económicos (de la cotización): prima en USD, tasa Bs/USD.
    prima: Number(cotizacion.mprimaext ?? cotizacion.prima ?? 0),
    cmoneda: 'USD',
    tasa: cotizacion.ptasa != null ? Number(cotizacion.ptasa) : null,
    msumaaseg: state.selectedPlan?.sumaAsegurada != null
      ? Number(state.selectedPlan.sumaAsegurada) : null,

    // ── Tomador ──────────────────────────────────────────────────────────────
    tipo_cedula_tomador: normalizeTipoCedula(tomador.tipoDoc),
    rif_tomador: digitsToNumber(tomador.identificacion),
    nombre_tomador: cleanString(tomador.nombre),
    apellido_tomador: cleanString(tomador.apellido),
    sexo_tomador: normalizeSexo(tomador.sexo),
    estado_civil_tomador: normalizeEstadoCivil(tomador.estadoCivil),
    fnac_tomador: normalizeDate(tomador.fechaNac),
    estado_tomador,
    ciudad_tomador,
    direccion_tomador: cleanString(tomador.direccion),
    telefono_tomador: cleanPhone(tomador.telefono),
    correo_tomador: cleanString(tomador.email),

    // ── Titular (1er asegurado; si es nulo se pasa nulo para que BD lo asigne) ─
    tipo_cedula_titular: titular.tipoDoc ? normalizeTipoCedula(titular.tipoDoc) : null,
    rif_titular: titular.identificacion ? digitsToNumber(titular.identificacion) : null,
    nombre_titular: titular.nombre ? cleanString(titular.nombre) : null,
    apellido_titular: titular.apellido ? cleanString(titular.apellido) : null,
    sexo_titular: titular.sexo ? normalizeSexo(titular.sexo) : null,
    estado_civil_titular: titular.estadoCivil ? normalizeEstadoCivil(titular.estadoCivil) : null,
    fnac_titular: titular.fechaNac ? normalizeDate(titular.fechaNac) : null,
    estado_titular: titular.estado ? estado_tomador : null,
    ciudad_titular: ciudad_tomador,
    direccion_titular: cleanString(tomador.direccion),
    telefono_titular: cleanPhone(tomador.telefono),
    correo_titular: cleanString(tomador.email),

    // ── Declaraciones ──────────────────────────────────────────────────────────
    dec_persona_politica: tomador.personaPoliticamenteExpuesta === true ? 1 : 0,
    dec_term_y_cod: funeral.aceptaTerminos === false ? 0 : 1,
    dec_diagnos_enferm: funeral.diagnosticoEnfermedad === true ? 1 : 0,
    dec_descrip_enferm: cleanString(funeral.descripcionEnfermedad) || '',

    // ── Canal ──────────────────────────────────────────────────────────────────
    productor,
    ...(cusuario !== undefined ? { cusuario } : {}),
    ...(ctipocanal !== undefined ? { ctipocanal } : {}),

    // ── Asegurados (para el trigger de Sis2000) ─────────────────────────────────
    asegurados: asegurados.map((a, idx) => ({
      icedula_asegurado: normalizeTipoCedula(a.tipoDoc),
      xrif_asegurado: digitsToNumber(a.identificacion),
      xnombre_asegurado: cleanString(a.nombre),
      xapellido_asegurado: cleanString(a.apellido),
      fnac_asegurado: normalizeDate(a.fechaNac),
      isexo_asegurado: normalizeSexo(a.sexo),
      nparentesco_asegurado: Number(a.cparen ?? a.parentesco ?? (idx === 0 ? 1 : 0)) || 0,
      iestado_civil_asegurado: normalizeEstadoCivil(a.estadoCivil) || 'S'
    })),

    // ── Beneficiarios (para el trigger de Sis2000) ──────────────────────────────
    beneficiarios: (Array.isArray(funeral.beneficiarios) ? funeral.beneficiarios : []).map(b => ({
      icedula_beneficiario: normalizeTipoCedula(b.tipoDoc),
      xrif_beneficiario: digitsToNumber(b.identificacion),
      xnombre_beneficiario: cleanString(b.nombre),
      xapellido_beneficiario: cleanString(b.apellido),
      fnac_beneficiario: normalizeDate(b.fechaNac),
      isexo_beneficiario: normalizeSexo(b.sexo),
      nparentesco_beneficiario: Number(b.cparen ?? b.parentesco) || 0
    })),
  };

  return {
    payload,
    metadata: {
      internalPolicyId: internalId,
      plan,
      aseguradosCount: payload.asegurados.length,
    },
  };
}

/**
 * Payload para paso 5 (speeValidatePersonGeneral) antes de emitir.
 * @param {object} state - wizardState.
 * @param {{ plan?:string, fechaEmision?:string }} [overrides]
 */
function buildValidateEmissionPersonRequest(state, overrides = {}) {
  const tomador = state.tomador || {};
  const funeral = state.funeral || {};
  const asegurados = Array.isArray(funeral.asegurados) ? funeral.asegurados : [];
  const titular = asegurados[0] || {};
  const metadata = state.metadataCanal || {};

  const cramo = metadata.cramo
    ? parseInt(metadata.cramo, 10)
    : (parseInt(process.env.LAMUNDIAL_RAMO_PERSON, 10) || 9);
  const plan = overrides.plan || state.selectedPlan?.cplan || '';
  const femision = overrides.fechaEmision || todayYmd();

  const rif_titular = titular.identificacion
    ? digitsToNumber(titular.identificacion)
    : digitsToNumber(tomador.identificacion);
  const fnac_titular = titular.fechaNac
    ? normalizeDate(titular.fechaNac)
    : normalizeDate(tomador.fechaNac);

  return {
    cramo,
    plan,
    femision,
    rif_titular,
    fnac_titular,
    rif_tomador: digitsToNumber(tomador.identificacion),
    fnac_tomador: normalizeDate(tomador.fechaNac),
    tipo_cedula_titular: titular.tipoDoc
      ? normalizeTipoCedula(titular.tipoDoc)
      : normalizeTipoCedula(tomador.tipoDoc),
  };
}

module.exports = {
  buildAseguradosForQuote,
  buildEmissionPersonRequest,
  buildValidateEmissionPersonRequest,
  _internal: {
    onlyDigits,
    digitsToNumber,
    normalizeDate,
    normalizeTipoCedula,
    normalizeSexo,
    edadDesdeFecha,
    todayYmd,
    genInternalPolicyId,
  },
};
