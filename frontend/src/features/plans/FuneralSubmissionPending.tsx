import { Clock, ShieldCheck, Mail } from 'lucide-react';

type Props = {
  scoreTotal: number;
  submissionId?: string;
  tomadorEmail?: string;
};

export function FuneralSubmissionPending({ scoreTotal, submissionId, tomadorEmail }: Props) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#091133]/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-indigo-100 overflow-hidden animate-spring-in">
        <div className="px-6 pt-8 pb-6 text-center bg-gradient-to-br from-indigo-50 via-white to-violet-50">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/25">
            <Clock size={32} className="text-white" />
          </div>
          <h2 className="font-display text-2xl font-black text-slate-900">
            Solicitud en revisión
          </h2>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
            Tu cuestionario de salud fue registrado. Un técnico autorizará tu póliza antes de continuar al pago.
          </p>
        </div>

        <div className="px-6 py-5 space-y-3 border-t border-slate-100">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Puntaje de riesgo
            </span>
            <span className="font-display text-xl font-black text-indigo-700 tabular-nums">
              {scoreTotal}
            </span>
          </div>
          {submissionId && (
            <p className="text-[11px] text-slate-400 text-center font-mono truncate">
              Ref. {submissionId}
            </p>
          )}
          {tomadorEmail && (
            <div className="flex items-start gap-2 text-xs text-slate-600 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
              <Mail size={14} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Cuando sea aprobada, recibirás un enlace de pago en{' '}
                <strong className="text-slate-800">{tomadorEmail}</strong>.
              </span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-slate-500">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>No cierres esta ventana hasta recibir la confirmación por correo.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
