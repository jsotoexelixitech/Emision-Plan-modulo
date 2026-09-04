import { useMemo, useState } from 'react';
import {
  Plus, Trash2, CornerDownRight, ChevronDown, ChevronRight, GitBranch,
  RotateCcw, ChevronUp, Percent, Power,
} from 'lucide-react';

export type HealthQuestionType = 'boolean' | 'text' | 'select';

export interface HealthQuestionDraft {
  id: string;
  type: HealthQuestionType;
  label: string;
  description?: string;
  required?: boolean;
  /** false = no se muestra al cliente ni en scoring (parametrizador). */
  enabled?: boolean;
  plans: string[];
  showIf?: { field: string; equals: boolean | string };
  options?: { value: string; label: string }[];
  scoreIfTrue?: number;
  scoreIfFalse?: number;
  scoreIfFilled?: number;
  optionScores?: Record<string, number>;
  blockIfTrue?: boolean;
  blockIfFalse?: boolean;
  blockReason?: string;
}

export type PlanOption = { code: string; label: string };

/** Fallback si aún no llegan los planes del API (mismas etiquetas del flujo). */
export const FALLBACK_FUNERAL_PLAN_OPTIONS: PlanOption[] = [
  { code: '2', label: '1.000$ Funerario Individual' },
  { code: '3', label: '1.500$ Funerario Individual' },
  { code: '4', label: '2.000$ Funerario Individual' },
  { code: '5', label: '2.500$ Funerario Individual' },
  { code: '6', label: '3.000$ Funerario Individual' },
  { code: '7', label: '4.000$ Funerario Individual' },
  { code: '8', label: '5.000$ Funerario Individual' },
  { code: '9', label: '7.500$ Individual' },
];

const FALLBACK_CODES = FALLBACK_FUNERAL_PLAN_OPTIONS.map((p) => p.code);

const TYPE_LABEL: Record<HealthQuestionType, string> = {
  boolean: 'Sí/No',
  text: 'Texto',
  select: 'Lista',
};

/** Seed si la config aún no trae preguntas (mismo default que Nexus). */
export const DEFAULT_HEALTH_QUESTIONS_SEED: HealthQuestionDraft[] = [
  {
    id: 'fuma',
    type: 'boolean',
    label: '¿Fuma o ha fumado en los últimos 12 meses?',
    description: 'Incluye cigarrillos, tabaco, puros o vapeo.',
    required: true,
    plans: [...FALLBACK_CODES],
    scoreIfTrue: 15,
  },
  {
    id: 'diagnosticoEnfermedad',
    type: 'boolean',
    label: '¿Ha sido diagnosticado con alguna enfermedad grave?',
    description: 'Cáncer, diabetes, hipertensión, cardiopatías, VIH, etc.',
    required: true,
    plans: [...FALLBACK_CODES],
    scoreIfTrue: 40,
  },
  {
    id: 'descripcionEnfermedad',
    type: 'text',
    label: 'Describa la enfermedad diagnosticada',
    description: 'Indique enfermedad, tratamiento y fecha aproximada del diagnóstico.',
    required: true,
    plans: [...FALLBACK_CODES],
    showIf: { field: 'diagnosticoEnfermedad', equals: true },
    scoreIfFilled: 5,
  },
  {
    id: 'aceptaTerminos',
    type: 'boolean',
    label: 'Acepto los términos y condiciones',
    description: 'Declaro que la información suministrada es verídica y acepto las condiciones de la póliza.',
    required: true,
    plans: [...FALLBACK_CODES],
    scoreIfFalse: 100,
    blockIfFalse: true,
    blockReason: 'Debe aceptar los términos y condiciones.',
  },
  {
    id: 'consumeAlcohol',
    type: 'boolean',
    label: '¿Consume alcohol de forma habitual?',
    description: 'Más de 2 copas por semana de forma regular.',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
    scoreIfTrue: 10,
  },
  {
    id: 'hospitalizacionReciente',
    type: 'boolean',
    label: '¿Ha sido hospitalizado en los últimos 24 meses?',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
    scoreIfTrue: 25,
  },
  {
    id: 'motivoHospitalizacion',
    type: 'text',
    label: 'Motivo de la hospitalización',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
    showIf: { field: 'hospitalizacionReciente', equals: true },
    scoreIfFilled: 5,
  },
  {
    id: 'medicacionCronica',
    type: 'boolean',
    label: '¿Toma medicación de forma crónica?',
    description: 'Medicamentos prescritos de forma continua.',
    required: true,
    plans: ['7', '8', '9'],
    scoreIfTrue: 20,
  },
  {
    id: 'detalleMedicacion',
    type: 'text',
    label: 'Indique los medicamentos',
    required: true,
    plans: ['7', '8', '9'],
    showIf: { field: 'medicacionCronica', equals: true },
    scoreIfFilled: 5,
  },
  {
    id: 'deporteRiesgo',
    type: 'boolean',
    label: '¿Practica deportes de alto riesgo?',
    description: 'Paracaidismo, montañismo, buceo, carreras, etc.',
    required: true,
    plans: ['9'],
    scoreIfTrue: 30,
  },
];

/** Si una pregunta conocida no tiene %, rellena el puntaje del default (no pisa valores ya guardados). */
export function enrichHealthQuestionScores(list: HealthQuestionDraft[]): HealthQuestionDraft[] {
  const byId = new Map(DEFAULT_HEALTH_QUESTIONS_SEED.map((q) => [q.id, q]));
  return list.map((q) => {
    const d = byId.get(q.id);
    if (!d) return q;
    return {
      ...q,
      scoreIfTrue: q.scoreIfTrue ?? d.scoreIfTrue,
      scoreIfFalse: q.scoreIfFalse ?? d.scoreIfFalse,
      scoreIfFilled: q.scoreIfFilled ?? d.scoreIfFilled,
      optionScores: q.optionScores ?? d.optionScores,
      blockIfTrue: q.blockIfTrue ?? d.blockIfTrue,
      blockIfFalse: q.blockIfFalse ?? d.blockIfFalse,
      blockReason: q.blockReason ?? d.blockReason,
    };
  });
}

function scoreSummary(q: HealthQuestionDraft): string {
  const bits: string[] = [];
  if (q.type === 'boolean') {
    if (q.scoreIfTrue) bits.push(`Sí +${q.scoreIfTrue}%`);
    if (q.scoreIfFalse) bits.push(`No +${q.scoreIfFalse}%`);
  } else if (q.type === 'text' && q.scoreIfFilled) {
    bits.push(`texto +${q.scoreIfFilled}%`);
  } else if (q.type === 'select' && q.optionScores) {
    const scored = Object.entries(q.optionScores).filter(([, n]) => Number(n) > 0);
    if (scored.length) bits.push(scored.map(([k, n]) => `${k} +${n}%`).join(' · '));
  }
  if (q.blockIfTrue || q.blockIfFalse) bits.push('bloquea');
  return bits.join(' · ') || 'sin %';
}

function plansSummary(
  plans: string[],
  planOptions: PlanOption[],
): string {
  const allCodes = planOptions.map((p) => p.code);
  if (!plans?.length) return 'ningún plan';
  if (allCodes.length > 0 && plans.length >= allCodes.length && allCodes.every((c) => plans.includes(c))) {
    return 'todos';
  }
  const byCode = new Map(planOptions.map((p) => [p.code, p.label]));
  return plans
    .slice()
    .sort()
    .map((c) => byCode.get(c) || c)
    .join(' · ');
}

type Props = {
  questions: HealthQuestionDraft[];
  onChange: (next: HealthQuestionDraft[]) => void;
  /** Planes reales del módulo (cplan + nombre). */
  planOptions?: PlanOption[];
  plansLoading?: boolean;
  plansError?: boolean;
};

const inp = 'w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white';
const lbl = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1';

export function FuneralHealthQuestionsEditor({
  questions,
  onChange,
  planOptions: planOptionsProp,
  plansLoading = false,
  plansError = false,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const planOptions = useMemo(
    () => (planOptionsProp?.length ? planOptionsProp : FALLBACK_FUNERAL_PLAN_OPTIONS),
    [planOptionsProp],
  );
  const allPlanCodes = useMemo(() => planOptions.map((p) => p.code), [planOptions]);

  const update = (idx: number, patch: Partial<HealthQuestionDraft>) => {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const togglePlan = (idx: number, code: string) => {
    const q = questions[idx];
    const has = q.plans.includes(code);
    const plans = has ? q.plans.filter((p) => p !== code) : [...q.plans, code];
    update(idx, { plans });
  };

  const setAllPlans = (idx: number, all: boolean) => {
    update(idx, { plans: all ? [...allPlanCodes] : [] });
  };

  const addQuestion = () => {
    const id = `pregunta_${Date.now().toString(36)}`;
    onChange([
      ...questions,
      {
        id,
        type: 'boolean',
        label: 'Nueva pregunta',
        required: true,
        enabled: true,
        plans: [...allPlanCodes],
        scoreIfTrue: 10,
      },
    ]);
    setOpenId(id);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [row] = next.splice(idx, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  const restoreDefaults = () => {
    onChange(DEFAULT_HEALTH_QUESTIONS_SEED.map((q) => ({
      ...q,
      plans: [...q.plans],
      options: q.options ? q.options.map((o) => ({ ...o })) : undefined,
      optionScores: q.optionScores ? { ...q.optionScores } : undefined,
    })));
    setOpenId(null);
  };

  const addFollowUp = (parentIdx: number) => {
    const parent = questions[parentIdx];
    const existingIdx = questions.findIndex(
      (q, i) => i !== parentIdx && q.showIf?.field === parent.id && q.type === 'text',
    );
    if (existingIdx >= 0) {
      setOpenId(questions[existingIdx].id);
      return;
    }
    const id = `detalle_${parent.id}_${Date.now().toString(36).slice(-4)}`;
    const equals =
      parent.type === 'select' && parent.options?.[0]
        ? parent.options[0].value
        : true;
    const child: HealthQuestionDraft = {
      id,
      type: 'text',
      label: `Detalle de: ${parent.label}`,
      required: true,
      enabled: true,
      plans: [...parent.plans],
      showIf: { field: parent.id, equals },
      scoreIfFilled: 5,
    };
    const next = [...questions];
    next.splice(parentIdx + 1, 0, child);
    onChange(next);
    setOpenId(id);
  };

  const removeFollowUp = (parentIdx: number) => {
    const parentId = questions[parentIdx]?.id;
    if (!parentId) return;
    const next = questions.filter(
      (q, i) => !(i !== parentIdx && q.showIf?.field === parentId && q.type === 'text'),
    );
    onChange(next);
    setOpenId(questions[parentIdx]?.id ?? null);
  };

  const remove = (idx: number) => {
    const id = questions[idx]?.id;
    onChange(questions.filter((_, i) => i !== idx));
    if (openId === id) setOpenId(null);
  };

  const parentOptionsFor = (idx: number) => questions.filter((_, i) => i !== idx);

  const equalsChoices = (parentId: string | undefined) => {
    const parent = questions.find((q) => q.id === parentId);
    if (parent?.type === 'select' && parent.options?.length) {
      return parent.options.map((o) => ({ value: o.value, label: o.label }));
    }
    return [
      { value: 'true', label: 'Sí' },
      { value: 'false', label: 'No' },
    ];
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Preguntas · {questions.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Pulsa una fila para editarla. El <strong className="font-semibold text-slate-600">%</strong> lo
            ve solo el técnico. Tras <strong className="font-semibold text-slate-600">Guardar</strong>, el
            cliente ve las preguntas <em>visibles</em> de este canal.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={restoreDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
            title="Sustituye el cuestionario actual por las preguntas de fábrica. Hay que Guardar para aplicar."
          >
            <RotateCcw size={13} /> Defaults
          </button>
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
            title="Agrega una pregunta al final. Recuerda Guardar."
          >
            <Plus size={14} /> Nueva
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600 leading-relaxed space-y-0.5">
        <p>
          <strong className="font-semibold text-slate-700">Interruptor:</strong> On = el cliente la ve.
          Off = queda en este panel pero no sale en el flujo. El historial de casos ya enviados no cambia.
        </p>
        <p>
          <strong className="font-semibold text-slate-700">Cajón de detalle:</strong> no es un tipo
          aparte. Abre la pregunta Sí/No o Lista → <em>Agregar cajón de texto</em>. El cliente solo
          lo ve si responde Sí (o la opción que indiques).
        </p>
        <p>
          <strong className="font-semibold text-slate-700">Papelera:</strong> la quita del catálogo.
          No borra respuestas de solicitudes anteriores.
        </p>
      </div>

      {questions.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm rounded-xl border border-dashed border-slate-200 bg-slate-50">
          No hay preguntas. Pulsa Nueva o Defaults. Luego Guardar.
        </div>
      )}

      <ul className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
        {questions.map((q, idx) => {
          const open = openId === q.id;
          const isChild = Boolean(q.showIf?.field);
          const isActive = q.enabled !== false;
          return (
            <li
              key={`${q.id}-${idx}`}
              className={`${isChild ? 'bg-violet-50/30' : ''} ${!isActive ? 'opacity-55' : ''}`}
            >
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : q.id)}
                  className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                  title={open ? 'Cerrar edición' : 'Abrir para editar texto, planes, % y condición'}
                >
                  <span className="text-slate-400 shrink-0">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="w-5 text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      q.type === 'boolean'
                        ? 'bg-sky-50 text-sky-700'
                        : q.type === 'text'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {TYPE_LABEL[q.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 truncate">
                      {isChild && (
                        <GitBranch size={12} className="inline mr-1 text-violet-500 -mt-0.5" />
                      )}
                      {q.label || '(sin texto)'}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      Planes {plansSummary(q.plans, planOptions)}
                      {q.showIf?.field ? ' · solo si responde otra' : ''}
                      {q.required ? ' · obligatoria' : ' · opcional'}
                      {!isActive ? ' · oculta al cliente' : ''}
                    </span>
                  </span>
                  {!isActive && (
                    <span
                      className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-100 text-slate-500"
                      title="El cliente no la ve. Activa el interruptor para mostrarla de nuevo."
                    >
                      <Power size={10} className="inline -mt-0.5" /> Oculta
                    </span>
                  )}
                  <span
                    className="hidden sm:inline-flex items-center gap-1 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-indigo-100 bg-indigo-50 text-indigo-700"
                    title="Puntaje que suma en mesa técnica. El cliente no lo ve."
                  >
                    <Percent size={10} />
                    {scoreSummary(q)}
                  </span>
                </button>
                <div className="flex flex-col justify-center border-l border-slate-100">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="px-1.5 py-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                    title="Subir en el orden que ve el cliente"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === questions.length - 1}
                    className="px-1.5 py-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                    title="Bajar en el orden que ve el cliente"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <span className="self-center flex flex-col items-center justify-center px-1 min-w-[3.4rem]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    aria-label={
                      isActive
                        ? 'Ocultar al cliente. La pregunta sigue en este panel y en el historial.'
                        : 'Mostrar de nuevo al cliente'
                    }
                    onClick={() => update(idx, { enabled: !isActive })}
                    className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
                      isActive ? 'bg-indigo-500' : 'bg-slate-300'
                    }`}
                    title={
                      isActive
                        ? 'Visible al cliente. Clic para ocultarla (no se borra; el historial no cambia).'
                        : 'Oculta al cliente. Clic para volver a mostrarla en el flujo.'
                    }
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-[8px] font-black uppercase tracking-wide mt-0.5 ${
                    isActive ? 'text-indigo-600' : 'text-slate-400'
                  }`}>
                    {isActive ? 'Visible' : 'Oculta'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="px-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Eliminar del catálogo. Las solicitudes ya enviadas conservan la respuesta."
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {open && (
                <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-slate-100 bg-slate-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2.5">
                    <div className="sm:col-span-4">
                      <label className={lbl}>Tipo de respuesta</label>
                      <select
                        className={inp}
                        value={q.type}
                        title="Cómo contesta el cliente: sí/no, texto o una lista"
                        onChange={(e) => {
                          const type = e.target.value as HealthQuestionType;
                          const patch: Partial<HealthQuestionDraft> = { type };
                          if (type === 'select' && !q.options?.length) {
                            patch.options = [
                              { value: 'si', label: 'Sí' },
                              { value: 'no', label: 'No' },
                            ];
                          }
                          if (type !== 'select') {
                            patch.options = undefined;
                            patch.optionScores = undefined;
                          }
                          update(idx, patch);
                        }}
                      >
                        <option value="boolean">Sí / No</option>
                        <option value="text">Texto libre</option>
                        <option value="select">Lista de opciones</option>
                      </select>
                    </div>
                    <div className="sm:col-span-8 flex items-end gap-3 pb-0.5">
                      <label
                        className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600"
                        title="Si está marcada, el cliente no puede continuar sin responder"
                      >
                        <input
                          type="checkbox"
                          checked={!!q.required}
                          onChange={(e) => update(idx, { required: e.target.checked })}
                          className="rounded text-indigo-600"
                        />
                        Obligatoria
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Texto que lee el cliente</label>
                    <input
                      className={inp}
                      value={q.label}
                      onChange={(e) => update(idx, { label: e.target.value })}
                      placeholder="Ej. ¿Fuma o ha fumado en los últimos 12 meses?"
                    />
                  </div>

                  <div>
                    <label className={lbl}>Ayuda bajo la pregunta (opcional)</label>
                    <input
                      className={inp}
                      value={q.description ?? ''}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      placeholder="Aclaración corta. El técnico no la usa para puntuar."
                    />
                  </div>

                  {(q.type === 'boolean' || q.type === 'select') && !isChild && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                        Cajón de detalle
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5 mb-2 leading-relaxed">
                        {questions.some((x, i) => i !== idx && x.showIf?.field === q.id && x.type === 'text')
                          ? 'Ya hay un cajón. Puedes ir a editarlo, ocultarlo (interruptor) o quitarlo. No está fijo en esta pregunta.'
                          : `No es un tipo más. Crea un recuadro de texto que el cliente solo ve si${
                              q.type === 'boolean' ? ' responde Sí' : ' elige una opción'
                            }.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addFollowUp(idx)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors"
                        >
                          <CornerDownRight size={14} />
                          {questions.some((x, i) => i !== idx && x.showIf?.field === q.id && x.type === 'text')
                            ? 'Ir al cajón de texto'
                            : q.type === 'boolean'
                              ? 'Agregar cajón de texto si responde Sí'
                              : 'Agregar cajón de texto al elegir una opción'}
                        </button>
                        {questions.some((x, i) => i !== idx && x.showIf?.field === q.id && x.type === 'text') && (
                          <button
                            type="button"
                            onClick={() => removeFollowUp(idx)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors"
                            title="Quita el recuadro de detalle. La pregunta Sí/No se queda."
                          >
                            <Trash2 size={13} />
                            Quitar cajón
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5 space-y-2">
                    <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">
                      Cajón ligado / mostrar solo si…
                    </p>
                    <p className="text-[11px] text-slate-500 -mt-1">
                      {isChild
                        ? 'Esta pregunta es el cajón: solo se abre si la de arriba tiene esa respuesta.'
                        : 'Déjalo en «Siempre visible» salvo que esta fila sea el detalle de otra.'}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[160px]">
                        <label className={lbl}>Esta pregunta aparece si</label>
                        <select
                          className={inp}
                          value={q.showIf?.field ?? ''}
                          onChange={(e) => {
                            const field = e.target.value;
                            if (!field) {
                              update(idx, { showIf: undefined });
                              return;
                            }
                            const parent = questions.find((p) => p.id === field);
                            const equals =
                              parent?.type === 'select' && parent.options?.[0]
                                ? parent.options[0].value
                                : true;
                            update(idx, { showIf: { field, equals } });
                          }}
                        >
                          <option value="">Siempre visible</option>
                          {parentOptionsFor(idx).map((p) => (
                            <option key={p.id} value={p.id}>
                              {(p.label || 'Pregunta').slice(0, 70)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className={lbl}>Respuesta</label>
                        <select
                          className={inp}
                          disabled={!q.showIf?.field}
                          value={q.showIf ? String(q.showIf.equals) : 'true'}
                          onChange={(e) => {
                            if (!q.showIf?.field) return;
                            const raw = e.target.value;
                            const equals =
                              raw === 'true' ? true : raw === 'false' ? false : raw;
                            update(idx, { showIf: { field: q.showIf.field, equals } });
                          }}
                        >
                          {equalsChoices(q.showIf?.field).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {(() => {
                      const parentId = q.showIf?.field;
                      if (!parentId) return null;
                      const parent = questions.find((p) => p.id === parentId);
                      if (!parent) {
                        return (
                          <p className="text-[11px] text-rose-600 font-semibold">
                            La pregunta a la que está ligada ya no está en la lista. En el flujo no se verá.
                          </p>
                        );
                      }
                      const overlap = (q.plans || []).filter((p) => parent.plans.includes(p));
                      if (overlap.length === 0) {
                        return (
                          <p className="text-[11px] text-amber-700 font-semibold">
                            Sin planes en común con «{parent.label || parentId}»
                            ({plansSummary(parent.plans, planOptions)}).
                            En esos planes este cajón no podrá mostrarse.
                          </p>
                        );
                      }
                      if (parent.plans.length < allPlanCodes.length) {
                        return (
                          <p className="text-[11px] text-slate-500">
                            Solo visible en planes donde también esté «{parent.label || parentId}»
                            ({plansSummary(parent.plans, planOptions)}), y si responde {String(q.showIf?.equals)}.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 inline-flex items-center gap-1">
                      <Percent size={11} />
                      Puntaje para mesa técnica
                    </p>
                    <p className="text-[11px] text-slate-500 -mt-1">
                      El cliente no ve estos %. Solo aparecen en el desglose del técnico.
                    </p>
                    {q.type === 'boolean' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={lbl}>% si responde Sí</label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              className={`${inp} pr-8`}
                              value={q.scoreIfTrue ?? ''}
                              onChange={(e) =>
                                update(idx, {
                                  scoreIfTrue: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                              }
                              placeholder="0"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                          </div>
                        </div>
                        <div>
                          <label className={lbl}>% si responde No</label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              className={`${inp} pr-8`}
                              value={q.scoreIfFalse ?? ''}
                              onChange={(e) =>
                                update(idx, {
                                  scoreIfFalse: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                              }
                              placeholder="0"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {q.type === 'text' && (
                      <div>
                        <label className={lbl}>% si escribe algo</label>
                        <div className="relative max-w-[10rem]">
                          <input
                            type="number"
                            min={0}
                            className={`${inp} pr-8`}
                            value={q.scoreIfFilled ?? ''}
                            onChange={(e) =>
                              update(idx, {
                                scoreIfFilled: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="0"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    )}
                    {q.type === 'select' && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">Valor interno · texto que ve el cliente · % del técnico.</p>
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={`${opt.value}-${oi}`} className="grid grid-cols-[1fr_1fr_5.5rem] gap-1.5">
                            <input
                              className={`${inp} font-mono text-xs`}
                              value={opt.value}
                              placeholder="clave"
                              title="Valor interno (no lo ve el cliente)"
                              onChange={(e) => {
                                const options = [...(q.options ?? [])];
                                const prev = options[oi].value;
                                options[oi] = { ...options[oi], value: e.target.value.trim() };
                                const optionScores = { ...(q.optionScores ?? {}) };
                                if (prev && prev !== options[oi].value) {
                                  optionScores[options[oi].value] = optionScores[prev];
                                  delete optionScores[prev];
                                }
                                update(idx, { options, optionScores });
                              }}
                            />
                            <input
                              className={inp}
                              value={opt.label}
                              placeholder="Texto al cliente"
                              title="Lo que lee el cliente en la lista"
                              onChange={(e) => {
                                const options = [...(q.options ?? [])];
                                options[oi] = { ...options[oi], label: e.target.value };
                                update(idx, { options });
                              }}
                            />
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                className={`${inp} pr-6`}
                                value={q.optionScores?.[opt.value] ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                  const optionScores = { ...(q.optionScores ?? {}) };
                                  if (e.target.value === '') delete optionScores[opt.value];
                                  else optionScores[opt.value] = Number(e.target.value);
                                  update(idx, { optionScores });
                                }}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            update(idx, {
                              options: [...(q.options ?? []), { value: `opcion_${(q.options?.length ?? 0) + 1}`, label: 'Nueva opción' }],
                            })
                          }
                          className="text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          + Opción
                        </button>
                      </div>
                    )}
                    {q.type === 'boolean' && (
                      <div className="pt-1 border-t border-indigo-100 space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          Bloquear el envío
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Si se cumple, el cliente no puede continuar. El caso no llega a mesa técnica.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-indigo-600"
                              checked={!!q.blockIfTrue}
                              onChange={(e) => update(idx, { blockIfTrue: e.target.checked || undefined })}
                            />
                            Bloquear si Sí
                          </label>
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-indigo-600"
                              checked={!!q.blockIfFalse}
                              onChange={(e) => update(idx, { blockIfFalse: e.target.checked || undefined })}
                            />
                            Bloquear si No
                          </label>
                        </div>
                        {(q.blockIfTrue || q.blockIfFalse) && (
                          <input
                            className={inp}
                            value={q.blockReason ?? ''}
                            onChange={(e) => update(idx, { blockReason: e.target.value || undefined })}
                            placeholder="Mensaje que verá el cliente si se bloquea"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={lbl + ' mb-0'}>En qué planes aparece</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[10px] font-bold text-indigo-600 hover:underline"
                          onClick={() => setAllPlans(idx, true)}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-slate-400 hover:underline"
                          onClick={() => setAllPlans(idx, false)}
                        >
                          Ninguno
                        </button>
                      </div>
                    </div>
                    {plansLoading && (
                      <p className="text-[11px] text-slate-500 mb-1.5">Cargando planes del módulo…</p>
                    )}
                    {plansError && !plansLoading && (
                      <p className="text-[11px] text-amber-700 mb-1.5 font-semibold">
                        No se pudieron cargar los planes del API; se muestran los nombres de respaldo.
                      </p>
                    )}
                    <div className="flex flex-col gap-1">
                      {planOptions.map((p) => (
                        <label
                          key={p.code}
                          className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            q.plans.includes(p.code)
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded text-indigo-600"
                            checked={q.plans.includes(p.code)}
                            onChange={() => togglePlan(idx, p.code)}
                          />
                          <span className="min-w-0 flex-1 leading-snug">{p.label}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">
                            cplan {p.code}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
