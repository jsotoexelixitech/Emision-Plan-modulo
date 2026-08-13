/**
 * Catálogo de preguntas de salud para funerario — gestionado por Exélixi.
 *
 * Mapeo confirmado desde BD Sis2000 (ramo 9, planes individuales):
 *   cplan "2" → 1.000$ Funerario Individual
 *   cplan "3" → 1.500$ Funerario Individual
 *   cplan "4" → 2.000$ Funerario Individual
 *   cplan "5" → 2.500$ Funerario Individual
 *   cplan "6" → 3.000$ Funerario Individual
 *   cplan "7" → 4.000$ Funerario Individual
 *   cplan "8" → 5.000$ Funerario Individual
 *   cplan "9" → 7.500$ Individual
 *
 * Los cplan llegan como string desde la API (ej. cotización log: cplan "4", "6", "7", "8").
 *
 * `plans`: lista de cplan (string) o ['*'] para todos.
 * `showIf`: pregunta condicional según otra respuesta.
 */

/** Planes funerarios individuales — ramo 9 */
const PLAN = {
  P1000: '2',
  P1500: '3',
  P2000: '4',
  P2500: '5',
  P3000: '6',
  P4000: '7',
  P5000: '8',
  P7500: '9',
  ALL: '*',
};

/** Tiers de cobertura para agrupar preguntas */
const TIER = {
  /** 1.000$ – 2.000$ (cplan 2, 3, 4) */
  ENTRADA: [PLAN.P1000, PLAN.P1500, PLAN.P2000],
  /** 2.500$ – 3.000$ (cplan 5, 6) */
  INTERMEDIO: [PLAN.P2500, PLAN.P3000],
  /** 4.000$ – 7.500$ (cplan 7, 8, 9) */
  ALTO: [PLAN.P4000, PLAN.P5000, PLAN.P7500],
  /** Todos los planes individuales activos */
  TODOS: [
    PLAN.P1000, PLAN.P1500, PLAN.P2000,
    PLAN.P2500, PLAN.P3000,
    PLAN.P4000, PLAN.P5000, PLAN.P7500,
  ],
};

/** @typedef {'boolean' | 'text' | 'select'} HealthQuestionType */

/**
 * @typedef {Object} HealthQuestion
 * @property {string} id
 * @property {HealthQuestionType} type
 * @property {string} label
 * @property {string} [description]
 * @property {boolean} [required]
 * @property {string[]} plans
 * @property {{ field: string, equals: boolean | string }} [showIf]
 * @property {{ value: string, label: string }[]} [options]
 */

/** @type {HealthQuestion[]} */
const CATALOG = [
  // ── Base: todos los planes ────────────────────────────────────────────────
  {
    id: 'fuma',
    type: 'boolean',
    label: '¿Fuma o ha fumado en los últimos 12 meses?',
    description: 'Incluye cigarrillos, tabaco, puros o vapeo.',
    required: true,
    plans: TIER.TODOS,
  },
  {
    id: 'diagnosticoEnfermedad',
    type: 'boolean',
    label: '¿Ha sido diagnosticado con alguna enfermedad grave?',
    description: 'Cáncer, diabetes, hipertensión, cardiopatías, VIH, etc.',
    required: true,
    plans: TIER.TODOS,
  },
  {
    id: 'descripcionEnfermedad',
    type: 'text',
    label: 'Describa la enfermedad diagnosticada',
    description: 'Indique enfermedad, tratamiento y fecha aproximada del diagnóstico.',
    required: true,
    plans: TIER.TODOS,
    showIf: { field: 'diagnosticoEnfermedad', equals: true },
  },
  {
    id: 'aceptaTerminos',
    type: 'boolean',
    label: 'Acepto los términos y condiciones',
    description: 'Declaro que la información suministrada es verídica y acepto las condiciones de la póliza.',
    required: true,
    plans: TIER.TODOS,
  },

  // ── Intermedio en adelante (2.500$ – 7.500$): cplan 5, 6, 7, 8, 9 ───────
  {
    id: 'consumeAlcohol',
    type: 'boolean',
    label: '¿Consume alcohol de forma habitual?',
    description: 'Más de 2 copas por semana de forma regular.',
    required: true,
    plans: [...TIER.INTERMEDIO, ...TIER.ALTO],
  },
  {
    id: 'hospitalizacionReciente',
    type: 'boolean',
    label: '¿Ha sido hospitalizado en los últimos 24 meses?',
    required: true,
    plans: [...TIER.INTERMEDIO, ...TIER.ALTO],
  },
  {
    id: 'motivoHospitalizacion',
    type: 'text',
    label: 'Motivo de la hospitalización',
    required: true,
    plans: [...TIER.INTERMEDIO, ...TIER.ALTO],
    showIf: { field: 'hospitalizacionReciente', equals: true },
  },

  // ── Alto (4.000$ – 7.500$): cplan 7, 8, 9 ───────────────────────────────
  {
    id: 'medicacionCronica',
    type: 'boolean',
    label: '¿Toma medicación de forma crónica?',
    description: 'Medicamentos prescritos de forma continua.',
    required: true,
    plans: TIER.ALTO,
  },
  {
    id: 'detalleMedicacion',
    type: 'text',
    label: 'Indique los medicamentos',
    required: true,
    plans: TIER.ALTO,
    showIf: { field: 'medicacionCronica', equals: true },
  },

  // ── Solo plan máximo 7.500$ (cplan 9) ───────────────────────────────────
  {
    id: 'deporteRiesgo',
    type: 'boolean',
    label: '¿Practica deportes de alto riesgo?',
    description: 'Paracaidismo, montañismo, buceo, carreras, etc.',
    required: true,
    plans: [PLAN.P7500],
  },
];

/**
 * @param {HealthQuestion[]} catalog
 * @param {string} cplan
 * @returns {HealthQuestion[]}
 */
function filterQuestionsForPlan(catalog, cplan) {
  const code = String(cplan || '').trim();
  const list = Array.isArray(catalog) ? catalog : [];
  const matched = list.filter((q) => {
    const plans = (q.plans || []).map((p) => String(p).trim()).filter(Boolean);
    // Sin planes → aplica a todos (evita perder preguntas creadas en el panel)
    if (plans.length === 0) return true;
    return plans.includes(PLAN.ALL) || plans.includes('*') || plans.includes(code);
  });
  if (matched.length === 0) {
    return list.filter((q) => {
      const plans = (q.plans || []).map((p) => String(p).trim()).filter(Boolean);
      return plans.length === 0 || plans.includes(PLAN.ALL) || plans.includes('*');
    });
  }
  return matched;
}

/**
 * @param {string} cplan Código del plan La Mundial (ej. "4", "6", "7", "8", "9")
 * @returns {HealthQuestion[]}
 */
function getQuestionsForPlan(cplan) {
  return filterQuestionsForPlan(CATALOG, cplan);
}

/**
 * Resuelve preguntas: parametrizador Nexus (si hay) → fallback catálogo local.
 * @param {string} cplan
 * @param {{ empresaId?: number }} [opts]
 * @returns {Promise<HealthQuestion[]>}
 */
/**
 * Resuelve preguntas por plan + canal (metadata JWT).
 * El parametrizador guarda en healthQuestionsByCanal[canal]; legacy usa healthQuestions.
 */
async function resolveQuestionsForPlan(cplan, opts = {}) {
  const { resolveCanalKey, pickHealthQuestionsForCanal } = require('../lib/canalKey');
  // Como RCV: la config es por empresa del JWT; canal opcional; fallback default.
  const fromReq = Number(opts.empresaId) > 0 ? Number(opts.empresaId) : 0;
  const fromEnv = Number(process.env.PRODUCT_CONFIG_EMPRESA_ID || process.env.EMPRESA_ID || 0);
  const primaryEmpresa = fromReq || fromEnv || 1;
  const candidates = [...new Set([primaryEmpresa, 1].filter((n) => n > 0))];
  const meta = {
    ...(opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {}),
    ...(opts.canal ? { canal: opts.canal } : {}),
  };
  const canalKey = resolveCanalKey(meta);

  let catalog = CATALOG;
  let source = 'catalog';
  let empresaId = primaryEmpresa;
  let resolvedCanal = canalKey;
  try {
    const {
      fetchProductConfig,
      clearProductConfigCache,
    } = require('../services/nexusProductConfig');
    clearProductConfigCache();

    /** @type {{ questions: any[], resolvedCanal: string, source: string } | null} */
    let picked = null;
    for (const eid of candidates) {
      const cfg = await fetchProductConfig(eid, 'funerario', 'emision', {
        bypassCache: true,
      });
      const hit = pickHealthQuestionsForCanal(cfg, canalKey);
      if (!hit) continue;
      // Prioridad: match exacto de canal en la empresa del JWT
      if (hit.source === 'nexus-canal' && eid === primaryEmpresa) {
        picked = hit;
        empresaId = eid;
        break;
      }
      if (!picked) {
        picked = hit;
        empresaId = eid;
      } else if (
        hit.questions.length > picked.questions.length &&
        eid === primaryEmpresa
      ) {
        picked = hit;
        empresaId = eid;
      }
    }
    if (picked) {
      catalog = picked.questions;
      source = picked.source;
      resolvedCanal = picked.resolvedCanal;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[funeralHealthQuestions] Nexus fallback: ${msg}`);
  }
  const questions = filterQuestionsForPlan(catalog, cplan);
  const catalogIds = catalog.map((q) => q?.id).filter(Boolean);
  const matchedIds = new Set(questions.map((q) => q?.id));
  const skippedIds = catalogIds.filter((id) => !matchedIds.has(id));
  console.log(
    `[funeralHealthQuestions] cplan=${cplan} canal=${canalKey}→${resolvedCanal} empresa=${empresaId} source=${source} catalog=${catalog.length} matched=${questions.length}`,
  );
  return {
    questions,
    source,
    catalogCount: catalog.length,
    skippedIds,
    empresaId,
    triedEmpresas: candidates,
    canal: canalKey,
    resolvedCanal,
  };
}

/** Etiqueta legible para mostrar en logs/admin */
const PLAN_LABELS = {
  '2': '1.000$ Funerario Individual',
  '3': '1.500$ Funerario Individual',
  '4': '2.000$ Funerario Individual',
  '5': '2.500$ Funerario Individual',
  '6': '3.000$ Funerario Individual',
  '7': '4.000$ Funerario Individual',
  '8': '5.000$ Funerario Individual',
  '9': '7.500$ Individual',
};

module.exports = {
  CATALOG,
  PLAN,
  TIER,
  PLAN_LABELS,
  getQuestionsForPlan,
  filterQuestionsForPlan,
  resolveQuestionsForPlan,
};
