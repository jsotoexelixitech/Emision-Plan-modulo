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

/**
 * Resolves UI visibility flags from product config for the current SSO cproductor.
 * Falls back to showing everything when no SSO or no config for this productor.
 * Config shape: { ui: { perProductor: { "123": { hideHeader: true, ... } } } }
 */
export function useUiFlags(config: Record<string, any> | null): UiFlags {
  const cproductor = useWizardStore(
    (s) => (s.metadataCanal as Record<string, unknown> | null)?.cproductor,
  );

  if (!config || !cproductor) return DEFAULT_FLAGS;

  const perProductor = config?.ui?.perProductor as Record<string, Partial<UiFlags>> | undefined;
  if (!perProductor) return DEFAULT_FLAGS;

  const flags = perProductor[String(cproductor)];
  if (!flags) return DEFAULT_FLAGS;

  return { ...DEFAULT_FLAGS, ...flags };
}
