/** Campos actor marketplace — deben sobrevivir entre módulos del bridge. */
export const MARKETPLACE_ACTOR_KEYS = [
  'cgestor',
  'cgestor_in',
  'centidad',
  'citem',
  'cproductor',
  'ccanalalt_in',
  'cscanalalt_in',
  'ccanalalt',
  'cscanalalt',
] as const;

const MODULE_TOKEN_KEYS = [
  'nexus_access_token_pagos',
  'nexus_access_token_emision',
  'nexus_access_token_formulario',
  'nexus_access_token_ocr',
  'nexus_access_token',
] as const;

const ACTOR_SNAPSHOT_KEY = 'exelixi_marketplace_actor';

function decodeTokenMetadata(token: string): Record<string, unknown> | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr) as { metadata?: unknown };
    const meta = payload?.metadata;
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isActorValue(val: unknown): boolean {
  return val != null && String(val).trim() !== '';
}

function preferGestorCode(a: unknown, b: unknown): unknown {
  const sa = a != null ? String(a).trim() : '';
  const sb = b != null ? String(b).trim() : '';
  if (!sa) return sb || undefined;
  if (!sb) return sa || undefined;
  if (sb.startsWith(`${sa}-`)) return sb;
  if (sa.startsWith(`${sb}-`)) return sa;
  if (sa.includes('-') && !sb.includes('-')) return sa;
  if (sb.includes('-') && !sa.includes('-')) return sb;
  return sa;
}

function pickActorFields(meta?: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const key of MARKETPLACE_ACTOR_KEYS) {
    const val = meta[key];
    if (isActorValue(val)) out[key] = val;
  }
  return out;
}

export function readMarketplaceActorSnapshot(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(ACTOR_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function snapshotMarketplaceActor(
  meta?: Record<string, unknown> | null,
): Record<string, unknown> {
  const prev = readMarketplaceActorSnapshot();
  const incoming = pickActorFields(meta);
  const next: Record<string, unknown> = { ...prev };
  for (const key of MARKETPLACE_ACTOR_KEYS) {
    if (key === 'cgestor' || key === 'cgestor_in') {
      const chosen = preferGestorCode(prev[key], incoming[key]);
      if (isActorValue(chosen)) next[key] = chosen;
      continue;
    }
    if (isActorValue(incoming[key])) next[key] = incoming[key];
  }
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(ACTOR_SNAPSHOT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function rememberMarketplaceActorFromToken(token?: string | null): Record<string, unknown> {
  if (!token) return readMarketplaceActorSnapshot();
  return snapshotMarketplaceActor(decodeTokenMetadata(token));
}

function collectTokensFromBrowser(extraTokens: Iterable<string> = []): string[] {
  if (typeof window === 'undefined') return [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    tokens.push(t);
  };

  for (const raw of extraTokens) {
    push(raw);
  }
  for (const key of MODULE_TOKEN_KEYS) {
    try {
      push(sessionStorage.getItem(key));
    } catch {
      /* ignore */
    }
  }
  try {
    push(new URLSearchParams(window.location.search).get('nexus_token'));
  } catch {
    /* ignore */
  }
  return tokens;
}

export function collectSsoMetadataFromAllTokens(
  extraTokens: Iterable<string> = [],
): Record<string, unknown> {
  const tokens = collectTokensFromBrowser(extraTokens);
  const merged: Record<string, unknown> = {};

  for (const token of tokens) {
    const meta = decodeTokenMetadata(token);
    if (meta) Object.assign(merged, meta);
  }

  for (const key of MARKETPLACE_ACTOR_KEYS) {
    for (const token of tokens) {
      const meta = decodeTokenMetadata(token);
      const val = meta?.[key];
      if (val != null && String(val).trim() !== '') {
        merged[key] = val;
        break;
      }
    }
  }

  return merged;
}

export function mergeMarketplaceActorMetadata(
  base?: Record<string, unknown> | null,
  extraTokens: Iterable<string> = [],
): Record<string, unknown> {
  const fromTokens = collectSsoMetadataFromAllTokens(extraTokens);
  snapshotMarketplaceActor(fromTokens);
  snapshotMarketplaceActor(base);
  const snapshot = readMarketplaceActorSnapshot();
  const out: Record<string, unknown> = { ...(base || {}), ...fromTokens };

  for (const key of MARKETPLACE_ACTOR_KEYS) {
    if (key === 'cgestor' || key === 'cgestor_in') {
      const chosen = preferGestorCode(
        preferGestorCode(snapshot[key], fromTokens[key]),
        (base || {})[key],
      );
      if (isActorValue(chosen)) out[key] = chosen;
      continue;
    }
    for (const src of [snapshot, fromTokens, base || {}]) {
      const val = src[key];
      if (val != null && String(val).trim() !== '') {
        out[key] = val;
        break;
      }
    }
  }

  snapshotMarketplaceActor(out);
  return out;
}

export function extractActorMetadataFromBridgeData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const sessionMeta: Record<string, unknown> =
    data.metadataCanal && typeof data.metadataCanal === 'object'
      ? { ...(data.metadataCanal as Record<string, unknown>) }
      : {};
  for (const key of MARKETPLACE_ACTOR_KEYS) {
    const val = data[key];
    if (val != null && String(val).trim() !== '') {
      sessionMeta[key] = val;
    }
  }
  const extraTokens: string[] = [];
  if (typeof data.nexus_token === 'string') {
    extraTokens.push(data.nexus_token);
  }
  return mergeMarketplaceActorMetadata(sessionMeta, extraTokens);
}

export function enrichBridgePayloadForSave(
  payload: Record<string, unknown>,
  moduleTokenKey?: string,
): Record<string, unknown> {
  const extraTokens: string[] = [];
  if (typeof payload.nexus_token === 'string') {
    extraTokens.push(payload.nexus_token);
  }
  if (moduleTokenKey) {
    try {
      const stored = sessionStorage.getItem(moduleTokenKey);
      if (stored) extraTokens.push(stored);
    } catch {
      /* ignore */
    }
  }
  const meta = mergeMarketplaceActorMetadata(
    payload.metadataCanal as Record<string, unknown> | null,
    extraTokens,
  );
  const out: Record<string, unknown> = { ...payload, metadataCanal: meta };
  for (const key of MARKETPLACE_ACTOR_KEYS) {
    const val = meta[key];
    if (val != null && String(val).trim() !== '') {
      out[key] = val;
    }
  }
  return out;
}
