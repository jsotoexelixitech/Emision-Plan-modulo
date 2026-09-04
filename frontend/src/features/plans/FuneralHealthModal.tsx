import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ShieldCheck, ClipboardList, Loader2, AlertCircle, Check,
} from 'lucide-react';
import type { Plan, PolicyQuote } from '../../types';
import type { HealthQuestion } from '../../lib/api';
import { Textarea, Select } from '../../components/ui/FormField';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { Button } from '../../components/ui/Button';

interface Props {
  open: boolean;
  plan: Plan;
  quote: PolicyQuote | null;
  frecuenciaLabel: string;
  questions: HealthQuestion[];
  loadingQuestions: boolean;
  initialAnswers?: Record<string, unknown>;
  saving: boolean;
  onClose: () => void;
  onConfirm: (answers: Record<string, unknown>) => void;
}

function isVisible(q: HealthQuestion, answers: Record<string, unknown>): boolean {
  if (!q.showIf?.field) return true;
  const actual = answers[q.showIf.field];
  const expected = q.showIf.equals;
  // Boolean (incl. "true"/"false" desde JSON/config)
  if (expected === true || expected === false || expected === 'true' || expected === 'false') {
    const want = expected === true || expected === 'true';
    return actual === want;
  }
  return String(actual ?? '') === String(expected);
}

function validateAnswers(
  questions: HealthQuestion[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    if (!q.required) continue;
    const val = answers[q.id];
    if (q.type === 'boolean') {
      if (typeof val !== 'boolean') errors[q.id] = 'Responde sí o no';
    } else if (q.type === 'text') {
      if (!String(val ?? '').trim()) errors[q.id] = 'Este campo es obligatorio';
    } else if (q.type === 'select') {
      if (!String(val ?? '').trim()) errors[q.id] = 'Selecciona una opción';
    }
  }
  return errors;
}

function questionCardClass(hasError: boolean, filled: boolean): string {
  const ring = hasError ? 'ring-1 ring-rose-300' : '';
  const tone = filled
    ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200/70'
    : 'bg-slate-50 border border-slate-200';
  return `rounded-2xl p-4 ${tone} ${ring}`;
}

export function FuneralHealthModal({
  open,
  plan,
  quote,
  frecuenciaLabel,
  questions,
  loadingQuestions,
  initialAnswers,
  saving,
  onClose,
  onConfirm,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setAnswers(initialAnswers ?? {});
    setErrors({});
  }, [open, initialAnswers, plan.cplan]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, saving]);

  const visibleQuestions = useMemo(
    () => questions.filter((q) => isVisible(q, answers)),
    [questions, answers],
  );

  if (!open) return null;

  const setAnswer = (id: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      // Si se oculta una hija (showIf), limpiar su respuesta
      for (const q of questions) {
        if (q.showIf?.field === id && !isVisible(q, next)) {
          delete next[q.id];
        }
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSubmit = () => {
    const nextErrors = validateAnswers(questions, answers);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onConfirm(answers);
  };

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="health-modal-title"
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        className="absolute inset-0 bg-[#091133]/55 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        aria-hidden
      />

      <div className="relative w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[88dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_32px_80px_-20px_rgba(9,17,51,0.45)] overflow-hidden animate-spring-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50/80 via-white to-white">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-black tracking-[0.22em] uppercase text-fuchsia-500 mb-1 inline-flex items-center gap-1.5">
              <ClipboardList size={11} />
              Confirmación · Salud
            </p>
            <h2 id="health-modal-title" className="font-display text-xl sm:text-2xl font-black text-slate-900 leading-tight">
              Cuestionario de salud
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Declara el estado de salud del asegurado para este plan. Los campos con * son obligatorios.
              Tus respuestas quedan en el expediente; un técnico las revisa antes del pago.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-white border border-slate-200 grid place-items-center text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors disabled:opacity-40 touch-manipulation"
            aria-label="Cerrar cuestionario y volver al plan"
          >
            <X size={16} />
          </button>
        </div>

        {/* Plan preview */}
        <div className="px-5 sm:px-7 py-4 bg-slate-50/80 border-b border-slate-100">
          <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-black uppercase tracking-wider text-indigo-500 mb-1">
                  Plan confirmado
                </p>
                <p className="font-display font-black text-slate-900 text-lg leading-tight">{plan.name}</p>
                <p className="text-xs text-slate-500 mt-1">{frecuenciaLabel}</p>
              </div>
              {quote && (
                <div className="text-right">
                  <p className="text-2xl font-display font-black gradient-text-indigo tabular-nums">
                    ${quote.mprimaext.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[0.65rem] text-slate-500 font-semibold uppercase">Prima</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-4">
          {loadingQuestions ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Cargando preguntas del plan…</p>
            </div>
          ) : visibleQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
              <AlertCircle size={24} className="text-amber-500" />
              <p className="text-sm font-medium">No hay preguntas configuradas para este plan.</p>
            </div>
          ) : (
            visibleQuestions.map((q, idx) => {
              const nested = Boolean(q.showIf?.field);
              const err = errors[q.id];
              const label = (q.label || '').trim() || 'Pregunta';
              return (
              <div
                key={q.id}
                className={`animate-fade-in ${nested ? 'pl-3 sm:pl-5 border-l-2 border-violet-200' : ''}`}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                {q.type === 'boolean' ? (
                  <div className={err ? 'rounded-2xl ring-1 ring-rose-300' : ''}>
                    <ToggleSwitch
                      checked={answers[q.id] === true}
                      onChange={(v) => setAnswer(q.id, v)}
                      label={`${label}${q.required ? ' *' : ''}`}
                      description={q.description}
                    />
                    {err && (
                      <p className="text-xs text-rose-500 font-medium mt-1.5 ml-1">{err}</p>
                    )}
                  </div>
                ) : q.type === 'text' ? (
                  <div className={questionCardClass(Boolean(err), Boolean(String(answers[q.id] ?? '').trim()))}>
                    <p className="font-bold text-sm text-slate-700 leading-snug">
                      {label}{q.required ? ' *' : ''}
                    </p>
                    {q.description && (
                      <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-500">{q.description}</p>
                    )}
                    <Textarea
                      className="mt-3"
                      value={String(answers[q.id] ?? '')}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      rows={3}
                    />
                    {err && <p className="text-xs text-rose-500 font-medium mt-1.5">{err}</p>}
                  </div>
                ) : (
                  <div className={questionCardClass(Boolean(err), Boolean(String(answers[q.id] ?? '').trim()))}>
                    <p className="font-bold text-sm text-slate-700 leading-snug">
                      {label}{q.required ? ' *' : ''}
                    </p>
                    {q.description && (
                      <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-500">{q.description}</p>
                    )}
                    <Select
                      className="mt-3"
                      value={String(answers[q.id] ?? '')}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    >
                      <option value="">— Seleccionar —</option>
                      {(q.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    {err && <p className="text-xs text-rose-500 font-medium mt-1.5">{err}</p>}
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-7 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white/95 backdrop-blur-md flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-500 order-2 sm:order-1">
            <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
            <span className="font-medium">Respuestas almacenadas de forma segura</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto order-1 sm:order-2">
            <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none min-w-[7.5rem]">
              Volver
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saving || loadingQuestions || visibleQuestions.length === 0}
              className="flex-1 sm:flex-none sm:min-w-[11.5rem] btn-shine"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  Confirmar y continuar
                  <Check size={15} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
