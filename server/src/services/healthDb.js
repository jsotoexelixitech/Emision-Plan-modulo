/**
 * Persistencia local de respuestas del cuestionario de salud funerario.
 * SQLite vía node:sqlite (Node 22+).
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = process.env.HEALTH_DB_PATH || path.join(DATA_DIR, 'funeral-health.db');

/** @type {DatabaseSync | null} */
let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS funeral_health_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      cplan TEXT NOT NULL,
      cramo INTEGER,
      tomador_rif TEXT,
      plan_name TEXT,
      answers_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_health_session_plan
      ON funeral_health_answers(session_id, cplan);
  `);
  return _db;
}

/**
 * @param {object} row
 * @param {string} row.sessionId
 * @param {string} row.cplan
 * @param {number} [row.cramo]
 * @param {string} [row.tomadorRif]
 * @param {string} [row.planName]
 * @param {Record<string, unknown>} row.answers
 */
function upsertHealthAnswers(row) {
  const db = getDb();
  const answersJson = JSON.stringify(row.answers ?? {});
  const existing = db
    .prepare('SELECT id FROM funeral_health_answers WHERE session_id = ? AND cplan = ?')
    .get(row.sessionId, row.cplan);

  if (existing) {
    db.prepare(`
      UPDATE funeral_health_answers
      SET cramo = ?, tomador_rif = ?, plan_name = ?, answers_json = ?, updated_at = datetime('now')
      WHERE session_id = ? AND cplan = ?
    `).run(
      row.cramo ?? null,
      row.tomadorRif ?? null,
      row.planName ?? null,
      answersJson,
      row.sessionId,
      row.cplan,
    );
    return { id: existing.id, updated: true };
  }

  const result = db.prepare(`
    INSERT INTO funeral_health_answers (session_id, cplan, cramo, tomador_rif, plan_name, answers_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.sessionId,
    row.cplan,
    row.cramo ?? null,
    row.tomadorRif ?? null,
    row.planName ?? null,
    answersJson,
  );
  return { id: Number(result.lastInsertRowid), updated: false };
}

/**
 * @param {string} sessionId
 * @param {string} cplan
 */
function getHealthAnswers(sessionId, cplan) {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM funeral_health_answers WHERE session_id = ? AND cplan = ?')
    .get(sessionId, cplan);
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    cplan: row.cplan,
    cramo: row.cramo,
    tomadorRif: row.tomador_rif,
    planName: row.plan_name,
    answers: JSON.parse(row.answers_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { upsertHealthAnswers, getHealthAnswers };
