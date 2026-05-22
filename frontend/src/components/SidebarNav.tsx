import {
  Check, FileText, UserCog, ShieldCheck, CreditCard,
  User, Layers, Wallet, Lock, Shield, Car, Loader2,
} from 'lucide-react';
import { useWizardStore } from '../store/wizardStore';

const STEPS = [
  { n: 1, label: 'Documentos', sub: 'OCR y validación',   Icon: FileText },
  { n: 2, label: 'Emisión',    sub: 'Datos del cliente',   Icon: UserCog },
  { n: 3, label: 'Vehículo',   sub: 'Datos del auto',      Icon: Car },
  { n: 4, label: 'Plan',       sub: 'Cobertura ideal',     Icon: ShieldCheck },
  { n: 5, label: 'Pago',       sub: 'Checkout final',      Icon: CreditCard },
];

export function SidebarNav() {
  const { step, tomador, vehicle, selectedPlan, paymentMethod, quote, quoteState } = useWizardStore();

  const name = [tomador.nombre, tomador.apellido].filter(Boolean).join(' ');
  const carDescriptor = [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ');

  // Precio real de La Mundial cuando esté disponible, fallback al catálogo
  const hasRealQuote = quoteState === 'ready' && !!quote;
  const isQuoteLoading = quoteState === 'loading';

  const precioDisplay = (() => {
    if (isQuoteLoading) return null;
    if (hasRealQuote && quote) {
      const monthly = quote.mprimaext / 12;
      return `$${monthly.toFixed(2)} / mes`;
    }
    return selectedPlan?.price ?? null;
  })();

  const precioAnualDisplay = hasRealQuote && quote
    ? `$${quote.mprimaext.toFixed(2)} / año`
    : null;

  const bsDisplay = hasRealQuote && quote
    ? `Bs ${(quote.mprima / 12).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes`
    : null;
  const methodLabels: Record<string, string> = {
    card: 'Tarjeta',
    transfer: 'Transferencia',
    mobile: 'Pago móvil',
    otp: 'Débito SyPago',
  };

  // Progreso relativo al rango de este módulo (paso 4)
  const progressPct = Math.min(((step - 4) / (STEPS.length - 1)) * 100, 100);

  return (
    <aside className="sidebar-gradient text-slate-200 hidden lg:flex flex-col lg:w-[300px] lg:min-h-screen lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:overflow-y-auto p-6 lg:p-7 z-40 border-r border-white/[0.06]">
      {/* Brand */}
      <div className="flex items-center justify-center mb-8 px-2">
        <img
          src="/logo-lamundial-sidebar.png"
          alt="La Mundial de Seguros"
          className="w-full max-w-[210px] object-contain"
          draggable={false}
        />
      </div>

      {/* Pill informativa — sesión segura por HTTPS. No hay heartbeat real, así
          que evitamos el lenguaje "Sesión activa" + ping que sugieren conexión
          monitorizada en tiempo real. */}
      <div className="flex items-center gap-2 mb-8 py-1.5 px-3 rounded-full bg-emerald-500/8 border border-emerald-500/15 self-start">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[0.62rem] font-bold text-emerald-300 tracking-wider uppercase">Conexión segura</span>
      </div>

      {/* Steps with vertical progress line */}
      <nav className="relative">
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-white/8 rounded-full" />
        <div
          className="absolute left-[19px] top-5 w-0.5 rounded-full bg-gradient-to-b from-indigo-400 via-violet-500 to-fuchsia-500 transition-all duration-700 ease-out"
          style={{ height: `calc(${progressPct}% * 0.9)` }}
        />

        <ul className="space-y-5 relative">
          {STEPS.map(({ n, label, sub, Icon }) => {
            const isComplete = n >= 4 && n < step;
            const isActive = n === step;

            return (
              <li key={n} className="flex items-start gap-4">
                <div
                  className={`
                    relative w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 z-10 transition-all duration-300
                    ${isActive
                      ? 'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_24px_rgba(15, 26, 90,0.5)] scale-110'
                      : isComplete
                      ? 'bg-emerald-500/90 shadow-[0_4px_14px_rgba(16,185,129,0.32)]'
                      : 'bg-white/[0.05] border border-white/[0.08]'
                    }
                  `}
                >
                  {isComplete ? (
                    <Check size={16} className="text-white" strokeWidth={3} />
                  ) : (
                    <Icon
                      size={16}
                      className={isActive ? 'text-white' : 'text-slate-500'}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  )}
                  {isActive && <span className="absolute inset-0 rounded-xl animate-glow" />}
                </div>

                <div className="flex-1 pt-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[0.65rem] font-black tracking-widest font-mono ${
                      isActive ? 'text-indigo-400' : isComplete ? 'text-emerald-400' : 'text-slate-500'
                    }`}>
                      0{n}
                    </span>
                    {isActive && (
                      <span className="text-[0.58rem] font-bold text-indigo-200 bg-gradient-to-r from-indigo-500/25 to-violet-500/25 px-2 py-0.5 rounded-full ring-1 ring-indigo-400/30 tracking-wider">
                        EN CURSO
                      </span>
                    )}
                    {isComplete && (
                      <span className="text-[0.58rem] font-bold text-emerald-200 bg-emerald-500/15 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/30 tracking-wider">
                        LISTO
                      </span>
                    )}
                  </div>
                  <p className={`mt-0.5 font-display text-[0.95rem] font-bold leading-tight ${
                    isActive ? 'text-white' : isComplete ? 'text-slate-300' : 'text-slate-400'
                  }`}>
                    {label}
                  </p>
                  <p className="text-[0.72rem] text-slate-500 mt-0.5 leading-snug">{sub}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1 min-h-8" />

      {/* Summary card */}
      {step <= 5 && (
        <div className="mt-8 glass-card rounded-2xl p-4 animate-fade-in relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-400 to-fuchsia-500" />
              <h3 className="text-[0.7rem] font-black tracking-widest text-slate-300 uppercase">
                Resumen en vivo
              </h3>
            </div>

            <div className="space-y-2.5">
              <SummaryRow icon={<User size={11} />} label="Cliente" value={name || '—'} />
              <SummaryRow
                icon={<Layers size={11} />}
                label="Vehículo"
                value={vehicle.placa ? `${vehicle.placa}${carDescriptor ? ` · ${carDescriptor}` : ''}` : carDescriptor || '—'}
              />
              <SummaryRow icon={<Shield size={11} />} label="Plan" value={selectedPlan?.name ?? '—'} />

              {/* Prima mensual — real de La Mundial o spinner */}
              <div className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-2 text-slate-400">
                  <CreditCard size={11} />
                  <span className="text-[0.72rem]">Prima / mes</span>
                </div>
                {isQuoteLoading ? (
                  <span className="flex items-center gap-1 text-indigo-300">
                    <Loader2 size={11} className="animate-spin" />
                    <span className="text-[0.72rem] font-bold">Cotizando…</span>
                  </span>
                ) : precioDisplay ? (
                  <span className="text-[0.78rem] font-bold text-indigo-300">{precioDisplay}</span>
                ) : (
                  <span className="text-[0.78rem] font-bold text-slate-500">—</span>
                )}
              </div>

              {/* Prima anual — solo cuando hay quote real */}
              {precioAnualDisplay && (
                <div className="flex items-center justify-between gap-3 py-0.5 opacity-70">
                  <span className="text-[0.68rem] text-slate-500 pl-5">Total anual</span>
                  <span className="text-[0.72rem] font-semibold text-slate-400 tabular-nums">{precioAnualDisplay}</span>
                </div>
              )}

              {/* Equivalente en Bs — solo cuando hay quote real */}
              {bsDisplay && (
                <div className="flex items-center justify-between gap-3 py-0.5 opacity-70">
                  <span className="text-[0.68rem] text-slate-500 pl-5">En Bs</span>
                  <span className="text-[0.72rem] font-semibold text-slate-400 tabular-nums">{bsDisplay}</span>
                </div>
              )}

              <SummaryRow
                icon={<Wallet size={11} />}
                label="Pago"
                value={methodLabels[paymentMethod] ?? '—'}
              />
            </div>

            {/* Coverage list — only when a plan is selected */}
            {selectedPlan && selectedPlan.benefits?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-[0.6rem] font-black tracking-widest text-indigo-300/90 uppercase mb-2 inline-flex items-center gap-1.5">
                  <ShieldCheck size={10} />
                  Cobertura
                </p>
                <ul className="space-y-1.5">
                  {selectedPlan.benefits.slice(0, 5).map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[0.7rem] text-slate-300 leading-snug">
                      <span className="mt-1 w-3 h-3 rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40 grid place-items-center flex-shrink-0">
                        <Check size={7} className="text-emerald-300" strokeWidth={3.5} />
                      </span>
                      <span className="truncate">{b}</span>
                    </li>
                  ))}
                  {selectedPlan.benefits.length > 5 && (
                    <li className="text-[0.62rem] text-slate-500 pl-5 font-mono">
                      + {selectedPlan.benefits.length - 5} coberturas más
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-5 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 text-[0.7rem] text-slate-500 leading-relaxed">
          <Lock size={11} className="text-emerald-400/80" />
          <span>Cifrado E2E · TLS 1.3</span>
        </div>
        <p className="text-[0.65rem] text-slate-600 mt-1.5">
          Aurora Pro · Build 2026.04
        </p>
      </div>
    </aside>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[0.72rem]">{label}</span>
      </div>
      <span className={`text-[0.78rem] font-bold truncate max-w-[150px] text-right ${
        highlight ? 'text-indigo-300' : 'text-slate-200'
      }`}>
        {value}
      </span>
    </div>
  );
}
