import { mergeExelixiWizardHandoff, type ExelixiWizardHandoff } from './exelixi-wizard-handoff';

export type BuilderProductBranch =
  | 'AUTOMOVIL'
  | 'SALUD'
  | 'VIDA'
  | 'PATRIMONIAL'
  | 'INCLUSIVO'
  | 'RCV_OBLIGATORIO';

export interface BuilderCatalogProduct {
  id: string;
  commercialName: string;
  internalCode: string;
  branch: BuilderProductBranch;
  status: string;
  productPlans?: { id?: string; name: string; isActive?: boolean; isRecommended?: boolean }[];
}

export const BUILDER_PRODUCT_STORAGE_KEY = 'exelixi_builder_product';

export function isExelixiCatalogEntryPath(pathname?: string): boolean {
  const path = (pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return path.endsWith('/exelixi') || path.includes('/ocr/exelixi');
}

export function isExelixiCatalogFlowHint(hints?: {
  url?: string | null;
  nombre?: string | null;
  moduloNombre?: string | null;
}): boolean {
  if (hints?.url) {
    try {
      const parsed = new URL(hints.url, window.location.origin);
      if (parsed.searchParams.get('product') === 'rcv' || parsed.searchParams.get('product') === 'funerario') {
        return false;
      }
      const flow = parsed.searchParams.get('flow');
      if (flow === 'exelixi-catalog' || flow === 'exelixi') return true;
      if (isExelixiCatalogEntryPath(parsed.pathname)) return true;
    } catch {
      /* ignore */
    }
  }
  const label = `${hints?.nombre ?? ''} ${hints?.moduloNombre ?? ''}`.toLowerCase();
  return (
    label.includes('exelixi')
    && (
      label.includes('catalogo')
      || label.includes('catálogo')
      || label.includes('generica')
      || label.includes('genérica')
    )
  );
}

/** Flujo Exélixi — solo URL (?flow=exelixi-catalog o /ocr/exelixi/), como ?product=rcv. */
export function isExelixiCatalogFlow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    // ?flow=exelixi-catalog manda — igual que ?product=rcv para La Mundial.
    const flow = params.get('flow');
    if (flow === 'exelixi-catalog' || flow === 'exelixi') return true;
    const product = params.get('product');
    if (product === 'rcv' || product === 'funerario') return false;
    if (isExelixiCatalogEntryPath()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function ensureExelixiFlowQueryParam(active: boolean): void {
  if (!active || isExelixiCatalogFlow()) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('product') === 'rcv' || url.searchParams.get('product') === 'funerario') {
      return;
    }
    url.searchParams.set('flow', 'exelixi-catalog');
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* ignore */
  }
}

export function readStoredBuilderProduct(): BuilderCatalogProduct | null {
  try {
    const raw = sessionStorage.getItem(BUILDER_PRODUCT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BuilderCatalogProduct;
  } catch {
    return null;
  }
}

export function branchHasVehicle(branch: BuilderProductBranch): boolean {
  return branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO';
}

export function isFunerarioLikeProduct(product: BuilderCatalogProduct): boolean {
  const name = product.commercialName.toLowerCase();
  return name.includes('funerar') || name.includes('funeral');
}

export interface ExelixiCatalogProductView {
  label: string;
  fullLabel: string;
  hasVehicle: boolean;
  useFuneralStep: boolean;
  skipPersonasStep: boolean;
  builderProductId: string;
}

export function getExelixiCatalogProductView(): ExelixiCatalogProductView | null {
  const builder = readStoredBuilderProduct();
  if (!builder) return null;

  const hasVehicle = branchHasVehicle(builder.branch);
  const funeralStep = !hasVehicle && isFunerarioLikeProduct(builder);

  return {
    label: builder.commercialName,
    fullLabel: builder.commercialName,
    hasVehicle,
    useFuneralStep: funeralStep,
    skipPersonasStep: !hasVehicle && !funeralStep,
    builderProductId: builder.id,
  };
}

export function activeBuilderPlans(product: BuilderCatalogProduct) {
  return (product.productPlans ?? []).filter((p) => p.isActive !== false);
}

function getModuleTokenKey(): string {
  return 'nexus_access_token_emision';
}

/** Siguiente paso: módulo pagos (flujo Exélixi sin bridge). */
export function getPagosContinueUrl(): string {
  const configured = import.meta.env.VITE_PAGOS_CONTINUE_BASE as string | undefined;
  const base = (configured?.replace(/\/$/, '') || '/pagos').replace(/\/$/, '');
  const params = new URLSearchParams({ flow: 'exelixi-catalog', wizardStep: '5' });

  try {
    const current = new URL(window.location.href);
    const sid = current.searchParams.get('sid');
    const nexusToken =
      current.searchParams.get('nexus_token')
      || sessionStorage.getItem(getModuleTokenKey());
    if (sid) params.set('sid', sid);
    if (nexusToken) params.set('nexus_token', nexusToken);
  } catch {
    /* ignore */
  }

  return `${base}/?${params.toString()}`;
}

/** Avanza al módulo pagos (bridge Nexus o redirect standalone). */
export function continueToPagosModule(snapshot?: Partial<ExelixiWizardHandoff>): void {
  if (snapshot) {
    mergeExelixiWizardHandoff(snapshot);
  }

  if (typeof window.__bridgeAdvance === 'function') {
    void window.__bridgeAdvance({ exelixiCatalogFlow: true });
    return;
  }

  window.location.href = getPagosContinueUrl();
}
