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
import { resolveNexusApiUrl } from '../nexus/nexus-core';
import {
  adoptNexusTokenFromUrl,
  getNexusTokenFromUrl,
} from './nexus-token-client';
import { canNavigateToStep, getDefaultRequiredDocs } from './wizard-navigation';
import { getProductConfig } from './product';
import { BUILDER_PRODUCT_STORAGE_KEY, isExelixiCatalogFlow, ensureExelixiFlowQueryParam } from './exelixi-catalog';
import { ensureCotizadorFlowQueryParam, isCotizadorFlow } from './cotizador-flow';
import { applyWizardStepFromUrl, defaultStepForModule, stepToModuleOrder } from './wizard-step';
import { isFrecuenciaFraccionada } from './frecuencia';
import {
  enrichBridgePayloadForSave,
  extractActorMetadataFromBridgeData,
} from './sso-metadata';
import { readFlowHandoff } from './flow-handoff';

// ── Configuración por puerto (dev local) o hostname (HTTPS sslip.io) ───────
const PORT_TO_ORDER: Record<string, number> = {
  '5181': 1, // OCR
  '5182': 2, // Formulario
  '5183': 3, // Emisión
  '5184': 4, // Pagos
  '5180': 4, // Pagos (legacy)
};

const PORT_TO_TOKEN_KEY: Record<string, string> = {
  '5181': 'nexus_access_token_ocr',
  '5182': 'nexus_access_token_formulario',
  '5183': 'nexus_access_token_emision',
  '5184': 'nexus_access_token_pagos',
  '5180': 'nexus_access_token_pagos',
};

/** cierrelmds HTTPS — un dominio, varios prefijos Apache */
const PATH_PREFIX_TO_ORDER: [string, number][] = [
  ['/formulario', 2],
  ['/emision', 3],
  ['/pagos', 4],
  ['/ocr', 1],
];

const PATH_PREFIX_TO_TOKEN_KEY: [string, string][] = [
  ['/formulario', 'nexus_access_token_formulario'],
  ['/emision', 'nexus_access_token_emision'],
  ['/pagos', 'nexus_access_token_pagos'],
  ['/ocr', 'nexus_access_token_ocr'],
];

/** srv001 HTTPS sslip.io — subdominio por módulo */
const HOST_TO_ORDER: Record<string, number> = {
  'ocr.200-75-131-138.sslip.io': 1,
  'form.200-75-131-138.sslip.io': 2,
  'emision.200-75-131-138.sslip.io': 3,
  'pagos.200-75-131-138.sslip.io': 4,
  'ocr.exelixitech.com': 1,
  'formulario.exelixitech.com': 2,
  'emision.exelixitech.com': 3,
  'pagos.exelixitech.com': 4,
};

const HOST_TO_TOKEN_KEY: Record<string, string> = {
  'ocr.200-75-131-138.sslip.io': 'nexus_access_token_ocr',
  'form.200-75-131-138.sslip.io': 'nexus_access_token_formulario',
  'emision.200-75-131-138.sslip.io': 'nexus_access_token_emision',
  'pagos.200-75-131-138.sslip.io': 'nexus_access_token_pagos',
  'ocr.exelixitech.com': 'nexus_access_token_ocr',
  'formulario.exelixitech.com': 'nexus_access_token_formulario',
  'emision.exelixitech.com': 'nexus_access_token_emision',
  'pagos.exelixitech.com': 'nexus_access_token_pagos',
};

function matchPathPrefix<T>(rules: [string, T][]): T | null {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  for (const [prefix, value] of rules) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return value;
  }
  return null;
}

function getModuleTokenKey(): string {
  const fromPath = matchPathPrefix(PATH_PREFIX_TO_TOKEN_KEY);
  if (fromPath) return fromPath;
  const host = window.location.hostname;
  if (HOST_TO_TOKEN_KEY[host]) return HOST_TO_TOKEN_KEY[host];
  return PORT_TO_TOKEN_KEY[window.location.port ?? ''] ?? 'nexus_access_token';
}

const bridgeHost = () =>
  resolveNexusApiUrl(import.meta.env?.VITE_NEXUS_API_URL as string | undefined);
const QUERY_KEY   = 'sid';

// ── Helpers ─────────────────────────────────────────────────────────────────
function getSidFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(QUERY_KEY);
  } catch { return null; }
}

function moduleOrder(): number | null {
  const envOrder = import.meta.env.VITE_BRIDGE_MODULE_ORDER;
  if (envOrder) {
    const n = Number(envOrder);
    if (Number.isFinite(n)) return n;
  }
  const fromPath = matchPathPrefix(PATH_PREFIX_TO_ORDER);
  if (fromPath !== null) return fromPath;
  const host = window.location.hostname.toLowerCase();
  if (HOST_TO_ORDER[host]) return HOST_TO_ORDER[host];
  if (host.startsWith('ocr.')) return 1;
  if (host.startsWith('formulario.') || host.startsWith('form.')) return 2;
  if (host.startsWith('emision.')) return 3;
  if (host.startsWith('pagos.')) return 4;
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
    const r = await fetch(`${bridgeHost()}/api/flow/start-from-token`, {
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
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// ── Estado del bridge ───────────────────────────────────────────────────────
interface BridgeAPI {
  active: boolean;
  sid:    string | null;
  order:  number | null;
  ready:  Promise<void>;
  hydrate: () => Promise<void>;
  save:    (extra?: Record<string, unknown>) => Promise<void>;
  advance: (extra?: Record<string, unknown>) => Promise<{ finished: boolean; nextUrl?: string }>;
  navigateToStep: (targetStep: number) => Promise<boolean>;
}

declare global {
  interface Window {
    __bridgeAdvance?: (extra?: Record<string, unknown>) => Promise<void>;
    __bridgeNavigateStep?: (targetStep: number) => Promise<boolean>;
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
    // Limpieza de datos fantasma — no aplicar en flujo catálogo Exélixi
    const isCatalogFlow = isExelixiCatalogFlow();
    const prod = sessionStorage.getItem('exelixi_product') || 'rcv';
    if (!isCatalogFlow) {
      if (prod === 'funerario') {
        delete out.vehicle;
      } else if (prod === 'rcv') {
        delete out.funeral;
      }
    }
    out.product = prod;
    out.exelixiCatalogFlow = isCatalogFlow;
    out.cotizadorFlow = isCotizadorFlow();
    try {
      const builderRaw = sessionStorage.getItem(BUILDER_PRODUCT_STORAGE_KEY);
      if (builderRaw) out.builderProduct = JSON.parse(builderRaw);
    } catch { /* ignore */ }

    // Incluye nexus_token renovado (sessionStorage) para el siguiente módulo
    const nexusToken =
      sessionStorage.getItem(getModuleTokenKey()) ||
      getNexusTokenFromUrl();
    if (nexusToken) out.nexus_token = nexusToken;
    // Solo OCR (order=1) persiste documents; otros módulos tienen slots idle que
    // sobrescribirían el expediente procesado en la sesión del flujo.
    if (order !== 1) delete out.documents;

    const prodKey = String(out.product ?? prod);
    const freq = prodKey === 'funerario'
      ? (out.funeral as { frecuencia?: string } | undefined)?.frecuencia
      : (out.rcv as { frecuencia?: string } | undefined)?.frecuencia;
    if (typeof out.fraccionado !== 'boolean') {
      out.fraccionado = isFrecuenciaFraccionada(freq);
    }

    return enrichBridgePayloadForSave(out, getModuleTokenKey());
  };

  // Campos cuyo valor NO debe sobrescribirse durante la hidratación.
  // OCR (order=1) conserva documents locales; el resto necesita el expediente del flujo.
  const HYDRATE_EXCLUDE = new Set([
    'step',
    ...(order === 1 ? ['documents' as const] : []),
    'quoteState',
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

    const store = useWizardStore.getState();
    const canalMeta = extractActorMetadataFromBridgeData({
      ...(store.metadataCanal || {}),
      ...data,
    });
    if (Object.keys(canalMeta).length > 0) {
      store.setMetadataCanal(canalMeta);
    }
  };

  const hydrate = async () => {
    if (!active || !sid) return;
    try {
      const r = await fetchJson<{ success: boolean; data: { data: Record<string, unknown> } }>(
        `${bridgeHost()}/api/flow/session/${sid}`,
      );
      if (r?.data?.data) {
        applyHydration(r.data.data);
        const urlToken = getNexusTokenFromUrl();
        const sessionToken = r.data.data.nexus_token;
        const moduleKey = getModuleTokenKey();
        const stored = sessionStorage.getItem(moduleKey);
        if (sessionToken && typeof sessionToken === 'string' && !stored) {
          sessionStorage.setItem(moduleKey, sessionToken);
        } else if (!stored && urlToken) {
          sessionStorage.setItem(moduleKey, urlToken);
        }
        // Propaga el producto (rcv | funerario) entre módulos: getProductConfig()
        // lo lee desde sessionStorage, así no depende de que la URL lo arrastre.
        const sessionProduct = r.data.data.product;
        if (sessionProduct === 'rcv' || sessionProduct === 'funerario') {
          try { sessionStorage.setItem('exelixi_product', sessionProduct); } catch { /* ignore */ }
        }
        if (r.data.data.exelixiCatalogFlow) {
          ensureExelixiFlowQueryParam(true);
        }
        if (r.data.data.cotizadorFlow) {
          ensureCotizadorFlowQueryParam(true);
        }
        const builderProduct = r.data.data.builderProduct;
        if (builderProduct && typeof builderProduct === 'object') {
          try {
            sessionStorage.setItem(BUILDER_PRODUCT_STORAGE_KEY, JSON.stringify(builderProduct));
          } catch { /* ignore */ }
        }
      }
      // eslint-disable-next-line no-console
      console.info('[bridge] hydrated session', sid);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[bridge] hydrate failed', e);
    }
    const local = readFlowHandoff();
    const storeV = (useWizardStore.getState() as { vehicle?: { cmarca?: string; cversion?: string } }).vehicle;
    const localV = local?.vehicle as { cmarca?: string; cversion?: string } | undefined;
    if (local && localV?.cmarca && (!storeV?.cmarca || !storeV?.cversion)) {
      applyHydration(local);
    }
  };

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!active || !sid) return;
    try {
      await fetchJson(`${bridgeHost()}/api/flow/save/${sid}`, {
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
      }>(`${bridgeHost()}/api/flow/done/${sid}?from=${order}`, {
        method: 'POST',
        body: JSON.stringify({ ...collectState(), ...extra }),
      });
      const out = r?.data;
      if (out?.nextUrl) {
        let target = out.nextUrl as string;
        if (isExelixiCatalogFlow()) {
          try {
            const url = new URL(target, window.location.origin);
            url.searchParams.set('flow', 'exelixi-catalog');
            target = url.toString();
          } catch { /* ignore */ }
        }
        if (isCotizadorFlow()) {
          try {
            const url = new URL(target, window.location.origin);
            url.searchParams.set('flow', 'cotizador');
            url.searchParams.set('product', 'rcv');
            target = url.toString();
          } catch { /* ignore */ }
        }
        // Pequeño delay para mostrar el toast de éxito antes de saltar
        setTimeout(() => { window.location.href = target; }, 900);
      }
      return out ?? { finished: true };
    } catch (e) {
      console.warn('[bridge] advance failed', e);
      return { finished: true };
    }
  };

  const navigateToStep = async (targetStep: number): Promise<boolean> => {
    const goTo = useWizardStore.getState().goTo;
    const state = useWizardStore.getState();
    const currentStep = state.step;
    if (targetStep < 1 || targetStep > 5 || targetStep === currentStep) return false;

    const navSnapshot = {
      step: currentStep,
      ocrDone: state.ocrDone,
      documents: state.documents,
      selectedPlan: state.selectedPlan,
      requiredDocTypes: getDefaultRequiredDocs(getProductConfig().id),
    };
    if (!canNavigateToStep(currentStep, targetStep, navSnapshot)) {
      console.warn('[bridge] navigateToStep blocked', currentStep, '->', targetStep);
      return false;
    }

    const currentModule = stepToModuleOrder(currentStep);
    const targetModule = stepToModuleOrder(targetStep);

    if (active && sid) await save();

    if (currentModule === targetModule) {
      goTo(targetStep);
      return true;
    }

    if (!active || !sid) {
      console.warn('[bridge] navigateToStep: se requiere sesión encadenada (?sid=)');
      return false;
    }

    try {
      const r = await fetchJson<{
        success: boolean;
        data: { url: string };
      }>(`${bridgeHost()}/api/flow/navigate/${sid}?to=${targetModule}`, {
        method: 'POST',
        body: JSON.stringify(collectState()),
      });
      if (r?.data?.url) {
        const url = new URL(r.data.url);
        url.searchParams.set('wizardStep', String(targetStep));
        window.location.href = url.toString();
        return true;
      }
    } catch (e) {
      console.warn('[bridge] navigateToStep failed', e);
    }
    return false;
  };

  return { active, sid, order, ready: Promise.resolve(), hydrate, save, advance, navigateToStep };
}

// ── Auto-init ───────────────────────────────────────────────────────────────

async function init() {
  let bridge = makeBridge();

  adoptNexusTokenFromUrl(getModuleTokenKey());

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
    const hydratePromise = bridge.hydrate().then(() => {
      const goTo = useWizardStore.getState().goTo;
      const applied = applyWizardStepFromUrl(goTo);
      if (applied == null && bridge.order != null) {
        goTo(defaultStepForModule(bridge.order));
      }
    });

    bridge.ready = hydratePromise;
    window.__bridge        = bridge;
    window.__bridgeAdvance = (extra) => bridge.advance(extra ?? {}).then(() => undefined);
    window.__bridgeNavigateStep = (targetStep) => bridge.navigateToStep(targetStep);

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
