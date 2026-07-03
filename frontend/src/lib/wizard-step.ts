/** Paso del wizard (1–5) → orden del módulo en el bridge (1=OCR … 4=Pagos). */
export function stepToModuleOrder(step: number): number {
  if (step <= 1) return 1;
  if (step <= 3) return 2;
  if (step === 4) return 3;
  return 4;
}

/** Lee ?wizardStep=N de la URL y sincroniza el store. */
export function applyWizardStepFromUrl(goTo: (step: number) => void): number | null {
  try {
    const n = Number(new URLSearchParams(window.location.search).get('wizardStep'));
    if (n >= 1 && n <= 5) {
      goTo(n);
      return n;
    }
  } catch { /* ignore */ }
  return null;
}

/** Paso por defecto al entrar a cada módulo (si no hay wizardStep). */
export function defaultStepForModule(moduleOrder: number): number {
  switch (moduleOrder) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 4;
    case 4: return 5;
    default: return 1;
  }
}
