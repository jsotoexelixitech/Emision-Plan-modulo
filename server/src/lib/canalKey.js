/**
 * Canal de config (preguntas) vs productor de emisión RCV.
 *
 * - Config bucket: solo metadata.canal (si no viene → "default").
 * - cproductor NO define el bucket: en RCV casi siempre viene y rompería
 *   el fallback a las preguntas de la empresa.
 */

/**
 * @param {Record<string, unknown>|null|undefined} meta
 * @returns {string}
 */
function resolveCanalKey(meta) {
  if (!meta || typeof meta !== 'object') return 'default';
  const canal = String(meta.canal ?? '').trim();
  return canal || 'default';
}

/**
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
      resolvedCanal: 'legacy',
      source: 'nexus',
    };
  }

  return null;
}

module.exports = { resolveCanalKey, pickHealthQuestionsForCanal };
