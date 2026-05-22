/**
 * Catálogos La Mundial → códigos numéricos INMA.
 *
 * Códigos verificados contra el entorno QA de La Mundial (abril 2026).
 * El catálogo COMPLETO vive en La Mundial; aquí mantenemos los casos
 * más comunes como fallback estático.
 *
 * ⚠️  Los códigos "083/001/03" que aparecían antes en este archivo son
 *     INCORRECTOS. Los códigos reales verificados son los de abajo.
 *     Enviar códigos erróneos provoca mprima=0.00 en cotización o error
 *     SQL "Data type 0xA7 invalid" en emisión.
 *
 * Para resolver de forma dinámica (sin depender del catálogo estático)
 * usa `resolveVehicleCodesLive(fano, marcaTexto, modeloTexto)`.
 */

const lamundialClient = require('./lamundialClient');

// ── Catálogo estático corregido ────────────────────────────────────────────
// cmarca / cmodelo / cversion → confirmados via POST /api/v1/inma/*

const DEFAULT_BRAND = {
  cmarca: '074', cmodelo: '005', cversion: '05',
  label: 'TOYOTA / COROLLA LE',
};

const VEHICLE_CATALOG = {
  TOYOTA: {
    COROLLA:   { cmarca: '074', cmodelo: '005', cversion: '05',  label: 'TOYOTA / COROLLA' },
    YARIS:     { cmarca: '074', cmodelo: '027', cversion: '19',  label: 'TOYOTA / YARIS' },
    HILUX:     { cmarca: '074', cmodelo: '009', cversion: '09',  label: 'TOYOTA / HILUX' },
    FORTUNER:  { cmarca: '074', cmodelo: '040', cversion: '01',  label: 'TOYOTA / FORTUNER' },
    CAMRY:     { cmarca: '074', cmodelo: '003', cversion: '01',  label: 'TOYOTA / CAMRY' },
    'RAV 4':   { cmarca: '074', cmodelo: '016', cversion: '01',  label: 'TOYOTA / RAV4' },
    RAV4:      { cmarca: '074', cmodelo: '016', cversion: '01',  label: 'TOYOTA / RAV4' },
    AVANZA:    { cmarca: '074', cmodelo: '043', cversion: '01',  label: 'TOYOTA / AVANZA' },
    SIENNA:    { cmarca: '074', cmodelo: '023', cversion: '01',  label: 'TOYOTA / SIENNA' },
    TACOMA:    { cmarca: '074', cmodelo: '020', cversion: '01',  label: 'TOYOTA / TACOMA' },
    HIGHLANDER:{ cmarca: '074', cmodelo: '031', cversion: '01',  label: 'TOYOTA / HIGHLANDER' },
  },
  CHEVROLET: {
    AVEO:      { cmarca: '013', cmodelo: '096', cversion: '31',  label: 'CHEVROLET / AVEO' },
    SPARK:     { cmarca: '013', cmodelo: '105', cversion: '10',  label: 'CHEVROLET / SPARK' },
    ONIX:      { cmarca: '013', cmodelo: '127', cversion: '01',  label: 'CHEVROLET / ONIX' },
    SONIC:     { cmarca: '013', cmodelo: '124', cversion: '01',  label: 'CHEVROLET / SONIC' },
    EQUINOX:   { cmarca: '013', cmodelo: '098', cversion: '01',  label: 'CHEVROLET / EQUINOX' },
    TRAVERSE:  { cmarca: '013', cmodelo: '113', cversion: '01',  label: 'CHEVROLET / TRAVERSE' },
    MALIBU:    { cmarca: '013', cmodelo: '031', cversion: '01',  label: 'CHEVROLET / MALIBU' },
    TAHOE:     { cmarca: '013', cmodelo: '041', cversion: '01',  label: 'CHEVROLET / TAHOE' },
    SUBURBAN:  { cmarca: '013', cmodelo: '038', cversion: '01',  label: 'CHEVROLET / SUBURBAN' },
    BEAT:      { cmarca: '013', cmodelo: '136', cversion: '01',  label: 'CHEVROLET / BEAT' },
    SAIL:      { cmarca: '013', cmodelo: '126', cversion: '01',  label: 'CHEVROLET / SAIL' },
  },
  FORD: {
    FIESTA:    { cmarca: '026', cmodelo: '010', cversion: '01',  label: 'FORD / FIESTA' },
    FUSION:    { cmarca: '026', cmodelo: '015', cversion: '01',  label: 'FORD / FUSION' },
    EXPLORER:  { cmarca: '026', cmodelo: '019', cversion: '01',  label: 'FORD / EXPLORER' },
    ECOSPORT:  { cmarca: '026', cmodelo: '030', cversion: '01',  label: 'FORD / ECOSPORT' },
    ESCAPE:    { cmarca: '026', cmodelo: '012', cversion: '01',  label: 'FORD / ESCAPE' },
  },
  NISSAN: {
    SENTRA:    { cmarca: '056', cmodelo: '008', cversion: '01',  label: 'NISSAN / SENTRA' },
    VERSA:     { cmarca: '056', cmodelo: '012', cversion: '01',  label: 'NISSAN / VERSA' },
    TIIDA:     { cmarca: '056', cmodelo: '010', cversion: '01',  label: 'NISSAN / TIIDA' },
    FRONTIER:  { cmarca: '056', cmodelo: '006', cversion: '01',  label: 'NISSAN / FRONTIER' },
    PATHFINDER:{ cmarca: '056', cmodelo: '007', cversion: '01',  label: 'NISSAN / PATHFINDER' },
    KICKS:     { cmarca: '056', cmodelo: '022', cversion: '01',  label: 'NISSAN / KICKS' },
    XTRAIL:    { cmarca: '056', cmodelo: '015', cversion: '01',  label: 'NISSAN / X-TRAIL' },
    'X-TRAIL': { cmarca: '056', cmodelo: '015', cversion: '01',  label: 'NISSAN / X-TRAIL' },
  },
  HYUNDAI: {
    ACCENT:    { cmarca: '044', cmodelo: '003', cversion: '01',  label: 'HYUNDAI / ACCENT' },
    TUCSON:    { cmarca: '044', cmodelo: '014', cversion: '01',  label: 'HYUNDAI / TUCSON' },
    'I10':     { cmarca: '044', cmodelo: '019', cversion: '01',  label: 'HYUNDAI / i10' },
    'I20':     { cmarca: '044', cmodelo: '020', cversion: '01',  label: 'HYUNDAI / i20' },
    ELANTRA:   { cmarca: '044', cmodelo: '006', cversion: '01',  label: 'HYUNDAI / ELANTRA' },
    SONATA:    { cmarca: '044', cmodelo: '009', cversion: '01',  label: 'HYUNDAI / SONATA' },
    CRETA:     { cmarca: '044', cmodelo: '023', cversion: '01',  label: 'HYUNDAI / CRETA' },
  },
  KIA: {
    PICANTO:   { cmarca: '048', cmodelo: '006', cversion: '01',  label: 'KIA / PICANTO' },
    RIO:       { cmarca: '048', cmodelo: '003', cversion: '01',  label: 'KIA / RIO' },
    SPORTAGE:  { cmarca: '048', cmodelo: '008', cversion: '01',  label: 'KIA / SPORTAGE' },
    CERATO:    { cmarca: '048', cmodelo: '005', cversion: '01',  label: 'KIA / CERATO' },
  },
  VOLKSWAGEN: {
    GOLF:      { cmarca: '080', cmodelo: '004', cversion: '01',  label: 'VOLKSWAGEN / GOLF' },
    POLO:      { cmarca: '080', cmodelo: '007', cversion: '01',  label: 'VOLKSWAGEN / POLO' },
    PASSAT:    { cmarca: '080', cmodelo: '006', cversion: '01',  label: 'VOLKSWAGEN / PASSAT' },
    TIGUAN:    { cmarca: '080', cmodelo: '012', cversion: '01',  label: 'VOLKSWAGEN / TIGUAN' },
  },
};

// Categorías de uso La Mundial.
const USAGE_CATEGORIES = {
  PARTICULAR:           1,
  COMERCIAL:            1,
  'TRANSPORTE PUBLICO': 2,
  'TRANSPORTE PÚBLICO': 2,
  'COMERCIAL PASAJEROS':2,
  CARGA:                4,
  RUSTICO:              1,
  MOTOS:                5,
};

// Estados venezolanos → código La Mundial. Default Distrito Capital.
const STATE_CODES = {
  'DISTRITO CAPITAL': 1,
  CARACAS:   1, AMAZONAS: 2, ANZOATEGUI: 3, APURE: 4, ARAGUA: 5,
  BARINAS:   6, BOLIVAR: 7, CARABOBO: 8, COJEDES: 9, 'DELTA AMACURO': 10,
  FALCON:   11, GUARICO: 12, LARA: 13, MERIDA: 14, MIRANDA: 15,
  MONAGAS:  16, 'NUEVA ESPARTA': 17, PORTUGUESA: 18, SUCRE: 19,
  TACHIRA:  20, TRUJILLO: 21, VARGAS: 22, YARACUY: 23, ZULIA: 24,
  'LA GUAIRA': 22,
};

const DEFAULT_STATE_CODE = 1;
const DEFAULT_CITY_CODE  = 128;

function norm(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Resuelve marca/modelo a códigos INMA usando el catálogo estático.
 * Si no hay match exacto devuelve DEFAULT_BRAND con `fallback: true`.
 */
function resolveVehicleCodes(marcaTexto, modeloTexto) {
  const m   = norm(marcaTexto);
  const mod = norm(modeloTexto);

  const brandMap = VEHICLE_CATALOG[m];
  if (brandMap) {
    if (mod && brandMap[mod]) return { ...brandMap[mod], fallback: false };
    // Marca conocida, modelo no: primer modelo de la marca
    const first = Object.values(brandMap)[0];
    return { ...first, fallback: true, fallbackReason: 'modelo desconocido' };
  }
  return { ...DEFAULT_BRAND, fallback: true, fallbackReason: 'marca desconocida' };
}

/**
 * Resuelve marca/modelo consultando el catálogo vivo de La Mundial.
 * Más preciso que `resolveVehicleCodes` pero requiere llamada HTTP.
 *
 * @param {number} fano
 * @param {string} marcaTexto  Nombre descriptivo (ej. "Toyota")
 * @param {string} modeloTexto Nombre descriptivo (ej. "Corolla")
 * @returns {Promise<{cmarca, cmodelo, cversion, label, fallback}>}
 */
async function resolveVehicleCodesLive(fano, marcaTexto, modeloTexto) {
  try {
    // 1. Buscar cmarca
    const marcas = await lamundialClient.getInmaMarcas(fano);
    const mNorm  = norm(marcaTexto);
    const marca  = marcas.find((m) => norm(m.xmarca) === mNorm);
    if (!marca) return { ...DEFAULT_BRAND, fallback: true, fallbackReason: 'marca no encontrada en catálogo INMA' };

    // 2. Buscar cmodelo
    const modelos = await lamundialClient.getInmaModelos(fano, marca.cmarca);
    const modNorm = norm(modeloTexto);
    const modelo  = modelos.find((m) => norm(m.xmodelo) === modNorm);
    if (!modelo) {
      // Marca encontrada, modelo no — primer modelo de la marca
      const primerModelo = modelos[0];
      if (!primerModelo) return { ...DEFAULT_BRAND, fallback: true, fallbackReason: 'sin modelos para esta marca' };
      const versiones = await lamundialClient.getInmaVersiones(fano, marca.cmarca, primerModelo.cmodelo);
      const cversion  = versiones[0]?.cversion ?? '01';
      return {
        cmarca: marca.cmarca, cmodelo: primerModelo.cmodelo, cversion,
        label: `${marca.xmarca} / ${primerModelo.xmodelo}`,
        fallback: true, fallbackReason: 'modelo no encontrado — primer modelo de la marca',
      };
    }

    // 3. Buscar primera versión del modelo
    const versiones = await lamundialClient.getInmaVersiones(fano, marca.cmarca, modelo.cmodelo);
    const cversion  = versiones[0]?.cversion ?? '01';
    return {
      cmarca: marca.cmarca, cmodelo: modelo.cmodelo, cversion,
      label: `${marca.xmarca} / ${modelo.xmodelo}`,
      fallback: false,
    };
  } catch (err) {
    console.warn('[Catalogs] resolveVehicleCodesLive falló, usando fallback estático:', err.message);
    return { ...resolveVehicleCodes(marcaTexto, modeloTexto), fallback: true };
  }
}

function resolveUsageCategory(usoTexto) {
  const k = norm(usoTexto);
  if (USAGE_CATEGORIES[k] != null) return USAGE_CATEGORIES[k];
  if (k.includes('PASAJERO') || k.includes('PUBLICO') || k.includes('PÚBLICO')) return 2;
  if (k.includes('CARGA')) return 4;
  if (k.includes('MOTO')) return 5;
  return USAGE_CATEGORIES.PARTICULAR;
}

function resolveStateCode(estadoTexto) {
  const k = norm(estadoTexto);
  if (STATE_CODES[k] != null) return STATE_CODES[k];
  return DEFAULT_STATE_CODE;
}

function resolveCityCode(_ciudadTexto, _stateCode) {
  return DEFAULT_CITY_CODE;
}

module.exports = {
  resolveVehicleCodes,
  resolveVehicleCodesLive,
  resolveUsageCategory,
  resolveStateCode,
  resolveCityCode,
  DEFAULT_BRAND,
  DEFAULT_STATE_CODE,
  DEFAULT_CITY_CODE,
  USAGE_CATEGORIES,
};
