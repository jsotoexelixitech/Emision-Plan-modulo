import {
  Check, FileText, UserCog, ShieldCheck, CreditCard, Car, Users,
} from 'lucide-react';
import { useWizardStore } from '../store/wizardStore';
import { getProductConfig } from '../lib/product';
import { publicAsset } from '../lib/app-base';

/**
 * Stepper horizontal superior (desktop). Reemplaza al sidebar lateral:
 * logo a la izquierda, pasos al centro con progreso, sello de seguridad a la derecha.
 */
export function TopStepper() {
  const step = useWizardStore((s) => s.step);
  const product = getProductConfig();

  const STEPS = [
    { n: 1, label: 'Documentos', Icon: FileText },
    { n: 2, label: product.hasVehicle ? 'Emisión' : 'Tomador', Icon: UserCog },
    product.hasVehicle
      ? { n: 3, label: 'Vehículo', Icon: Car }
      : { n: 3, label: 'Asegurado', Icon: Users },
    { n: 4, label: 'Plan', Icon: ShieldCheck },
    { n: 5, label: 'Pago', Icon: CreditCard },
  ];

  return (
    <header className="hidden lg:block fixed top-0 left-0 right-0 z-40">
      <div className="sidebar-gradient border-b border-white/[0.08] shadow-[0_14px_44px_-14px_rgba(9,17,51,0.55)]">
        <div className="max-w-[1400px] mx-auto pl-6 pr-8 h-[88px] flex items-center gap-8">

          {/* Brand */}
          <div className="flex items-center flex-shrink-0">
            <img
              src={publicAsset('logo-lamundial-sidebar.png')}
              alt="La Mundial de Seguros"
              className="h-14 w-auto object-contain"
              draggable={false}
            />
          </div>

          {/* Stepper */}
          <nav className="flex-1 min-w-0" aria-label="Progreso de suscripción">
            <ol className="flex items-center justify-center">
              {STEPS.map(({ n, label, Icon }, i) => {
                const isComplete = n < step;
                const isActive = n === step;
                const isLast = i === STEPS.length - 1;

                return (
                  <li key={n} className={`flex items-center min-w-0 ${isLast ? '' : 'flex-1 max-w-[210px]'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`
                          relative w-11 h-11 rounded-2xl grid place-items-center flex-shrink-0 transition-all duration-300
                          ${isActive
                            ? 'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_24px_rgba(99,102,241,0.45)] scale-105'
                            : isComplete
                            ? 'bg-emerald-500/90 shadow-[0_4px_14px_rgba(16,185,129,0.32)]'
                            : 'bg-white/[0.05] border border-white/[0.1]'
                          }
                        `}
                      >
                        {isComplete ? (
                          <Check size={17} className="text-white" strokeWidth={3} />
                        ) : (
                          <Icon
                            size={17}
                            className={isActive ? 'text-white' : 'text-slate-500'}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                        )}
                        {isActive && <span className="absolute inset-0 rounded-2xl animate-glow" />}
                      </div>

                      <div className="min-w-0 hidden xl:block">
                        <p className={`text-[0.58rem] font-black tracking-[0.18em] font-mono leading-none ${
                          isActive ? 'text-indigo-300' : isComplete ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          PASO 0{n}
                        </p>
                        <p className={`mt-1 font-display text-[0.88rem] font-bold leading-tight truncate ${
                          isActive ? 'text-white' : isComplete ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          {label}
                        </p>
                      </div>
                    </div>

                    {!isLast && (
                      <div className="flex-1 mx-3 xl:mx-4 h-[3px] rounded-full bg-white/[0.08] overflow-hidden min-w-[24px]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-500 to-fuchsia-500 transition-all duration-700 ease-out ${
                            isComplete ? 'w-full' : isActive ? 'w-1/2' : 'w-0'
                          }`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Sello de seguridad */}
          <div className="flex items-center gap-2 flex-shrink-0 py-1.5 px-3.5 rounded-full bg-emerald-500/8 border border-emerald-500/15">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[0.6rem] font-bold text-emerald-300 tracking-wider uppercase whitespace-nowrap">
              Conexión segura
            </span>
          </div>

        </div>
      </div>
    </header>
  );
}
