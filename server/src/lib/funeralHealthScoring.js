/**
 * Motor de scoring del cuestionario de salud funerario.
 * Solo aplica al flujo funerario — no interfiere con RCV ni Exélixi catálogo.
 */

/**
 * @typedef {Object} ScoreLine
 * @property {string} questionId
 * @property {string} label
 * @property {unknown} answer
 * @property {number} points
 * @property {boolean} [blocked]
 */

/**
 * @param {import('../config/funeralHealthQuestions').HealthQuestion[]} questions
 * @param {Record<string, unknown>} answers
 * @returns {{ total: number, breakdown: ScoreLine[], blocked: boolean, blockReason?: string }}
 */
function computeHealthScore(questions, answers) {
  /** @type {ScoreLine[]} */
  const breakdown = [];
  let total = 0;
  let blocked = false;
  /** @type {string | undefined} */
  let blockReason;

  for (const q of questions) {
    if (!isQuestionVisible(q, answers)) continue;

    const answer = answers[q.id];
    let points = 0;

    if (q.type === 'boolean') {
      if (answer === true) {
        points = Number(q.scoreIfTrue) || 0;
        if (q.blockIfTrue) {
          blocked = true;
          blockReason = q.blockReason || `Respuesta afirmativa en: ${q.label}`;
        }
      } else if (answer === false) {
        points = Number(q.scoreIfFalse) || 0;
        if (q.blockIfFalse) {
          blocked = true;
          blockReason = q.blockReason || `Respuesta en: ${q.label}`;
        }
      }
    } else if (q.type === 'select') {
      const val = String(answer ?? '');
      const map = q.optionScores && typeof q.optionScores === 'object' ? q.optionScores : {};
      points = Number(map[val]) || 0;
    } else if (q.type === 'text') {
      const filled = String(answer ?? '').trim().length > 0;
      if (filled) {
        points = Number(q.scoreIfFilled) || 0;
      }
    }

    if (Number.isFinite(points) && points !== 0) {
      total += points;
    }

    breakdown.push({
      questionId: q.id,
      label: q.label,
      answer,
      points,
      ...(blocked && (q.blockIfTrue || q.blockIfFalse) ? { blocked: true } : {}),
    });
  }

  return { total, breakdown, blocked, blockReason };
}

/**
 * @param {{ showIf?: { field: string, equals: boolean | string } }} q
 * @param {Record<string, unknown>} answers
 */
function isQuestionVisible(q, answers) {
  if (!q.showIf?.field) return true;
  const actual = answers[q.showIf.field];
  const expected = q.showIf.equals;
  if (
    expected === true ||
    expected === false ||
    expected === 'true' ||
    expected === 'false'
  ) {
    const want = expected === true || expected === 'true';
    return actual === want;
  }
  return String(actual ?? '') === String(expected);
}

module.exports = { computeHealthScore, isQuestionVisible };
