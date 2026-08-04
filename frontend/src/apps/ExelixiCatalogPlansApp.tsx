import { ExelixiCatalogPlansStep } from '../features/plans/ExelixiCatalogPlansStep';
import { useWizardStore } from '../store/wizardStore';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import { getExelixiCatalogProductView } from '../lib/exelixi-catalog';
import { EmissionPlanShell } from './EmissionPlanShell';

/** Paso 4 — catálogo Exélixi (product-builder + product-emission). */
export default function ExelixiCatalogPlansApp() {
  const { category, selectedPlan, quoteState, quote } = useWizardStore();
  const catalog = getExelixiCatalogProductView();

  function handleContinuar() {
    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;

    toast.success(
      '¡Plan seleccionado!',
      `${catalog?.label ?? 'Producto'} · ${selectedPlan!.name} listo para pagar.`,
    );
    window.__bridgeAdvance?.({ exelixiCatalogFlow: true });
  }

  return (
    <EmissionPlanShell
      subtitle="Planes comerciales configurados en product-builder para emisión genérica Exélixi."
      helpSubject="Emisión Exélixi - Soporte"
      onContinuar={handleContinuar}
    >
      <ExelixiCatalogPlansStep />
    </EmissionPlanShell>
  );
}
