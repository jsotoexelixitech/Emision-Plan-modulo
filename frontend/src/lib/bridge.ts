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

const BRIDGE_HOST   = 'http://localhost:3091';
const QUERY_KEY     = 'sid';

// ── Helpers ─────────────────────────────────────────────────────────────────
function getSidFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(QUERY_KEY);
  } catch { return null; }
}

function moduleOrder(): number | null {
  const port = window.location.port || '';
  return PORT_TO_ORDER[port] ?? null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
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
    const s = useWizardStore.getState() as Record<string, unknown>;
    // Excluye actions del store; sólo persiste data
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'function') out[k] = v;
    }
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
      if (r?.data?.data) applyHydration(r.data.data);
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
const bridge = makeBridge();

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

export default bridge;
