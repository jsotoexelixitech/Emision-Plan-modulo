import { useRef } from 'react';
import {
  Check, ChevronLeft, ChevronRight, FileText, UserCog, ShieldCheck, CreditCard, Car, Users,
} from 'lucide-react';
import { useWizardStore } from '../store/wizardStore';
import { getProductConfig } from '../lib/product';

/**
 * Stepper horizontal en barra blanca (estilo píldora).
 * Sustituye la barra azul fija: pasos completados en verde, activo resaltado, futuros en gris.
 */
export function TopStepper() {
  const step = useWizardStore((s) => s.step);
  const product = getProductConfig();
  const scrollRef = useRef<HTMLElement>(null);

  const STEPS = [
    { n: 1, label: 'Documentos', Icon: FileText },
    { n: 2, label: product.hasVehicle ? 'Emisión' : 'Tomador', Icon: UserCog },
    product.hasVehicle
      ? { n: 3, label: 'Vehículo', Icon: Car }
      : { n: 3, label: 'Asegurado', Icon: Users },
    { n: 4, label: 'Plan', Icon: ShieldCheck },
    { n: 5, label: 'Pago', Icon: CreditCard },
  ];

  /** Desplaza horizontalmente la píldora de pasos. */
  function scrollSteps(direction: 'left' | 'right') {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -220 : 220;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <div className="hidden lg:block w-full mb-8 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => scrollSteps('left')}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors"
          aria-label="Ver pasos anteriores"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <nav
          ref={scrollRef}
          className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white rounded-full shadow-[0_8px_32px_rgba(15,23,42,0.09)] border border-slate-200/70 px-5 py-3.5"
          aria-label="Progreso de suscripción"
        >
          <ol className="flex items-center gap-5 xl:gap-8 min-w-max">
            {STEPS.map(({ n, label, Icon }) => {
              const isComplete = n < step;
              const isActive = n === step;

              return (
                <li key={n} className="flex items-center gap-2.5 flex-shrink-0">
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
                </li>
              );
            })}
          </ol>
        </nav>

        <button
          type="button"
          onClick={() => scrollSteps('right')}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors"
          aria-label="Ver pasos siguientes"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
