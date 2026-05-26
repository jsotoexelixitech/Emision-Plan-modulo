/**
 * Bridge entre módulos seccionados (OCR → Formulario → Emisión → Pagos).
 *
 * Conecta los módulos vía sessionId común (?sid=) gestionado por el mock-server
 * (admin nexus) en `http://localhost:3091/api/flow/*`. Cuando un módulo termina,
 * llama a `bridgeAdvance()` para guardar su estado y redirigir al siguiente
 * módulo, conservando todo el wizardStore.
 *
 * Modo de uso:
 *   import './lib/bridge';   // se importa desde main.tsx — auto-arranca
 *
 * Si NO hay `?sid=` en la URL, el bridge se desactiva (modo standalone).
 *
 * Endpoints consumidos:
 *   GET  /api/flow/session/:sid     → rehidratación al cargar
 *   POST /api/flow/save/:sid        → save parcial (futuro: autosave)
 *   POST /api/flow/done/:sid?from=N → terminar módulo + obtener nextUrl
 */

import { useWizardStore } from '../store/wizardStore';

// ── Configuración por puerto ────────────────────────────────────────────────
const PORT_TO_ORDER: Record<string, number> = {
  '5181': 1, // OCR
  '5182': 2, // Formulario
  '5183': 3, // Emisión
  '5184': 4, // Pagos
};

const PORT_TO_TOKEN_KEY: Record<string, string> = {
  '5181': 'nexus_access_token_ocr',
  '5182': 'nexus_access_token_formulario',
  '5183': 'nexus_access_token_emision',
  '5184': 'nexus_access_token_pagos',
};

function getModuleTokenKey(): string {
  return PORT_TO_TOKEN_KEY[window.location.port ?? ''] ?? 'nexus_access_token';
}

const BRIDGE_HOST = (import.meta.env?.VITE_NEXUS_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3092';
const BRIDGE_KEY  = (import.meta.env?.VITE_NEXUS_API_KEY as string | undefined) ?? '';
const QUERY_KEY   = 'sid';

// ── Helpers ─────────────────────────────────────────────────────────────────
function getSidFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(QUERY_KEY);
  } catch { return null; }
}

function getNexusTokenFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('nexus_token');
  } catch { return null; }
}

function moduleOrder(): number | null {
  const port = window.location.port || '';
  return PORT_TO_ORDER[port] ?? null;
}

/**
 * Auto-arranque: si hay nexus_token pero no sid, intenta iniciar el flujo
 * encadenado llamando a /api/flow/start-from-token.
 * Si el servidor responde 409 (módulo standalone o no es punto de entrada),
 * simplemente se ignora y el módulo corre solo.
 * Si tiene éxito, agrega ?sid=... a la URL con replaceState (sin recarga)
 * y devuelve el sid para que el bridge se active.
 */
async function tryAutoStart(nexusToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${BRIDGE_HOST}/api/flow/start-from-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nexus_token: nexusToken }),
    });

    if (r.status === 409) {
      // Flujo standalone; no hay encadenamiento que hacer
      console.info('[bridge] standalone mode — no chaining needed');
      return null;
    }

    if (!r.ok) return null;

    const data = await r.json() as { success: boolean; data?: { sid: string; firstUrl: string } };
    if (!data.success || !data.data?.sid) return null;

    const sid = data.data.sid;
    // Añadir sid a la URL actual sin recargar la página
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('sid', sid);
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }

    console.info('[bridge] auto-start — sid=' + sid + ' totalActive=' + (data.data as unknown as { totalActive?: number })?.totalActive);
    return sid;
  } catch (e) {
    console.warn('[bridge] auto-start failed', e);
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };
  if (BRIDGE_KEY) headers['x-api-key'] = BRIDGE_KEY;
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// ── Estado del bridge ───────────────────────────────────────────────────────
interface BridgeAPI {
  active: boolean;
  sid:    string | null;
  order:  number | null;
  hydrate: () => Promise<void>;
  save:    (extra?: Record<string, unknown>) => Promise<void>;
  advance: (extra?: Record<string, unknown>) => Promise<{ finished: boolean; nextUrl?: string }>;
}

declare global {
  interface Window {
    __bridge?: BridgeAPI;
    __bridgeAdvance?: (extra?: Record<string, unknown>) => Promise<void>;
  }
}

// ── Implementación ──────────────────────────────────────────────────────────
function makeBridge(): BridgeAPI {
  const sid   = getSidFromUrl();
  const order = moduleOrder();
  const active = Boolean(sid && order);

  const collectState = (): Record<string, unknown> => {
    const s = useWizardStore.getState() as unknown as Record<string, unknown>;
    // Excluye actions del store; sólo persiste data
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'function') out[k] = v;
    }
    // Incluye nexus_token para que módulos posteriores puedan autenticarse
    const nexusToken =
      getNexusTokenFromUrl() ||
      sessionStorage.getItem(getModuleTokenKey());
    if (nexusToken) out.nexus_token = nexusToken;
    return out;
  };

  // Campos cuyo valor NO debe sobrescribirse durante la hidratación.
  // Cada módulo gestiona su propio step interno (OCR=1, Form=2/3, Emisión=4, Pagos=5/6).
  const HYDRATE_EXCLUDE = new Set([
    'step',
    'documents',     // OCR mantiene su estado de progreso local
    'quoteState',    // estados de UI transitorios
    'quoteError',
  ]);

  const applyHydration = (data: Record<string, unknown>) => {
    if (!data || typeof data !== 'object') return;
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!HYDRATE_EXCLUDE.has(k)) filtered[k] = v;
    }
    const set = (useWizardStore as unknown as { setState: (p: Partial<Record<string, unknown>>) => void }).setState;
    set(filtered);
  };

  const hydrate = async () => {
    if (!active || !sid) return;
    try {
      const r = await fetchJson<{ success: boolean; data: { data: Record<string, unknown> } }>(
        `${BRIDGE_HOST}/api/flow/session/${sid}`,
      );
      if (r?.data?.data) {
        applyHydration(r.data.data);
        const token = r.data.data.nexus_token;
        if (token && typeof token === 'string') {
          sessionStorage.setItem(getModuleTokenKey(), token);
        }
      }
      // eslint-disable-next-line no-console
      console.info('[bridge] hydrated session', sid);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[bridge] hydrate failed', e);
    }
  };

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!active || !sid) return;
    try {
      await fetchJson(`${BRIDGE_HOST}/api/flow/save/${sid}`, {
        method: 'POST',
        body: JSON.stringify({ ...collectState(), ...extra }),
      });
    } catch (e) { console.warn('[bridge] save failed', e); }
  };

  const advance = async (extra: Record<string, unknown> = {}) => {
    if (!active || !sid || !order) return { finished: true };
    try {
      const r = await fetchJson<{
        success: boolean;
        data: { finished: boolean; nextUrl?: string };
      }>(`${BRIDGE_HOST}/api/flow/done/${sid}?from=${order}`, {
        method: 'POST',
        body: JSON.stringify({ ...collectState(), ...extra }),
      });
      const out = r?.data;
      if (out?.nextUrl) {
        // Pequeño delay para mostrar el toast de éxito antes de saltar
        setTimeout(() => { window.location.href = out.nextUrl as string; }, 900);
      }
      return out ?? { finished: true };
    } catch (e) {
      console.warn('[bridge] advance failed', e);
      return { finished: true };
    }
  };

  return { active, sid, order, hydrate, save, advance };
}

// ── Auto-init ───────────────────────────────────────────────────────────────

async function init() {
  let bridge = makeBridge();

  // Si no hay sid pero hay nexus_token, intentar auto-arranque del flujo
  if (!bridge.active && typeof window !== 'undefined') {
    const nexusToken = getNexusTokenFromUrl();
    if (nexusToken) {
      const autoSid = await tryAutoStart(nexusToken);
      if (autoSid) {
        // Re-crear el bridge ahora que el sid está en la URL
        bridge = makeBridge();
      }
    }
  }

  if (bridge.active && typeof window !== 'undefined') {
    window.__bridge        = bridge;
    window.__bridgeAdvance = (extra) => bridge.advance(extra ?? {}).then(() => undefined);

    // Hidrata al cargar
    bridge.hydrate();

  // Auto-advance para módulos cuyo "fin" es un cambio de step en el store:
  //   OCR (1):    step 1 → 2
  //   Pagos (4):  step 5 → 6 (success)
  // Para Formulario (2) y Emisión (3) el avance se dispara desde el App.tsx
  // cuando el botón "Continuar" / "Confirmar plan" / "Guardar" tiene éxito.
  let lastStep: number | undefined;
  useWizardStore.subscribe((s: { step?: number }) => {
    const step = s?.step;
    if (typeof step !== 'number' || step === lastStep) return;
    const prev = lastStep;
    lastStep = step;

    // OCR completado: step pasó de 1 → 2
    if (bridge.order === 1 && prev === 1 && step === 2) {
      bridge.advance().catch(() => {});
    }
    // Pagos completado: step llegó a 6 (success)
    if (bridge.order === 4 && step === 6) {
      // No hay siguiente módulo; sólo registra el cierre del flujo.
      bridge.advance().catch(() => {});
    }
  });

    // eslint-disable-next-line no-console
    console.info('[bridge] active — sid=' + bridge.sid + ' order=' + bridge.order);
  }

  return bridge;
}

// Exportamos una promesa; los consumidores que necesiten el bridge esperan a que
// el auto-start se resuelva. El import './lib/bridge' sigue siendo suficiente.
const bridgePromise = init();
export default bridgePromise;
