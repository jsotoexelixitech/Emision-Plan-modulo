import { useEffect, useState } from 'react';
import { useWizardStore } from './store/wizardStore';
import { TopStepper } from './components/TopStepper';
import { TopProgressBar } from './components/TopProgressBar';
import { AuroraBackground } from './components/AuroraBackground';
import { Toaster } from './components/Toaster';
import { WelcomeSplash } from './components/WelcomeSplash';
import { Button } from './components/ui/Button';
import { PlansStep } from './features/plans/PlansStep';
import { FuneralPlansStep } from './features/plans/FuneralPlansStep';
import { FuneralHealthModal } from './features/plans/FuneralHealthModal';
import { getProductConfig } from './lib/product';
import { toast } from './store/toastStore';
import {
  fetchFuneralHealthQuestions,
  saveFuneralHealthAnswers,
  type HealthQuestion,
} from './lib/api';
import { ChevronRight, Sparkles, ShieldCheck, HelpCircle } from 'lucide-react';

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

/** Mapea respuestas del cuestionario a campos legacy del wizard (emisión La Mundial). */
function mapHealthToFuneral(answers: Record<string, unknown>) {
  return {
    diagnosticoEnfermedad: answers.diagnosticoEnfermedad === true,
    descripcionEnfermedad: String(answers.descripcionEnfermedad ?? ''),
    aceptaTerminos: answers.aceptaTerminos === true,
    healthAnswers: answers,
    healthQuestionnaireDone: true,
  };
}

export default function App() {
  const {
    category, selectedPlan, quoteState, quote, funeral,
    tomador, setFuneral, setMetadataCanal,
  } = useWizardStore();
  const product = getProductConfig();
  const isFunerario = !product.hasVehicle;

  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthQuestions, setHealthQuestions] = useState<HealthQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);

  // Interceptar SSO Delegation
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('session_token');
    
    if (token) {
      try {
        // Extraer payload del JWT (formato base64url)
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadStr);
          
          if (payload.metadata) {
            setMetadataCanal(payload.metadata);
          }
        }
      } catch (err) {
        console.error('Error decodificando session_token:', err);
      } finally {
        // Limpiar URL por seguridad
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [setMetadataCanal]);

  function handleContinuar() {
    if (!category || !selectedPlan) {
      toast.warning(
        'Selecciona un plan',
        'Elige una categoría y un plan para continuar.',
      );
      return;
    }
    if (quoteState === 'loading') {
      toast.warning(
        'Cotización en proceso',
        'Por favor espera mientras calculamos la prima...',
        3000,
      );
      return;
    }
    if (!quote && quoteState !== 'ready') {
      toast.warning(
        'Cotización pendiente',
        'Selecciona el plan y espera la cotización antes de continuar.',
        3000,
      );
      return;
    }

    // Funerario: abrir modal de salud antes de avanzar al pago
    if (isFunerario) {
      openHealthModal();
      return;
    }

    toast.success(
      '¡Plan seleccionado!',
      `Categoría ${category} · Plan ${selectedPlan.name} listo para emitir.`,
    );
    window.__bridgeAdvance?.();
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
    <div className="min-h-screen relative">
      <WelcomeSplash />
      <Toaster />
      <AuroraBackground />
      <div className="lg:hidden">
        <TopProgressBar />
      </div>

      <div>
        <main className="flex-1 min-h-screen pt-[72px] lg:pt-10 px-4 sm:px-6 lg:px-10 pb-32 lg:pb-12">
          <div className="max-w-5xl mx-auto">
            <TopStepper />

            <header className="mb-8 animate-fade-in">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                    <Sparkles size={11} className="text-indigo-500" />
                    Paso 04 · Cobertura
                  </p>
                  <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                    Elige tu plan ideal
                  </h1>
                  <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                    {product.hasVehicle
                      ? 'Categorías diseñadas para cada perfil de uso del vehículo.'
                      : 'Planes funerarios para proteger a tu grupo familiar.'}
                  </p>
                </div>
                <a
                  href="mailto:soporte@lamundialdeseguros.com?subject=Suscripci%C3%B3n%20RCV%20-%20Soporte"
                  className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass-light text-slate-600 hover:text-indigo-600 text-xs font-bold transition-all hover:-translate-y-0.5"
                >
                  <HelpCircle size={13} />
                  ¿Necesitas ayuda?
                </a>
              </div>
            </header>

            <section className="surface-card overflow-hidden step-enter">
              <div className="p-6 sm:p-8 lg:p-10">
                {product.hasVehicle ? <PlansStep /> : <FuneralPlansStep />}
              </div>

              <div className="hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  <span className="font-medium">Cifrado de extremo a extremo · TLS 1.3</span>
                </div>
                <Button variant="primary" onClick={handleContinuar} className="min-w-[180px]">
                  Confirmar plan
                  <ChevronRight size={15} />
                </Button>
              </div>
            </section>

          </div>
        </main>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <Button variant="primary" className="w-full" onClick={handleContinuar}>
          Confirmar plan
        </Button>
      </div>

      {isFunerario && selectedPlan && (
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
    </div>
  );
}
