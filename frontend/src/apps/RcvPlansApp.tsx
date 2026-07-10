import { PlansStep } from '../features/plans/PlansStep';
import { useWizardStore } from '../store/wizardStore';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import { EmissionPlanShell } from './EmissionPlanShell';

/**
 * Paso 4 — RCV únicamente.
 * Sin imports de funerario, cuestionario de salud ni API /funeral.
 */
export default function RcvPlansApp() {
  const { category, selectedPlan, quoteState, quote } = useWizardStore();

  function handleContinuar() {
    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;

    toast.success(
      '¡Plan seleccionado!',
      `Categoría ${category} · Plan ${selectedPlan!.name} listo para emitir.`,
    );
    window.__bridgeAdvance?.();
  }

  return (
    <EmissionPlanShell
      subtitle="Categorías diseñadas para cada perfil de uso del vehículo."
      helpSubject="Suscripción RCV - Soporte"
      onContinuar={handleContinuar}
    >
      <PlansStep />
    </EmissionPlanShell>
  );
}
