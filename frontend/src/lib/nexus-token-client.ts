/**
 * Cliente: resolución y persistencia del nexus_token en módulos front.
 *
 * Regla de precedencia:
 *   1. `?nexus_token=` en la URL — entrada SSO / bridge (nueva sesión, nuevo usuario).
 *   2. sessionStorage — navegación interna y tokens renovados por verify/heartbeat.
 *
 * Si la URL trae un token distinto al guardado, se reemplaza el storage para evitar
 * que un iframe reutilizado (p. ej. QASys2000) siga usando el JWT del usuario anterior.
 */

import type { AxiosInstance } from 'axios';

/** Lee el token SSO explícito en la query (sso-delegate, advance del bridge). */
export function getNexusTokenFromUrl(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get('nexus_token');
    return token && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Sincroniza sessionStorage cuando la URL trae un token distinto (nueva sesión SSO).
 * @returns token adoptado desde la URL, o null si no hay token en la URL.
 */
export function adoptNexusTokenFromUrl(storageKey: string): string | null {
  const fromUrl = getNexusTokenFromUrl();
  if (!fromUrl) return null;

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored !== fromUrl) {
      sessionStorage.setItem(storageKey, fromUrl);
    }
  } catch {
    /* ignore */
  }
  return fromUrl;
}

export function getNexusToken(storageKey: string): string | null {
  const fromUrl = adoptNexusTokenFromUrl(storageKey);
  if (fromUrl) return fromUrl;

  try {
    const fromStorage = sessionStorage.getItem(storageKey);
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }
  return null;
}

export function persistNexusToken(storageKey: string, token: string): void {
  try {
    sessionStorage.setItem(storageKey, token);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('nexus_token', token);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* ignore */
  }
}

function readRefreshedToken(headers: Record<string, unknown>): string | null {
  const raw =
    headers['x-nexus-token-refreshed'] ??
    headers['X-Nexus-Token-Refreshed'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function attachNexusTokenAxios(api: AxiosInstance, storageKey: string): void {
  api.interceptors.request.use((config) => {
    const token = getNexusToken(storageKey);
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  api.interceptors.response.use((response) => {
    const refreshed = readRefreshedToken(
      response.headers as unknown as Record<string, unknown>,
    );
    if (refreshed) {
      persistNexusToken(storageKey, refreshed);
    }
    return response;
  });
}

/** Metadata embebida en JWT tenant_access (sso-delegate / bridge). */
export function decodeNexusTokenMetadata(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { metadata?: unknown };
    if (
      payload.metadata &&
      typeof payload.metadata === 'object' &&
      !Array.isArray(payload.metadata)
    ) {
      return payload.metadata as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Sincroniza metadataCanal del token activo (prioriza URL sobre storage). */
export function applyMetadataFromNexusToken(
  storageKey: string,
  apply: (metadata: Record<string, unknown>) => void,
): void {
  const token = getNexusToken(storageKey);
  if (!token) return;
  const metadata = decodeNexusTokenMetadata(token);
  if (metadata) apply(metadata);
}
