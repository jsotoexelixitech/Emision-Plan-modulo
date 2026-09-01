/**
 * Gate Sis2000 (speeValidatePersonGeneral) para funerario/personas.
 * Debe correr ANTES de enviar el caso al técnico y ANTES del pago.
 */
const personasClient = require('./personasClient');
const personasMapper = require('./personasMapper');

function httpError(code, message, httpStatus = 400) {
  const err = new Error(message);
  err.code = code;
  err.httpStatus = httpStatus;
  return err;
}

/**
 * Bloquea si ya hay póliza vigente u otra regla de negocio de Sis2000.
 * @param {object} state - wizard (tomador, funeral, selectedPlan, metadataCanal)
 * @param {{ plan?: string, frecuencia?: string }} [overrides]
 * @returns {Promise<{ ok: true, result: object, raw: object }>}
 */
async function assertPersonasCanEmit(state, overrides = {}) {
  if (!state || !state.tomador) {
    throw httpError('MISSING_STATE', 'state.tomador requerido.');
  }
  const cplan = overrides.plan || state.selectedPlan?.cplan;
  if (!cplan) {
    throw httpError('MISSING_PLAN', 'cplan es obligatorio.');
  }

  const validatePayload = personasMapper.buildValidateEmissionPersonRequest(state, {
    plan: cplan,
    frecuencia: overrides.frecuencia,
  });
  if (!validatePayload.rif_titular || !validatePayload.fnac_titular) {
    throw httpError(
      'INVALID_TITULAR',
      'Titular requiere identificación y fecha de nacimiento válidas.',
    );
  }

  return personasClient.validateEmissionPerson(validatePayload);
}

module.exports = { assertPersonasCanEmit };
