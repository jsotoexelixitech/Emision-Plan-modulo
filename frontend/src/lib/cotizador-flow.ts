import { mergeExelixiWizardHandoff, readExelixiWizardHandoff, type ExelixiWizardHandoff } from './exelixi-wizard-handoff';

const COTIZADOR_FLOW_KEY = 'exelixi_cotizador_flow';

/** Flujo cotizador RCV: solo vehículo → planes (sin OCR, tomador ni pagos). */
export function isCotizadorFlow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get('flow');
    const product = params.get('product');
    if (flow === 'cotizador' && product === 'rcv') {
      sessionStorage.setItem(COTIZADOR_FLOW_KEY, '1');
      return true;
    }
    if (flow && flow !== 'cotizador') {
      sessionStorage.removeItem(COTIZADOR_FLOW_KEY);
      return false;
    }
    return sessionStorage.getItem(COTIZADOR_FLOW_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistCotizadorFromHints(hints?: {
  url?: string | null;
  nombre?: string | null;
  moduloNombre?: string | null;
}): boolean {
  if (hints?.url) {
    try {
      const parsed = new URL(hints.url, window.location.origin);
      if (parsed.searchParams.get('flow') === 'cotizador' && parsed.searchParams.get('product') === 'rcv') {
        sessionStorage.setItem(COTIZADOR_FLOW_KEY, '1');
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  const label = `${hints?.nombre ?? ''} ${hints?.moduloNombre ?? ''}`.toLowerCase();
  if (label.includes('cotizador') && label.includes('rcv')) {
    sessionStorage.setItem(COTIZADOR_FLOW_KEY, '1');
    return true;
  }
  return false;
}

export function ensureCotizadorFlowQueryParam(active: boolean): void {
  if (!active || isCotizadorFlow()) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('flow', 'cotizador');
    url.searchParams.set('product', 'rcv');
    window.history.replaceState({}, '', url.toString());
    sessionStorage.setItem(COTIZADOR_FLOW_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Restaura wizardStore desde handoff standalone (formulario → emisión cotizador). */
export function applyCotizadorWizardHandoff(
  setState: (partial: Record<string, unknown>) => void,
  goTo: (step: number) => void,
): boolean {
  if (!isCotizadorFlow()) return false;

  const handoff = readExelixiWizardHandoff();
  if (!handoff) return false;

  const { savedAt: _savedAt, ...data } = handoff;
  setState(data as Record<string, unknown>);
  goTo(4);
  return true;
}

export function mergeCotizadorHandoff(snapshot?: Partial<ExelixiWizardHandoff>): void {
  if (snapshot) mergeExelixiWizardHandoff(snapshot);
}
