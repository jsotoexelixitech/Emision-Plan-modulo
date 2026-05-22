import { useWizardStore } from '../store/wizardStore';

const TOTAL_STEPS = 5;

const MOBILE_LABELS: Record<number, string> = {
  1: 'Documentos',
  2: 'Emisión',
  3: 'Vehículo',
  4: 'Plan',
  5: 'Pago',
  6: 'Listo',
};

export function TopProgressBar() {
  const step = useWizardStore((s) => s.step);
  const segments = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  const safeStep = Math.min(step, TOTAL_STEPS);
  const label = MOBILE_LABELS[step] ?? '';

  return (
    <div className="fixed top-0 left-0 right-0 lg:left-[300px] z-30 pointer-events-auto">
      <div className="bg-white/90 backdrop-blur-xl border-b border-slate-200/70 shadow-[0_4px_18px_-4px_rgba(15,23,42,0.06)]">
        {/* Mobile-only mini brand row */}
        <div className="lg:hidden flex items-center justify-between gap-3 px-4 sm:px-6 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-7 h-7 rounded-lg bg-white grid place-items-center shadow-[0_4px_12px_rgba(15,26,90,0.32)] ring-1 ring-slate-200 flex-shrink-0 overflow-hidden">
              <img
                src="/logo-isotipo-transparente.png"
                alt="La Mundial"
                className="w-5 h-5 object-contain"
                draggable={false}
              />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>
            <div className="min-w-0">
              <p className="font-wordmark text-indigo-700 text-[0.95rem] leading-none truncate">
                La Mundial
              </p>
              <p className="text-[0.55rem] text-fuchsia-500 font-bold leading-tight tracking-[0.18em] uppercase mt-0.5">
                de Seguros
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[0.6rem] text-slate-500 font-bold">
              <span className="font-mono text-slate-900">{safeStep}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="font-mono">{TOTAL_STEPS}</span>
            </span>
            {label && (
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 text-[0.58rem] font-bold uppercase tracking-wider ring-1 ring-indigo-200/50">
                {label}
              </span>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-2.5 pt-2.5 lg:py-3">
          <div className="flex gap-1.5 h-1">
            {segments.map((n) => {
              const isComplete = n < Math.min(step, TOTAL_STEPS + 1);
              const isActive = n === step && step <= TOTAL_STEPS;
              const isUpcoming = n > step;

              return (
                <div
                  key={n}
                  className="flex-1 h-full rounded-full bg-slate-200/70 overflow-hidden relative"
                >
                  {(isComplete || isActive) && (
                    <div
                      className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
                      style={{ animation: 'fillTrack 0.6s cubic-bezier(0.22, 1, 0.36, 1) both' }}
                    />
                  )}
                  {isActive && <div className="absolute inset-0 shimmer-line rounded-full" />}
                  {isUpcoming && step > TOTAL_STEPS && (
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
