import { useState } from 'react';
import { FuneralPlansStep } from '../features/plans/FuneralPlansStep';
import { FuneralHealthModal } from '../features/plans/FuneralHealthModal';
import { FuneralSubmissionPending } from '../features/plans/FuneralSubmissionPending';
import { useWizardStore } from '../store/wizardStore';
import { getProductConfig } from '../lib/product';
import { toast } from '../store/toastStore';
import { validatePlanReady } from '../lib/planContinue';
import {
  fetchFuneralHealthQuestions,
  saveFuneralHealthAnswers,
  submitFuneralPolicyReview,
  validateFuneralEmission,
  PolicyEmitError,
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
 * Cuestionario de salud → confirmación al cliente (correo con link de pago) — no avanza a Pagos directo.
 */
export default function FuneralPlansApp() {
  const {
    category, selectedPlan, quoteState, quote, funeral,
    tomador, asegurado, sameInsured, hasBeneficiary, beneficiario,
    documents, metadataCanal, setFuneral,
  } = useWizardStore();
  const product = getProductConfig();

  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthQuestions, setHealthQuestions] = useState<HealthQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);
  const [validatingEmit, setValidatingEmit] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<{
    id: string;
    scoreTotal: number;
  } | null>(null);

  function toastPersonasBlocked(err: unknown) {
    const code = err instanceof PolicyEmitError ? err.code : '';
    const msg =
      err instanceof Error
        ? err.message
        : 'Ya existe una póliza funeraria activa para este asegurado.';
    if (code === 'PERSONAS_DUPLICATE' || /póliza vigente|mismo asegurado/i.test(msg)) {
      toast.warning(
        'Póliza vigente',
        'Este asegurado ya tiene una póliza activa. No se envía al técnico ni se continúa al pago.',
        8000,
      );
      return;
    }
    if (code === 'HEALTH_BLOCKED') {
      toast.warning(
        'Cuestionario de salud',
        msg || 'Según tus respuestas, la solicitud no puede continuar en línea.',
        9000,
      );
      return;
    }
    toast.error('No se puede continuar', msg);
  }

  async function handleContinuar() {
    if (!validatePlanReady(category, selectedPlan, quoteState, quote)) return;
    if (!selectedPlan?.cplan) return;
    setValidatingEmit(true);
    try {
      await validateFuneralEmission({
        state: {
          tomador,
          funeral,
          selectedPlan,
          sameInsured,
          asegurado,
          metadataCanal,
        },
        plan: selectedPlan.cplan,
      });
      await openHealthModal();
    } catch (err) {
      toastPersonasBlocked(err);
    } finally {
      setValidatingEmit(false);
    }
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
      const sessionId = getSessionId();

      await saveFuneralHealthAnswers({
        sessionId,
        cplan: selectedPlan.cplan,
        cramo: product.cramo,
        tomadorRif: `${tomador.tipoDoc}-${tomador.identificacion}`,
        planName: selectedPlan.name,
        answers,
      });

      const { submission, scoring } = await submitFuneralPolicyReview({
        sessionId,
        cplan: selectedPlan.cplan,
        cramo: product.cramo,
        tomador: { ...tomador },
        asegurado: { ...asegurado },
        sameInsured,
        hasBeneficiary: hasBeneficiary || (funeral.beneficiarios?.length ?? 0) > 0,
        beneficiario: hasBeneficiary
          ? { ...beneficiario }
          : funeral.beneficiarios?.[0]
            ? { ...funeral.beneficiarios[0] }
            : undefined,
        funeral: { ...funeral, ...mapHealthToFuneral(answers) },
        selectedPlan: { ...selectedPlan },
        quote: quote ? { ...quote } : null,
        quoteState,
        healthAnswers: answers,
        documents: { ...documents },
        metadataCanal: metadataCanal ?? undefined,
      });

      setFuneral(mapHealthToFuneral(answers));
      setHealthModalOpen(false);
      setPendingSubmission({
        id: submission.id,
        scoreTotal: scoring.total ?? submission.scoreTotal,
      });

      toast.success(
        'Solicitud enviada',
        'Un técnico revisará tu caso. Recibirás un correo cuando puedas pagar.',
      );
    } catch (err: unknown) {
      toastPersonasBlocked(err);
    } finally {
      setSavingHealth(false);
    }
  }

  return (
    <>
      <EmissionPlanShell
        subtitle="Planes funerarios para proteger a tu grupo familiar."
        helpSubject="Suscripción Funerario - Soporte"
        onContinuar={() => { void handleContinuar(); }}
        hideContinuar={Boolean(pendingSubmission)}
        continuarBusy={validatingEmit}
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

      {pendingSubmission && (
        <FuneralSubmissionPending
          tomadorEmail={tomador.email}
          planName={selectedPlan?.name}
        />
      )}
    </>
  );
}
