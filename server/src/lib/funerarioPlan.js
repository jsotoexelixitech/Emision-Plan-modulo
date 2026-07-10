/**
 * Planes funerarios ramo 9 — códigos numéricos (2–12) según BD Sis2000.
 * Los planes RCV usan códigos alfanuméricos (RCVBAS, RUSPAT, …).
 */

/**
 * @param {string} cplan
 * @returns {boolean}
 */
function isFunerarioCplan(cplan) {
  const code = String(cplan || '').trim();
  if (!/^\d+$/.test(code)) return false;
  const n = parseInt(code, 10);
  return n >= 2 && n <= 12;
}

module.exports = { isFunerarioCplan };
