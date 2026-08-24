/**
 * nexus-core.ts — NexusGuard core para modulo-emision (Paso 4: Plan / Cotización)
 */

import { getNexusToken, persistNexusToken } from '../lib/nexus-token-client';

const STORAGE_KEY = 'nexus_access_token_emision';

const INTERNAL_HTTP_RE = /^http:\/\/(192\.168\.|10\.|127\.0\.0\.1|localhost)(:\d+)?/i;

const MODULE_NEXUS_API: [string, string][] = [
  ['/ocr', '/ocr/nexus-api'],
  ['/formulario', '/formulario/nexus-api'],
  ['/emision', '/emision/nexus-api'],
  ['/pagos', '/pagos/nexus-api'],
];

function resolveModuleNexusApiOnHttps(): string | null {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return null;
  }
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  for (const [prefix, apiPath] of MODULE_NEXUS_API) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `${window.location.origin}${apiPath}`;
    }
  }
  return null;
}

function useModuleProxyBuild(): boolean {
  const flag = import.meta.env.VITE_NEXUS_USE_MODULE_PROXY;
  return flag === '1' || flag === 'true';
}

function resolveSameOriginNexusApi(
  trimmed: string,
  moduleOnHttps: string | null,
): string | null {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return null;
  }
  let configuredHost = '';
  try {
    if (trimmed && !INTERNAL_HTTP_RE.test(trimmed)) {
      configuredHost = new URL(trimmed).hostname;
    }
  } catch {
    /* ignore */
  }
  const pageHost = window.location.hostname;
  if (!configuredHost || configuredHost !== pageHost) {
    return moduleOnHttps ?? `${window.location.origin}/nexus-api`;
  }
  return null;
}

export function resolveNexusApiUrl(configured?: string): string {
  const moduleOnHttps = resolveModuleNexusApiOnHttps();
  if (moduleOnHttps && useModuleProxyBuild()) {
    return moduleOnHttps;
  }

  const trimmed = configured?.trim().replace(/\/$/, '') ?? '';
  const sameOrigin = resolveSameOriginNexusApi(trimmed, moduleOnHttps);
  if (sameOrigin) return sameOrigin;

  if (trimmed && !INTERNAL_HTTP_RE.test(trimmed)) {
    return trimmed;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return moduleOnHttps ?? `${window.location.origin}/nexus-api`;
  }
  if (trimmed) return trimmed;
  return 'http://localhost:3092';
}

export interface NexusVerifyResult {
  active: boolean;
  product?: 'rcv' | 'funerario';
  empresa?: { id: number; nombre: string; rif: string };
  submodulo?: {
    id: number;
    nombre: string;
    url: string | null;
    moduloNombre?: string | null;
    accessUrl: string | null;
  };
  reason?: string;
}

export async function verifyNexusAccess(nexusApiUrl: string): Promise<NexusVerifyResult> {
  const token = getNexusToken(STORAGE_KEY);

  if (!token) {
    return {
      active: false,
      reason: 'No se proporcionó token de acceso. Contacte a su administrador.',
    };
  }

  try {
    const res = await fetch(`${nexusApiUrl.replace(/\/$/, '')}/api/access/verify`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (data.active) {
      // Token deslizante: el backend reemite un nexus_token fresco en cada
      // verify. Se guarda para que la sesión no caduque (el token del navegador
      // expira en 1 h; así se renueva en cada verify sin recargar la página).
      if (data.access_token) {
        persistNexusToken(STORAGE_KEY, data.access_token);
      }
      return {
        active: true,
        product: data.product,
        empresa: data.empresa,
        submodulo: data.submodulo,
      };
    }

    return { active: false, reason: data.reason ?? 'Servicio no disponible para esta empresa.' };
  } catch {
    return { active: false, reason: 'No se pudo conectar con el servidor de autorización.' };
  }
}
