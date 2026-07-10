import { useState } from 'react';
import { FuneralPlansStep } from '../features/plans/FuneralPlansStep';
import { FuneralHealthModal } from '../features/plans/FuneralHealthModal';
import { useWizardStore } from '../store/wizardStore';
import { getProductConfig } from '../lib/product';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import {
  fetchFuneralHealthQuestions,
  saveFuneralHealthAnswers,
  type HealthQuestion,
} from '../lib/api';
import { EmissionPlanShell } from './EmissionPlanShell';

const FREC_LABELS: Record<string, string> = {
  M: 'Pago mensual',
  T: 'Pago trimestral',
  C: 'Pago cuatrimestral',
  S: 'Pago semestral',
  A: 'Pago anual',
};

function getSessionId(): string {
  try {
    return new URLSearchParams(window.location.search).get('sid') || 'standalone';
  } catch {
    return 'standalone';
  }
}

function mapHealthToFuneral(answers: Record<string, unknown>) {
  return {
    diagnosticoEnfermedad: answers.diagnosticoEnfermedad === true,
    descripcionEnfermedad: String(answers.descripcionEnfermedad ?? ''),
    aceptaTerminos: answers.aceptaTerminos === true,
    healthAnswers: answers,
    healthQuestionnaireDone: true,
  };
}

/**
 * Paso 4 — Funerario únicamente.
 * Incluye cuestionario de salud (modal) antes de avanzar al pago.
 */
export default function FuneralPlansApp() {
  const {
    category, selectedPlan, quoteState, quote, funeral,
    tomador, setFuneral,
  } = useWizardStore();
  const product = getProductConfig();

  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthQuestions, setHealthQuestions] = useState<HealthQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);

  function handleContinuar() {
    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;
    openHealthModal();
  }

  async function openHealthModal() {
    if (!selectedPlan?.cplan) return;
    setHealthModalOpen(true);
    setLoadingQuestions(true);
    try {
      const qs = await fetchFuneralHealthQuestions(selectedPlan.cplan);
      setHealthQuestions(qs);
    } catch {
      toast.error(
        'Error al cargar preguntas',
        'No pudimos obtener el cuestionario de salud. Intenta de nuevo.',
      );
      setHealthModalOpen(false);
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function handleHealthConfirm(answers: Record<string, unknown>) {
    if (!selectedPlan?.cplan) return;
    setSavingHealth(true);
    try {
      await saveFuneralHealthAnswers({
        sessionId: getSessionId(),
        cplan: selectedPlan.cplan,
        cramo: product.cramo,
        tomadorRif: `${tomador.tipoDoc}-${tomador.identificacion}`,
        planName: selectedPlan.name,
        answers,
      });
      setFuneral(mapHealthToFuneral(answers));
      setHealthModalOpen(false);
      toast.success(
        'Cuestionario completado',
        'Tus respuestas fueron guardadas. Continuando al pago…',
      );
      window.__bridgeAdvance?.();
    } catch {
      toast.error(
        'No se pudo guardar',
        'Verifica tu conexión e intenta confirmar de nuevo.',
      );
    } finally {
      setSavingHealth(false);
    }
  }

  return (
    <>
      <EmissionPlanShell
        subtitle="Planes funerarios para proteger a tu grupo familiar."
        helpSubject="Suscripción Funerario - Soporte"
        onContinuar={handleContinuar}
      >
        <FuneralPlansStep />
      </EmissionPlanShell>

      {selectedPlan && (
        <FuneralHealthModal
          open={healthModalOpen}
          plan={selectedPlan}
          quote={quote}
          frecuenciaLabel={FREC_LABELS[funeral.frecuencia ?? 'A'] ?? 'Pago anual'}
          questions={healthQuestions}
          loadingQuestions={loadingQuestions}
          initialAnswers={funeral.healthAnswers}
          saving={savingHealth}
          onClose={() => !savingHealth && setHealthModalOpen(false)}
          onConfirm={handleHealthConfirm}
        />
      )}
    </>
  );
}
