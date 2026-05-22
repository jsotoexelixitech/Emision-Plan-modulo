/**
 * nexus-core.ts — NexusGuard core para modulo-emision (Paso 4: Plan / Cotización)
 */

const STORAGE_KEY = 'nexus_access_token_emision';

export interface NexusVerifyResult {
  active: boolean;
  empresa?: { id: number; nombre: string; rif: string };
  submodulo?: { id: number; nombre: string; url: string | null; accessUrl: string | null };
  reason?: string;
}

export async function verifyNexusAccess(nexusApiUrl: string): Promise<NexusVerifyResult> {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('nexus_token');

  if (tokenFromUrl) {
    sessionStorage.setItem(STORAGE_KEY, tokenFromUrl);
  }

  const token = tokenFromUrl || sessionStorage.getItem(STORAGE_KEY);

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
      return { active: true, empresa: data.empresa, submodulo: data.submodulo };
    }

    return { active: false, reason: data.reason ?? 'Servicio no disponible para esta empresa.' };
  } catch {
    return { active: false, reason: 'No se pudo conectar con el servidor de autorización.' };
  }
}
