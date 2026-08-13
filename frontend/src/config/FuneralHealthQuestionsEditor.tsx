import { Plus, Trash2 } from 'lucide-react';

export type HealthQuestionType = 'boolean' | 'text' | 'select';

export interface HealthQuestionDraft {
  id: string;
  type: HealthQuestionType;
  label: string;
  description?: string;
  required?: boolean;
  plans: string[];
  showIf?: { field: string; equals: boolean | string };
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

type Props = {
  questions: HealthQuestionDraft[];
  onChange: (next: HealthQuestionDraft[]) => void;
};

const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white';
const lbl = 'text-[11px] font-bold text-slate-500 block mb-1.5';

export function FuneralHealthQuestionsEditor({ questions, onChange }: Props) {
  const update = (idx: number, patch: Partial<HealthQuestionDraft>) => {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const togglePlan = (idx: number, code: string) => {
    const q = questions[idx];
    const has = q.plans.includes(code);
    const plans = has ? q.plans.filter((p) => p !== code) : [...q.plans, code];
    update(idx, { plans });
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
  };

  const remove = (idx: number) => {
    onChange(questions.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Cuestionario de salud
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Estas preguntas se muestran al elegir un plan funerario. Los códigos son cplan Sis2000 (2–9).
          </p>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors shrink-0"
        >
          <Plus size={14} /> Nueva pregunta
        </button>
      </div>

      {questions.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
          No hay preguntas. Agrega al menos una o restaura defaults.
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={`${q.id}-${idx}`}
            className="rounded-2xl border border-indigo-100 bg-white/60 p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                <div>
                  <label className={lbl}>ID (clave interna)</label>
                  <input
                    className={`${inp} font-mono`}
                    value={q.id}
                    onChange={(e) => update(idx, { id: e.target.value.trim() || slugId(q.label) })}
                  />
                </div>
                <div>
                  <label className={lbl}>Tipo</label>
                  <select
                    className={inp}
                    value={q.type}
                    onChange={(e) => update(idx, { type: e.target.value as HealthQuestionType })}
                  >
                    <option value="boolean">Sí / No</option>
                    <option value="text">Texto libre</option>
                    <option value="select">Selección</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="p-2.5 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div>
              <label className={lbl}>Pregunta (texto visible)</label>
              <input
                className={inp}
                value={q.label}
                onChange={(e) => update(idx, { label: e.target.value })}
              />
            </div>

            <div>
              <label className={lbl}>Descripción / ayuda (opcional)</label>
              <input
                className={inp}
                value={q.description ?? ''}
                onChange={(e) => update(idx, { description: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!q.required}
                onChange={(e) => update(idx, { required: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span className="text-sm font-bold text-slate-700">Obligatoria</span>
            </label>

            <div>
              <label className={lbl}>Planes donde aplica (cplan)</label>
              <div className="flex flex-wrap gap-2">
                {PLAN_OPTIONS.map((p) => (
                  <label
                    key={p.code}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                      q.plans.includes(p.code)
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={q.plans.includes(p.code)}
                      onChange={() => togglePlan(idx, p.code)}
                    />
                    {p.code} · {p.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Mostrar si (campo, opcional)</label>
                <input
                  className={`${inp} font-mono`}
                  placeholder="ej: diagnosticoEnfermedad"
                  value={q.showIf?.field ?? ''}
                  onChange={(e) => {
                    const field = e.target.value.trim();
                    if (!field) {
                      update(idx, { showIf: undefined });
                      return;
                    }
                    update(idx, {
                      showIf: { field, equals: q.showIf?.equals ?? true },
                    });
                  }}
                />
              </div>
              <div>
                <label className={lbl}>Valor equals</label>
                <select
                  className={inp}
                  disabled={!q.showIf?.field}
                  value={String(q.showIf?.equals ?? 'true')}
                  onChange={(e) => {
                    if (!q.showIf?.field) return;
                    const equals = e.target.value === 'true';
                    update(idx, { showIf: { field: q.showIf.field, equals } });
                  }}
                >
                  <option value="true">true (Sí)</option>
                  <option value="false">false (No)</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
