/**
 * Validador del payload de emision La Mundial.
 *
 * Se ejecuta SIEMPRE antes de llamar a createEmissionAuto. Si hay errores,
 * el orquestador rechaza la emision con HTTP 400 + lista detallada,
 * SIN consumir el cupo de la API real.
 */

function ageInYears(yyyymmdd) {
  if (!yyyymmdd) return -1;
  const m = String(yyyymmdd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return -1;
  const birth = new Date(`${yyyymmdd}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return -1;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/**
 * @param {object} p Payload de createEmissionAuto ya construido por mapper.
 * @returns {string[]} Lista de errores (vacia = OK).
 */
function validateEmissionPayload(p) {
  const errors = [];

  if (!p) {
    errors.push('payload requerido');
    return errors;
  }

  // Identificadores
  if (!p.poliza || !String(p.poliza).trim()) errors.push('poliza (id interno) requerido');
  if (p.cramo !== 18) errors.push('cramo debe ser 18 (RCV)');
  if (!['RCVBAS', 'RUSPAT'].includes(p.plan)) errors.push(`plan invalido: ${p.plan}`);
  if (!['A', 'S', 'C', 'T', 'M'].includes(p.frecuencia)) errors.push(`frecuencia invalida: ${p.frecuencia}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_emision || '')) errors.push('fecha_emision formato YYYY-MM-DD');

  // Tomador
  if (!/^[VEJ]$/.test(p.tipo_cedula_tomador || '')) errors.push('tipo_cedula_tomador invalido (V|E|J)');
  if (!/^\d{6,10}$/.test(p.rif_tomador || '')) errors.push('rif_tomador invalido (solo digitos, 6-10)');
  if (!p.nombre_tomador?.trim()) errors.push('nombre_tomador requerido');
  if (!p.apellido_tomador?.trim()) errors.push('apellido_tomador requerido');
  if (!/^[+]?\d{8,15}$/.test(String(p.telefono_tomador || '').replace(/\s+/g, ''))) {
    errors.push('telefono_tomador invalido (8-15 digitos, opcional +)');
  }
  if (!/.+@.+\..+/.test(p.correo_tomador || '')) errors.push('correo_tomador invalido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fnac_tomador || '')) {
    errors.push('fnac_tomador formato YYYY-MM-DD');
  } else if (ageInYears(p.fnac_tomador) < 18) {
    errors.push('tomador debe ser mayor de edad (18+)');
  }
  if (!p.direccion_tomador?.trim()) errors.push('direccion_tomador requerida');

  // Titular (si distinto al tomador, mismas reglas basicas)
  if (!/^[VEJ]$/.test(p.tipo_cedula_titular || '')) errors.push('tipo_cedula_titular invalido (V|E|J)');
  if (!/^\d{6,10}$/.test(p.rif_titular || '')) errors.push('rif_titular invalido');
  if (!p.nombre_titular?.trim()) errors.push('nombre_titular requerido');
  if (!p.apellido_titular?.trim()) errors.push('apellido_titular requerido');

  // Vehiculo
  if (!/^[A-Z0-9]{6,8}$/.test(p.placa || '')) errors.push('placa invalida (6-8 alfanumericos en mayusculas)');
  if (!p.serial_carroceria?.trim()) errors.push('serial_carroceria requerido');
  const yearNow = new Date().getFullYear();
  if (!Number.isInteger(p.fano) || p.fano < 1980 || p.fano > yearNow + 1) {
    errors.push(`fano fuera de rango (1980-${yearNow + 1})`);
  }

  // Economicos (vienen de cotizacion)
  if (!(Number(p.mprima) > 0)) errors.push('mprima debe venir de cotizacion (> 0)');
  if (!(Number(p.mprimaext) >= 0)) errors.push('mprimaext invalido');
  if (!(Number(p.ptasa) > 0)) errors.push('ptasa debe venir de cotizacion (> 0)');

  // Declaraciones legales
  if (!['0', '1'].includes(String(p.dec_persona_politica))) errors.push('dec_persona_politica debe ser "0" o "1"');
  if (String(p.dec_term_y_cod) !== '1') errors.push('dec_term_y_cod debe ser "1" (acepta terminos)');

  return errors;
}

module.exports = { validateEmissionPayload, _internal: { ageInYears } };
