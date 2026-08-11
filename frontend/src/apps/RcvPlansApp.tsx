import { useEffect } from 'react';
import { PlansStep } from '../features/plans/PlansStep';
import { useWizardStore } from '../store/wizardStore';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import { isCotizadorFlow } from '../lib/cotizador-flow';
import { EmissionPlanShell } from './EmissionPlanShell';

/**
 * Paso 4 — RCV únicamente.
 * Sin imports de funerario, cuestionario de salud ni API /funeral.
 */
export default function RcvPlansApp() {
  const { category, selectedPlan, quoteState, quote, goTo } = useWizardStore();
  const cotizador = isCotizadorFlow();

  useEffect(() => {
    if (cotizador) goTo(4);
  }, [cotizador, goTo]);

  function handleContinuar() {
    if (cotizador) {
      if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;
      const usd = quote?.mprimaext ?? quote?.mprima;
      toast.success(
        'Cotización lista',
        `${selectedPlan!.name}: ${usd != null ? `$${Number(usd).toFixed(2)} USD` : 'prima calculada'}.`,
      );
      return;
    }

    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;

    toast.success(
      '¡Plan seleccionado!',
      `Categoría ${category} · Plan ${selectedPlan!.name} listo para emitir.`,
    );
    window.__bridgeAdvance?.();
  }

  return (
    <EmissionPlanShell
      eyebrow={cotizador ? 'Paso 02 · Cotización' : undefined}
      title={cotizador ? 'Planes RCV disponibles' : undefined}
      subtitle={
        cotizador
          ? 'Selecciona un plan para ver la prima cotizada en USD y Bs.'
          : 'Categorías diseñadas para cada perfil de uso del vehículo.'
      }
      helpSubject="Suscripción RCV - Soporte"
      onContinuar={handleContinuar}
      continuarLabel={cotizador ? 'Ver cotización' : undefined}
    >
      <PlansStep />
    </EmissionPlanShell>
  );
}
