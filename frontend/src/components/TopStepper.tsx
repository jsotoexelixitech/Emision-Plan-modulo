import { useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, FileText, UserCog, ShieldCheck, CreditCard, Car, Users,
} from 'lucide-react';
import {
  canNavigateToStep,
  getDefaultRequiredDocs,
  getNavigationBlockReason,
  getPreviousAllowedStep,
} from '../lib/wizard-navigation';
import { useWizardStore } from '../store/wizardStore';
import { getProductConfig } from '../lib/product';
import { toast } from '../store/toastStore';

/**
 * Stepper horizontal en barra blanca (estilo píldora).
 * Flechas ◀ ▶ navegan entre pasos del flujo guardando estado vía bridge.
 */
export function TopStepper() {
  const step = useWizardStore((s) => s.step);
  const ocrDone = useWizardStore((s) => s.ocrDone);
  const documents = useWizardStore((s) => s.documents);
  const selectedPlan = useWizardStore((s) => s.selectedPlan);
  const product = getProductConfig();
  const [navigating, setNavigating] = useState(false);

  const navSnapshot = {
    step,
    ocrDone,
    documents,
    selectedPlan,
    requiredDocTypes: getDefaultRequiredDocs(product.id),
  };

  const STEPS = [
    { n: 1, label: 'Documentos', Icon: FileText },
    { n: 2, label: product.hasVehicle ? 'Emisión' : 'Tomador', Icon: UserCog },
    product.hasVehicle
      ? { n: 3, label: 'Vehículo', Icon: Car }
      : { n: 3, label: 'Asegurado', Icon: Users },
    { n: 4, label: 'Plan', Icon: ShieldCheck },
    { n: 5, label: 'Pago', Icon: CreditCard },
  ];

  function canGoTo(target: number): boolean {
    return canNavigateToStep(step, target, navSnapshot);
  }

  async function goToStep(target: number) {
    if (navigating || target === step || target < 1 || target > 5) return;

    if (!canGoTo(target)) {
      const reason = getNavigationBlockReason(step, target, navSnapshot);
      toast.warning('Navegación bloqueada', reason ?? 'No puedes ir a ese paso todavía.');
      return;
    }

    setNavigating(true);
    try {
      await window.__bridge?.ready;
      const fn = window.__bridgeNavigateStep ?? window.__bridge?.navigateToStep;
      if (fn) {
        await fn(target);
      } else {
        useWizardStore.getState().goTo(target);
      }
    } finally {
      setNavigating(false);
    }
  }

  const prevStep = getPreviousAllowedStep(step);
  const canPrev = prevStep != null && !navigating && canGoTo(prevStep);
  const canNext = step < 5 && !navigating && canGoTo(step + 1);

  return (
    <div className="hidden lg:block w-full mb-8 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => prevStep != null && goToStep(prevStep)}
          disabled={!canPrev}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          aria-label="Paso anterior"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <nav
          className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white rounded-full shadow-[0_8px_32px_rgba(15,23,42,0.09)] border border-slate-200/70 px-5 py-3.5"
          aria-label="Progreso de suscripción"
        >
          <ol className="flex items-center gap-5 xl:gap-8 min-w-max">
            {STEPS.map(({ n, label, Icon }) => {
              const isComplete = n < step;
              const isActive = n === step;
              const isClickable = n !== step && !navigating && canGoTo(n);

              return (
                <li key={n} className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && goToStep(n)}
                    className={`flex items-center gap-2.5 text-left rounded-lg transition-opacity ${
                      isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`
                        w-10 h-10 rounded-full grid place-items-center flex-shrink-0 transition-colors duration-200
                        ${isComplete
                          ? 'bg-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.35)]'
                          : isActive
                          ? 'bg-sky-50 ring-2 ring-sky-200/80'
                          : 'bg-slate-100'
                        }
                      `}
                    >
                      {isComplete ? (
                        <Check size={18} className="text-white" strokeWidth={3} />
                      ) : (
                        <Icon
                          size={18}
                          className={isActive ? 'text-slate-600' : 'text-slate-400'}
                          strokeWidth={2}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-[0.62rem] font-bold tracking-[0.12em] uppercase leading-none ${
                          isComplete ? 'text-emerald-500' : isActive ? 'text-sky-600' : 'text-slate-400'
                        }`}
                      >
                        PASO 0{n}
                      </p>
                      <p
                        className={`mt-1 text-[0.88rem] font-bold leading-tight truncate max-w-[9.5rem] ${
                          isComplete || isActive ? 'text-[#0f1a5a]' : 'text-slate-400'
                        }`}
                      >
                        {label}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <button
          type="button"
          onClick={() => goToStep(step + 1)}
          disabled={!canNext}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          aria-label="Paso siguiente"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
