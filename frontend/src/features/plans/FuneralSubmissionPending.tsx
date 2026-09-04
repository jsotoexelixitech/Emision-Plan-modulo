import { CheckCircle2, ShieldCheck, Mail } from 'lucide-react';

type Props = {
  tomadorEmail?: string;
  planName?: string;
};

export function FuneralSubmissionPending({ tomadorEmail, planName }: Props) {
  const planLabel = planName?.trim() || 'tu plan funerario';

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#091133]/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-indigo-100 animate-spring-in pb-[env(safe-area-inset-bottom)]">
        <div className="px-5 sm:px-6 pt-7 sm:pt-8 pb-6 text-center bg-gradient-to-br from-indigo-50 via-white to-violet-50">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center shadow-lg shadow-emerald-500/25">
            <CheckCircle2 size={28} className="text-white" strokeWidth={2.5} />
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900">
            ¡Solicitud registrada!
          </h2>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
            Tu cuestionario de salud se guardó correctamente para{' '}
            <strong className="text-slate-800">{planLabel}</strong>.
            Te enviaremos por correo el enlace para completar el pago y activar tu póliza.
          </p>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-3 border-t border-slate-100">
          {tomadorEmail ? (
            <div className="flex items-start gap-2.5 text-sm text-slate-600 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
              <Mail size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed min-w-0">
                Revisa tu correo en{' '}
                <strong className="text-slate-800 break-all">{tomadorEmail}</strong>.
                {' '}Ahí encontrarás las instrucciones para finalizar tu contratación.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 text-sm text-slate-600 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
              <Mail size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Recibirás un correo con el enlace para completar el pago de tu póliza.
              </span>
            </div>
          )}
          <div className="flex items-start justify-center gap-2 pt-1 text-[11px] text-slate-500 text-center max-w-sm mx-auto">
            <ShieldCheck size={13} className="text-emerald-500 shrink-0 mt-0.5" />
            <span>
              Si no ves el mensaje en unos minutos, revisa la carpeta de spam o contáctanos
              con tu documento de identidad.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
