/**
 * Contexto del parametrizador: token ?token= + query (canal, cproductor…).
 * Misma idea que metadata SSO del flujo, pero para /config.
 */

export type ConfigPanelContext = {
  empresaId: number;
  /** Nombre legible de la empresa (URL o JWT). */
  empresaNombre: string;
  canal: string;
  cproductor?: string;
  cusuario?: string;
  ctipocanal?: string;
  metadata: Record<string, string>;
};

/** Parametrizador funerario solo preguntas: /config/preguntas o ?view=preguntas */
export function isPreguntasOnlyView(): boolean {
  try {
    const url = new URL(window.location.href);
    if (/\/config\/preguntas\/?$/i.test(url.pathname)) return true;
    const v = url.searchParams.get('view') || url.searchParams.get('solo');
    return v === 'preguntas';
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t || undefined;
}

/** Etiqueta UI del canal (la clave interna sigue siendo `default`). */
export function canalDisplayLabel(canal: string): string {
  const key = (canal || 'default').trim() || 'default';
  if (key === 'default') return 'General';
  return key;
}

/** Lee canal/metadata desde la URL del configurador (+ claims del JWT). */
export function readConfigPanelContext(): ConfigPanelContext {
  let q: URLSearchParams;
  try {
    q = new URL(window.location.href).searchParams;
  } catch {
    q = new URLSearchParams();
  }

  const token = q.get('token')?.trim() || '';
  const payload = token ? decodeJwtPayload(token) : null;
  const metaFromToken =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  // Solo metadata.canal define el bucket de preguntas (no cproductor).
  const canal =
    str(q.get('canal')) ||
    str(payload?.canal) ||
    str(metaFromToken.canal) ||
    'default';

  const cproductor =
    str(q.get('cproductor')) || str(payload?.cproductor) || str(metaFromToken.cproductor);
  const cusuario =
    str(q.get('cusuario')) || str(payload?.cusuario) || str(metaFromToken.cusuario);
  const ctipocanal =
    str(q.get('ctipocanal')) || str(payload?.ctipocanal) || str(metaFromToken.ctipocanal);

  // Empresa del token (como RCV / SSO); query ?empresaId= opcional
  const empresaId =
    Number(q.get('empresaId')) > 0
      ? Number(q.get('empresaId'))
      : Number(payload?.empresaId) > 0
        ? Number(payload?.empresaId)
        : Number(import.meta.env.VITE_EMPRESA_ID ?? 1) || 1;

  const empresaNombre =
    str(q.get('empresaNombre')) ||
    str(payload?.empresaNombre) ||
    `Empresa ${empresaId}`;

  const metadata: Record<string, string> = { canal };
  if (cproductor) metadata.cproductor = cproductor;
  if (cusuario) metadata.cusuario = cusuario;
  if (ctipocanal) metadata.ctipocanal = ctipocanal;

  return { empresaId, empresaNombre, canal, cproductor, cusuario, ctipocanal, metadata };
}
