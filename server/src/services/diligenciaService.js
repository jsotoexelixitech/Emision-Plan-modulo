/**
 * diligenciaService.js — Clasificación DDS/DDC post-quote (Circular SAA-02-1079-2026).
 */

const PJ_DOC_TYPES = new Set(['J', 'G', 'C']);

const DEFAULT_CONFIG = {
  umbralMultiplicador: 300,
  fuenteTc: 'bcv',
  pjSiempreDdc: true,
  planesMasivos: ['2', '3', '4', '5', '6', '7', '8', '9'],
};

function isPersonaJuridica(tipoDoc) {
  return PJ_DOC_TYPES.has(String(tipoDoc ?? '').trim().toUpperCase());
}

function resolveDiligenciaConfig(override) {
  return { ...DEFAULT_CONFIG, ...(override && typeof override === 'object' ? override : {}) };
}

/**
 * Clasifica diligencia definitiva tras cotización.
 * @param {{ tipoDoc?: string, planCode?: string, mprima?: number, ptasa?: number, diligenciaConfig?: object }} params
 */
function clasificarDiligencia(params = {}) {
  const cfg = resolveDiligenciaConfig(params.diligenciaConfig);
  const tcBcv = Number(params.ptasa) > 0 ? Number(params.ptasa) : 1;
  const primaAnualBs = Number(params.mprima) || 0;
  const umbralBs = cfg.umbralMultiplicador * tcBcv;

  if (cfg.pjSiempreDdc && isPersonaJuridica(params.tipoDoc)) {
    return {
      itipoDiligencia: 'C',
      primaAnualBs,
      umbralBs,
      tcBcv,
      motivo: 'persona_juridica',
    };
  }

  const planDigit = String(params.planCode ?? '').replace(/\D/g, '');
  const esMasivo = cfg.planesMasivos.some(
    (p) => planDigit === p || planDigit.endsWith(p),
  );

  if (esMasivo && primaAnualBs > 0 && primaAnualBs <= umbralBs) {
    return {
      itipoDiligencia: 'S',
      primaAnualBs,
      umbralBs,
      tcBcv,
      motivo: 'pn_masivo_umbral',
    };
  }

  return {
    itipoDiligencia: 'C',
    primaAnualBs,
    umbralBs,
    tcBcv,
    motivo: esMasivo ? 'prima_sobre_umbral' : 'plan_no_masivo',
  };
}

module.exports = {
  clasificarDiligencia,
  isPersonaJuridica,
  DEFAULT_CONFIG,
};
