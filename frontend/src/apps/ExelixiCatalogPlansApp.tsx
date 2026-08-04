import { useEffect } from 'react';
import { ExelixiCatalogPlansStep } from '../features/plans/ExelixiCatalogPlansStep';
import { useWizardStore } from '../store/wizardStore';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import { getExelixiCatalogProductView, continueToPagosModule } from '../lib/exelixi-catalog';
import { EmissionPlanShell } from './EmissionPlanShell';

/** Paso 4 — catálogo Exélixi (product-builder + product-emission). */
export default function ExelixiCatalogPlansApp() {
  const { category, selectedPlan, quoteState, quote, goTo } = useWizardStore();
  const catalog = getExelixiCatalogProductView();

  useEffect(() => {
    goTo(4);
  }, [goTo]);

  function handleContinuar() {
    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;

    toast.success(
      '¡Plan seleccionado!',
      `${catalog?.label ?? 'Producto'} · ${selectedPlan!.name} listo para pagar.`,
    );

    const snap = useWizardStore.getState();
    continueToPagosModule({
      category: snap.category,
      selectedPlan: snap.selectedPlan,
      quote: snap.quote,
      quoteVehicleSignature: snap.quoteVehicleSignature,
      quoteState: snap.quoteState,
      ocrDone: snap.ocrDone,
    });
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
