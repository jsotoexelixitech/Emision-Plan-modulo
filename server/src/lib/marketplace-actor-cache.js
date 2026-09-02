const fs = require('fs');
const os = require('os');
const path = require('path');

const store = new Map();
const TTL_MS = 8 * 60 * 60 * 1000;
const CACHE_FILE = process.env.MARKETPLACE_ACTOR_CACHE_FILE
  || path.join(os.tmpdir(), 'exelixi-marketplace-actor.json');

function hydrate() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!data || typeof data !== 'object') return;
    for (const [key, rec] of Object.entries(data)) {
      if (!rec?.cgestor || !rec.at || Date.now() - rec.at > TTL_MS) continue;
      const existing = store.get(key);
      if (!existing || rec.at > existing.at) store.set(key, rec);
    }
  } catch { /* ignore */ }
}

function persist() {
  try {
    const out = {};
    for (const [key, rec] of store.entries()) {
      if (!rec?.cgestor || Date.now() - rec.at > TTL_MS) continue;
      out[key] = rec;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(out));
  } catch { /* ignore */ }
}

function preferGestor(a, b) {
  const sa = a != null ? String(a).trim() : '';
  const sb = b != null ? String(b).trim() : '';
  if (!sa) return sb;
  if (!sb) return sa;
  if (sb.startsWith(`${sa}-`)) return sb;
  if (sa.startsWith(`${sb}-`)) return sa;
  if (sa.includes('-') && !sb.includes('-')) return sa;
  if (sb.includes('-') && !sa.includes('-')) return sb;
  return sa;
}

function sidFromReq(req) {
  if (req.query?.sid) return String(req.query.sid);
  if (req.body?.state?.sid) return String(req.body.state.sid);
  if (req.body?.sid) return String(req.body.sid);
  try {
    const ref = req.headers?.referer || '';
    if (ref) return new URL(ref).searchParams.get('sid');
  } catch { /* ignore */ }
  return null;
}

function keysFrom(req, meta = {}) {
  const sid = sidFromReq(req);
  return [
    sid ? `sid:${sid}` : '',
    meta.citem ? `item:${meta.citem}` : '',
    meta.cproductor ? `prod:${meta.cproductor}` : '',
    meta.centidad && meta.citem ? `${meta.centidad}:${meta.citem}` : '',
  ].filter(Boolean);
}

function remember(cgestor, keys) {
  const g = cgestor != null ? String(cgestor).trim() : '';
  if (!g || !keys.length) return;
  hydrate();
  const rec = { cgestor: g, at: Date.now() };
  for (const key of keys) store.set(key, rec);
  persist();
}

function lookup(keys) {
  hydrate();
  let best = '';
  for (const key of keys) {
    const rec = store.get(key);
    if (!rec || Date.now() - rec.at > TTL_MS) continue;
    best = preferGestor(best, rec.cgestor);
  }
  return best;
}

function restoreMarketplaceActor(req) {
  const meta = req.nexusMetadata && typeof req.nexusMetadata === 'object'
    ? req.nexusMetadata
    : {};
  const keys = keysFrom(req, meta);
  if (meta.cgestor) remember(meta.cgestor, keys);
  const cached = lookup(keys);
  const cgestor = preferGestor(meta.cgestor, cached);
  if (cgestor) {
    remember(cgestor, keys);
    req.nexusMetadata = { ...meta, cgestor };
    if (req.body?.state && typeof req.body.state === 'object') {
      const state = req.body.state;
      const canal = state.metadataCanal && typeof state.metadataCanal === 'object'
        ? state.metadataCanal
        : {};
      state.metadataCanal = { ...canal, cgestor: preferGestor(canal.cgestor, cgestor) };
      if (!state.cgestor) state.cgestor = cgestor;
    }
  }
}

module.exports = { restoreMarketplaceActor, remember, lookup, keysFrom, preferGestor };
