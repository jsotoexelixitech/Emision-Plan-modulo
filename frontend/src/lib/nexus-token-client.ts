/**
 * Cliente: resolución y persistencia del nexus_token en módulos front.
 * Prioriza sessionStorage (renovado por NexusGuard/heartbeat) sobre la URL.
 */

import type { AxiosInstance } from 'axios';

export function getNexusToken(storageKey: string): string | null {
  try {
    const fromStorage = sessionStorage.getItem(storageKey);
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }
  try {
    return new URLSearchParams(window.location.search).get('nexus_token');
  } catch {
    return null;
  }
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
