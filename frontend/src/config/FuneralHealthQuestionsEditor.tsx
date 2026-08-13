import { useState } from 'react';
import {
  Plus, Trash2, CornerDownRight, ChevronDown, ChevronRight, GitBranch,
} from 'lucide-react';

export type HealthQuestionType = 'boolean' | 'text' | 'select';

export interface HealthQuestionDraft {
  id: string;
  type: HealthQuestionType;
  label: string;
  description?: string;
  required?: boolean;
  plans: string[];
  showIf?: { field: string; equals: boolean | string };
  options?: { value: string; label: string }[];
}

const PLAN_OPTIONS: { code: string; label: string }[] = [
  { code: '2', label: '1.000$' },
  { code: '3', label: '1.500$' },
  { code: '4', label: '2.000$' },
  { code: '5', label: '2.500$' },
  { code: '6', label: '3.000$' },
  { code: '7', label: '4.000$' },
  { code: '8', label: '5.000$' },
  { code: '9', label: '7.500$' },
];

const ALL_PLANS = PLAN_OPTIONS.map((p) => p.code);

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
    plans: [...ALL_PLANS],
  },
  {
    id: 'diagnosticoEnfermedad',
    type: 'boolean',
    label: '¿Ha sido diagnosticado con alguna enfermedad grave?',
    description: 'Cáncer, diabetes, hipertensión, cardiopatías, VIH, etc.',
    required: true,
    plans: [...ALL_PLANS],
  },
  {
    id: 'descripcionEnfermedad',
    type: 'text',
    label: 'Describa la enfermedad diagnosticada',
    description: 'Indique enfermedad, tratamiento y fecha aproximada del diagnóstico.',
    required: true,
    plans: [...ALL_PLANS],
    showIf: { field: 'diagnosticoEnfermedad', equals: true },
  },
  {
    id: 'aceptaTerminos',
    type: 'boolean',
    label: 'Acepto los términos y condiciones',
    description: 'Declaro que la información suministrada es verídica y acepto las condiciones de la póliza.',
    required: true,
    plans: [...ALL_PLANS],
  },
  {
    id: 'consumeAlcohol',
    type: 'boolean',
    label: '¿Consume alcohol de forma habitual?',
    description: 'Más de 2 copas por semana de forma regular.',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
  },
  {
    id: 'hospitalizacionReciente',
    type: 'boolean',
    label: '¿Ha sido hospitalizado en los últimos 24 meses?',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
  },
  {
    id: 'motivoHospitalizacion',
    type: 'text',
    label: 'Motivo de la hospitalización',
    required: true,
    plans: ['5', '6', '7', '8', '9'],
    showIf: { field: 'hospitalizacionReciente', equals: true },
  },
  {
    id: 'medicacionCronica',
    type: 'boolean',
    label: '¿Toma medicación de forma crónica?',
    description: 'Medicamentos prescritos de forma continua.',
    required: true,
    plans: ['7', '8', '9'],
  },
  {
    id: 'detalleMedicacion',
    type: 'text',
    label: 'Indique los medicamentos',
    required: true,
    plans: ['7', '8', '9'],
    showIf: { field: 'medicacionCronica', equals: true },
  },
  {
    id: 'deporteRiesgo',
    type: 'boolean',
    label: '¿Practica deportes de alto riesgo?',
    description: 'Paracaidismo, montañismo, buceo, carreras, etc.',
    required: true,
    plans: ['9'],
  },
];

function slugId(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return base || `pregunta_${Date.now().toString(36)}`;
}

function plansSummary(plans: string[]): string {
  if (!plans?.length) return 'ningún plan';
  if (plans.length === ALL_PLANS.length) return 'todos';
  return plans.slice().sort().join(', ');
}

type Props = {
  questions: HealthQuestionDraft[];
  onChange: (next: HealthQuestionDraft[]) => void;
};

const inp = 'w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white';
const lbl = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1';

export function FuneralHealthQuestionsEditor({ questions, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

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
    update(idx, { plans: all ? [...ALL_PLANS] : [] });
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
        plans: [...ALL_PLANS],
      },
    ]);
    setOpenId(id);
  };

  const addFollowUp = (parentIdx: number) => {
    const parent = questions[parentIdx];
    // Un solo detalle automático por padre (evitar duplicados al re-clic)
    const existingIdx = questions.findIndex(
      (q, i) => i !== parentIdx && q.showIf?.field === parent.id && q.type === 'text',
    );
    if (existingIdx >= 0) {
      setOpenId(questions[existingIdx].id);
      return;
    }
    const id = `detalle_${parent.id}_${Date.now().toString(36).slice(-4)}`;
    const child: HealthQuestionDraft = {
      id,
      type: 'text',
      label: `Detalle de: ${parent.label}`,
      required: true,
      plans: [...parent.plans],
      showIf: { field: parent.id, equals: true },
    };
    const next = [...questions];
    next.splice(parentIdx + 1, 0, child);
    onChange(next);
    setOpenId(id);
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Preguntas · {questions.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            Clic en una fila para editar. Condicional = se despliega según otra respuesta.
          </p>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus size={14} /> Nueva
        </button>
      </div>

      {questions.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm rounded-xl border border-dashed border-slate-200 bg-slate-50">
          No hay preguntas. Agrega una o restaura defaults.
        </div>
      )}

      <ul className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
        {questions.map((q, idx) => {
          const open = openId === q.id;
          const isChild = Boolean(q.showIf?.field);
          return (
            <li key={`${q.id}-${idx}`} className={isChild ? 'bg-violet-50/30' : ''}>
              {/* Fila compacta */}
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : q.id)}
                  className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
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
                    <span className="block text-[10px] text-slate-400 font-mono truncate">
                      {q.id}
                      {' · '}
                      planes {plansSummary(q.plans)}
                      {q.showIf?.field
                        ? ` · si ${q.showIf.field}=${String(q.showIf.equals)}`
                        : ''}
                      {q.required ? ' · obligatoria' : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="px-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Editor expandido */}
              {open && (
                <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-slate-100 bg-slate-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2.5">
                    <div className="sm:col-span-4">
                      <label className={lbl}>ID</label>
                      <input
                        className={`${inp} font-mono text-xs`}
                        value={q.id}
                        onChange={(e) =>
                          update(idx, { id: e.target.value.trim() || slugId(q.label) })
                        }
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className={lbl}>Tipo</label>
                      <select
                        className={inp}
                        value={q.type}
                        onChange={(e) => {
                          const type = e.target.value as HealthQuestionType;
                          const patch: Partial<HealthQuestionDraft> = { type };
                          if (type === 'select' && !q.options?.length) {
                            patch.options = [
                              { value: 'si', label: 'Sí' },
                              { value: 'no', label: 'No' },
                            ];
                          }
                          if (type !== 'select') patch.options = undefined;
                          update(idx, patch);
                        }}
                      >
                        <option value="boolean">Sí / No</option>
                        <option value="text">Texto libre</option>
                        <option value="select">Selección</option>
                      </select>
                    </div>
                    <div className="sm:col-span-5 flex items-end gap-3 pb-0.5">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!q.required}
                          onChange={(e) => update(idx, { required: e.target.checked })}
                          className="rounded text-indigo-600"
                        />
                        Obligatoria
                      </label>
                      {q.type === 'boolean' && (
                        <button
                          type="button"
                          onClick={() => addFollowUp(idx)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900"
                        >
                          <CornerDownRight size={12} />
                          Detalle al Sí
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Texto de la pregunta</label>
                    <input
                      className={inp}
                      value={q.label}
                      onChange={(e) => update(idx, { label: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className={lbl}>Ayuda (opcional)</label>
                    <input
                      className={inp}
                      value={q.description ?? ''}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      placeholder="Texto secundario bajo la pregunta"
                    />
                  </div>

                  {q.type === 'select' && (
                    <div>
                      <label className={lbl}>Opciones · value|etiqueta</label>
                      <textarea
                        className={`${inp} font-mono text-xs min-h-[56px]`}
                        value={(q.options ?? []).map((o) => `${o.value}|${o.label}`).join('\n')}
                        onChange={(e) => {
                          const options = e.target.value
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => {
                              const [value, ...rest] = line.split('|');
                              const label = rest.join('|').trim() || value.trim();
                              return { value: value.trim(), label };
                            })
                            .filter((o) => o.value);
                          update(idx, { options });
                        }}
                        placeholder={'si|Sí\nno|No'}
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={lbl + ' mb-0'}>Planes (cplan)</label>
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
                    <div className="flex flex-wrap gap-1">
                      {PLAN_OPTIONS.map((p) => (
                        <label
                          key={p.code}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold cursor-pointer ${
                            q.plans.includes(p.code)
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={q.plans.includes(p.code)}
                            onChange={() => togglePlan(idx, p.code)}
                          />
                          {p.code}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2 pt-0.5">
                    <div className="flex-1 min-w-[140px]">
                      <label className={lbl}>Se despliega si</label>
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
                            {p.id}
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
                          La pregunta padre «{parentId}» no existe en esta lista. En el flujo no se verá.
                        </p>
                      );
                    }
                    const overlap = (q.plans || []).filter((p) => parent.plans.includes(p));
                    if (overlap.length === 0) {
                      return (
                        <p className="text-[11px] text-amber-700 font-semibold">
                          Sin planes en común con «{parentId}» (planes {plansSummary(parent.plans)}).
                          En esos planes esta pregunta no podrá mostrarse.
                        </p>
                      );
                    }
                    if (parent.plans.length < ALL_PLANS.length) {
                      return (
                        <p className="text-[11px] text-slate-500">
                          Solo visible en planes donde también esté «{parentId}»
                          ({plansSummary(parent.plans)}), y si responde {String(q.showIf?.equals)}.
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
