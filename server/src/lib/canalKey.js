/**
 * Identifica el canal de origen desde metadata del JWT Nexus (sso-delegate).
 * Misma semántica que emisión RCV (metadataCanal).
 *
 * Prioridad: metadata.canal → cproductor → "default"
 *
 * @param {Record<string, unknown>|null|undefined} meta
 * @returns {string}
 */
function resolveCanalKey(meta) {
  if (!meta || typeof meta !== 'object') return 'default';
  const canal = String(meta.canal ?? '').trim();
  if (canal) return canal;
  const prod = meta.cproductor;
  if (prod !== undefined && prod !== null && String(prod).trim() !== '') {
    return `p${String(prod).trim()}`;
  }
  return 'default';
}

/**
 * Extrae el catálogo de preguntas para un canal desde product-config Nexus.
 * @param {object|null|undefined} cfg
 * @param {string} canalKey
 * @returns {{ questions: any[], resolvedCanal: string, source: string } | null}
 */
function pickHealthQuestionsForCanal(cfg, canalKey) {
  const key = String(canalKey || 'default').trim() || 'default';
  const by = cfg?.healthQuestionsByCanal;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    if (Array.isArray(by[key]) && by[key].length > 0) {
      return { questions: by[key], resolvedCanal: key, source: 'nexus-canal' };
    }
    if (key !== 'default' && Array.isArray(by.default) && by.default.length > 0) {
      return { questions: by.default, resolvedCanal: 'default', source: 'nexus-canal-default' };
    }
  }
  if (Array.isArray(cfg?.healthQuestions) && cfg.healthQuestions.length > 0) {
    return {
      questions: cfg.healthQuestions,
      resolvedCanal: key === 'default' ? 'default' : 'legacy',
      source: 'nexus',
    };
  }
  return null;
}

module.exports = { resolveCanalKey, pickHealthQuestionsForCanal };
