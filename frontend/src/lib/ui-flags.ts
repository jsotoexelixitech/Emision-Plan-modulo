import { useWizardStore } from '../store/wizardStore';

export interface UiFlags {
  hideHeader: boolean;
  hideStepper: boolean;
  hideTrustBanner: boolean;
  hideFooterBar: boolean;
}

const DEFAULT_FLAGS: UiFlags = {
  hideHeader: false,
  hideStepper: false,
  hideTrustBanner: false,
  hideFooterBar: false,
};

const NEXUS_TOKEN_KEYS = [
  'nexus_access_token_ocr',
  'nexus_access_token_formulario',
  'nexus_access_token_emision',
  'nexus_access_token_pagos',
];

/**
 * Detecta invocación SSO / iframe (sso-delegate, nexus_token, session_token legacy o La Mundial).
 */
export function isSsoInvocation(metadataCanal?: Record<string, unknown> | null): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('nexus_token')?.trim()) return true;
    if (qs.get('session_token')?.trim()) return true;
  } catch {
    /* ignore */
  }

  try {
    if (NEXUS_TOKEN_KEYS.some((key) => sessionStorage.getItem(key))) return true;
  } catch {
    /* ignore */
  }

  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  if (metadataCanal && typeof metadataCanal === 'object') {
    if (
      metadataCanal.cproductor != null ||
      metadataCanal.cusuario != null ||
      metadataCanal.cgestor_in != null
    ) {
      return true;
    }
  }

  return false;
}

function flagsForProductor(
  config: Record<string, any> | null,
  cproductor: unknown,
): Partial<UiFlags> {
  if (!config || cproductor == null || cproductor === '') return {};
  const perProductor = config?.ui?.perProductor as Record<string, Partial<UiFlags>> | undefined;
  return perProductor?.[String(cproductor)] ?? {};
}

/**
 * Flags visuales: config por cproductor (parametrizador Visual SSO) +
 * oculta el stepper automáticamente si el flujo entra por SSO.
 */
export function useUiFlags(config: Record<string, any> | null): UiFlags {
  const metadataCanal = useWizardStore((s) => s.metadataCanal) as Record<string, unknown> | null;
  const fromConfig = flagsForProductor(config, metadataCanal?.cproductor);
  const sso = isSsoInvocation(metadataCanal);

  return {
    ...DEFAULT_FLAGS,
    ...fromConfig,
    ...(sso ? { hideStepper: true } : {}),
  };
}
