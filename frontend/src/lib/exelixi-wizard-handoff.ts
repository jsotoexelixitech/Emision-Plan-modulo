/** Persistencia del wizard entre módulos Exélixi sin bridge (?sid=). */

export const EXELIXI_WIZARD_HANDOFF_KEY = 'exelixi_wizard_handoff';

export interface ExelixiWizardHandoff {
  tomador?: Record<string, unknown>;
  sameInsured?: boolean;
  asegurado?: Record<string, unknown>;
  hasBeneficiary?: boolean;
  beneficiario?: Record<string, unknown>;
  vehicle?: Record<string, unknown>;
  funeral?: Record<string, unknown>;
  category?: string;
  selectedPlan?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
  quoteVehicleSignature?: string;
  quoteState?: string;
  ocrDone?: boolean;
  savedAt: number;
}

export function readExelixiWizardHandoff(): ExelixiWizardHandoff | null {
  try {
    const raw = sessionStorage.getItem(EXELIXI_WIZARD_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ExelixiWizardHandoff;
  } catch {
    return null;
  }
}

export function mergeExelixiWizardHandoff(patch: Partial<ExelixiWizardHandoff>): void {
  try {
    const prev = readExelixiWizardHandoff() ?? { savedAt: 0 };
    sessionStorage.setItem(
      EXELIXI_WIZARD_HANDOFF_KEY,
      JSON.stringify({ ...prev, ...patch, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}
