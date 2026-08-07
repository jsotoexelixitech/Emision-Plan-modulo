/**
 * nexus-core.ts — NexusGuard core para modulo-emision (Paso 4: Plan / Cotización)
 */

import { getNexusToken, persistNexusToken } from '../lib/nexus-token-client';

const STORAGE_KEY = 'nexus_access_token_emision';

const INTERNAL_HTTP_RE = /^http:\/\/(192\.168\.|10\.|127\.0\.0\.1|localhost)(:\d+)?/i;

/**
 * Resuelve la URL de nexus-api en el navegador.
 * En páginas HTTPS no se puede llamar a IP interna HTTP (mixed content).
 */
export function resolveNexusApiUrl(configured?: string): string {
  const trimmed = configured?.trim().replace(/\/$/, '');
  const pageIsHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (pageIsHttps && trimmed && INTERNAL_HTTP_RE.test(trimmed)) {
    return `${window.location.origin}/nexus-api`;
  }
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined' && pageIsHttps) {
    return `${window.location.origin}/nexus-api`;
  }
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
  const tokenFromUrl = new URLSearchParams(window.location.search).get('nexus_token');
  if (tokenFromUrl && !getNexusToken(STORAGE_KEY)) {
    persistNexusToken(STORAGE_KEY, tokenFromUrl);
  }

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
