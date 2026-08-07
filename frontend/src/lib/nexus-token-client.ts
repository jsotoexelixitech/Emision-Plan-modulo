/**
 * Cliente: resolución y persistencia del nexus_token en módulos front.
 * Prioriza sessionStorage (renovado por NexusGuard/heartbeat) sobre la URL.
 */

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

export function attachNexusTokenAxios(
  api: {
    interceptors: {
      request: { use: (fn: (config: { headers: { set: (k: string, v: string) => void } }) => unknown) => void };
      response: { use: (fn: (res: { headers: Record<string, string> }) => unknown) => void };
    };
  },
  storageKey: string,
): void {
  api.interceptors.request.use((config) => {
    const token = getNexusToken(storageKey);
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  api.interceptors.response.use((response) => {
    const refreshed =
      response.headers['x-nexus-token-refreshed'] ??
      response.headers['X-Nexus-Token-Refreshed'];
    if (refreshed && typeof refreshed === 'string') {
      persistNexusToken(storageKey, refreshed);
    }
    return response;
  });
}
