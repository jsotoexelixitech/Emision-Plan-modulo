import { useState, useEffect, useRef } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductConfig, getProductId } from '../lib/product';
import { moduleApiBase } from '../lib/app-base';
import {
  Settings2, RotateCcw, Save, CheckCircle2, AlertTriangle,
  Loader2, Plus, Trash2, ArrowLeftRight, Layers, Sparkles, Globe, Lock, Eye, EyeOff,
  ClipboardList,
} from 'lucide-react';
import { AuroraBackground } from '../components/AuroraBackground';
import {
  FuneralHealthQuestionsEditor,
  DEFAULT_HEALTH_QUESTIONS_SEED,
  FALLBACK_FUNERAL_PLAN_OPTIONS,
  type HealthQuestionDraft,
  type PlanOption,
} from './FuneralHealthQuestionsEditor';
import { readConfigPanelContext } from './configPanelContext';

const ALL_PLAN_CODES = ['2', '3', '4', '5', '6', '7', '8', '9'];
const PANEL_CTX = readConfigPanelContext();
const EMPRESA_ID = PANEL_CTX.empresaId;

/**
 * Parametrizador funerario: por ahora solo pestaña Preguntas salud.
 * Poner en false para volver a mostrar Ajustes / Conexión / Mapeador.
 */
const FUNERARIO_SOLO_PREGUNTAS = true;

type Tab = 'general' | 'preguntas' | 'conexion' | 'mapeador';

interface ApiMapEntry {
  internalKey: string;
  externalKey: string;
  transform?: string;
}

const INTERNAL_FIELDS = [
  'plan_code',
  'plan_name',
  'category',
  'mprima',
  'mprimaext',
  'ptasa',
  'tomador_nombre',
  'tomador_apellido',
  'tomador_cedula',
  'tomador_telefono',
  'tomador_email',
  'vehicle_marca',
  'vehicle_modelo',
  'vehicle_placa',
  'vehicle_año',
  'vehicle_color',
  'frecuencia',
];

export function EmisionConfigPanel() {
  const producto = getProductId();
  const { config, loadState, saving, saveError, saveConfig, resetConfig } =
    useProductConfig(EMPRESA_ID, producto, 'emision');

  const soloPreguntas = producto === 'funerario' && FUNERARIO_SOLO_PREGUNTAS;
  const [tab, setTab] = useState<Tab>(soloPreguntas ? 'preguntas' : 'general');
  const [saved, setSaved] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [apiMap, setApiMap] = useState<ApiMapEntry[]>([]);
  const [permitirEstimado, setPermitirEstimado] = useState(true);
  const [inspeccionObligatoria, setInspeccionObligatoria] = useState(false);
  const [diasCarencia, setDiasCarencia] = useState(0);
  const [edadMaxima, setEdadMaxima] = useState(70);
  const [healthQuestions, setHealthQuestions] = useState<HealthQuestionDraft[]>([]);
  /** Preguntas indexadas por canal (metadata.canal del JWT SSO). */
  const [healthByCanal, setHealthByCanal] = useState<Record<string, HealthQuestionDraft[]>>({
    default: [],
  });
  const [activeCanal, setActiveCanal] = useState(PANEL_CTX.canal || 'default');
  const [newCanalName, setNewCanalName] = useState('');
  /** Solo bloquea canal si el enlace trae un canal distinto de default (integrador). */
  const canalLocked = Boolean(PANEL_CTX.canal && PANEL_CTX.canal !== 'default');
  /** Evita que un refetch de config borre ediciones locales no guardadas */
  const healthQuestionsDirty = useRef(false);

  /** Planes reales ramo funerario (personas) para el editor de preguntas. */
  const [funeralPlanOptions, setFuneralPlanOptions] = useState<PlanOption[]>(
    FALLBACK_FUNERAL_PLAN_OPTIONS,
  );
  const [funeralPlansLoading, setFuneralPlansLoading] = useState(false);
  const [funeralPlansError, setFuneralPlansError] = useState(false);

  useEffect(() => {
    if (producto !== 'funerario') return;
    let cancelled = false;
    const cramo = getProductConfig().cramo || 9;
    setFuneralPlansLoading(true);
    setFuneralPlansError(false);

    (async () => {
      try {
        const panelToken =
          new URL(window.location.href).searchParams.get('token')?.trim() || '';
        const headers: Record<string, string> = {};
        if (panelToken) headers.Authorization = `Bearer ${panelToken}`;
        const res = await fetch(
          `${moduleApiBase()}/personas/planes?cramo=${encodeURIComponent(String(cramo))}`,
          { headers },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const raw = Array.isArray(data?.planes) ? data.planes : [];
        const mapped: PlanOption[] = raw
          .map((p: { cplan?: string | number; xplan?: string }) => {
            const code = String(p?.cplan ?? '').trim();
            if (!code) return null;
            const label = String(p?.xplan ?? '').trim() || `Plan ${code}`;
            return { code, label };
          })
          .filter(Boolean) as PlanOption[];
        if (mapped.length > 0) {
          setFuneralPlanOptions(mapped);
          setFuneralPlansError(false);
        } else {
          setFuneralPlanOptions(FALLBACK_FUNERAL_PLAN_OPTIONS);
          setFuneralPlansError(true);
        }
      } catch {
        if (!cancelled) {
          setFuneralPlanOptions(FALLBACK_FUNERAL_PLAN_OPTIONS);
          setFuneralPlansError(true);
        }
      } finally {
        if (!cancelled) setFuneralPlansLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [producto]);

  // ── Conexión API ──────────────────────────────────────────
  const [apiUrl, setApiUrl] = useState('');
  const [apiFormat, setApiFormat] = useState<'json' | 'form' | 'multipart'>('json');
  const [apiMethod, setApiMethod] = useState<'POST' | 'PUT' | 'PATCH'>('POST');
  const [apiAuth, setApiAuth] = useState<'none' | 'bearer' | 'apikey' | 'basic'>('none');
  const [apiToken, setApiToken] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');

  useEffect(() => {
    if (!config) return;
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
    setPermitirEstimado(config.permitirEstimado ?? true);
    setInspeccionObligatoria(config.inspeccionObligatoria ?? false);
    setDiasCarencia(config.diasCarencia ?? 0);
    setEdadMaxima(config.edadMaxima ?? 70);
    if (!healthQuestionsDirty.current && producto === 'funerario') {
      const legacy = config.healthQuestions as HealthQuestionDraft[] | undefined;
      const rawBy = config.healthQuestionsByCanal as
        | Record<string, HealthQuestionDraft[]>
        | undefined;
      const seed = DEFAULT_HEALTH_QUESTIONS_SEED.map((q) => ({ ...q, plans: [...q.plans] }));
      const by: Record<string, HealthQuestionDraft[]> = {};
      if (rawBy && typeof rawBy === 'object' && !Array.isArray(rawBy)) {
        for (const [k, v] of Object.entries(rawBy)) {
          if (Array.isArray(v) && v.length > 0) by[k] = v;
        }
      }
      if (!by.default?.length) {
        by.default = Array.isArray(legacy) && legacy.length > 0 ? legacy : seed;
      }
      setHealthByCanal(by);
      // Preferir canal de la URL/token; si aún no existe en config, se crea al cambiar
      const fromUrl = PANEL_CTX.canal || 'default';
      const canal = by[fromUrl] ? fromUrl : by[activeCanal] ? activeCanal : 'default';
      if (!by[fromUrl] && fromUrl !== 'default') {
        by[fromUrl] = (by.default ?? seed).map((q) => ({
          ...q,
          plans: [...(q.plans || [])],
        }));
        setHealthByCanal({ ...by });
      }
      const useCanal = by[fromUrl] ? fromUrl : canal;
      setActiveCanal(useCanal);
      setHealthQuestions(by[useCanal] ?? by.default ?? seed);
    } else if (!healthQuestionsDirty.current && producto !== 'funerario') {
      setHealthQuestions([]);
    }
    // Conexión
    setApiUrl(config.apiUrl ?? '');
    setApiFormat(config.apiFormat ?? 'json');
    setApiMethod(config.apiMethod ?? 'POST');
    setApiAuth(config.apiAuth ?? 'none');
    setApiToken(config.apiToken ?? '');
    setApiKeyHeader(config.apiKeyHeader ?? 'X-API-Key');
    setApiKeyValue(config.apiKeyValue ?? '');
  }, [config, producto]);

  const addMapEntry = () => { setApiMap(p => [...p, { internalKey: '', externalKey: '', transform: 'none' }]); setSaved(false); };
  const updateMapEntry = (idx: number, field: keyof ApiMapEntry, val: string) => {
    setApiMap(p => p.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    setSaved(false);
  };
  const removeMapEntry = (idx: number) => { setApiMap(p => p.filter((_, i) => i !== idx)); setSaved(false); };

  const cleanQuestions = (list: HealthQuestionDraft[]): HealthQuestionDraft[] =>
    list.map((q) => {
      const plans = (q.plans || []).map(String).filter(Boolean);
      const next: HealthQuestionDraft = {
        ...q,
        plans: plans.length > 0 ? plans : [...ALL_PLAN_CODES],
      };
      if (!next.showIf?.field) delete next.showIf;
      if (next.type === 'select') {
        next.options =
          Array.isArray(next.options) && next.options.length > 0
            ? next.options
            : [
                { value: 'si', label: 'Sí' },
                { value: 'no', label: 'No' },
              ];
      } else {
        delete next.options;
      }
      return next;
    });

  const onHealthQuestionsChange = (next: HealthQuestionDraft[]) => {
    healthQuestionsDirty.current = true;
    setHealthQuestions(next);
    setHealthByCanal((prev) => ({ ...prev, [activeCanal]: next }));
    setSaved(false);
  };

  const switchCanal = (canal: string) => {
    const key = canal.trim() || 'default';
    setHealthByCanal((prev) => {
      const snapshot = { ...prev, [activeCanal]: healthQuestions };
      const nextList =
        snapshot[key] ??
        snapshot.default ??
        DEFAULT_HEALTH_QUESTIONS_SEED.map((q) => ({ ...q, plans: [...q.plans] }));
      setHealthQuestions(nextList);
      return snapshot[key] ? snapshot : { ...snapshot, [key]: nextList };
    });
    setActiveCanal(key);
    healthQuestionsDirty.current = true;
    setSaved(false);
  };

  const addCanal = () => {
    const key = newCanalName.trim();
    if (!key || key === 'default') return;
    if (healthByCanal[key]) {
      switchCanal(key);
      setNewCanalName('');
      return;
    }
    const seed =
      healthByCanal.default?.length
        ? healthByCanal.default.map((q) => ({ ...q, plans: [...(q.plans || [])] }))
        : DEFAULT_HEALTH_QUESTIONS_SEED.map((q) => ({ ...q, plans: [...q.plans] }));
    setHealthByCanal((prev) => ({
      ...prev,
      [activeCanal]: healthQuestions,
      [key]: seed,
    }));
    setHealthQuestions(seed);
    setActiveCanal(key);
    setNewCanalName('');
    healthQuestionsDirty.current = true;
    setSaved(false);
  };

  async function handleSave() {
    let byCanalPayload: Record<string, HealthQuestionDraft[]> | undefined;
    let cleanedQuestions: HealthQuestionDraft[] | undefined;
    if (producto === 'funerario') {
      const canalKey = canalLocked ? (PANEL_CTX.canal || activeCanal) : activeCanal;
      cleanedQuestions = cleanQuestions(healthQuestions);
      if (!cleanedQuestions.length) {
        setSaved(false);
        alert('No hay preguntas de salud para guardar. Agrega al menos una o restaura defaults.');
        return;
      }
      // Solo el canal activo (el de la URL del integrador); Nexus hace merge por clave
      byCanalPayload = { [canalKey]: cleanedQuestions };
      if (canalKey === 'default') {
        byCanalPayload.default = cleanedQuestions;
      }
    }
    // Modo solo-preguntas: no reenviar ajustes/API/mapeador (evita pisar config ajena).
    const ok = await saveConfig(
      soloPreguntas && cleanedQuestions && byCanalPayload
        ? {
            healthQuestionsByCanal: byCanalPayload,
            ...(Object.keys(byCanalPayload).includes('default')
              ? { healthQuestions: byCanalPayload.default }
              : {}),
          }
        : {
            apiMap,
            permitirEstimado,
            inspeccionObligatoria,
            diasCarencia,
            edadMaxima,
            ...(cleanedQuestions && byCanalPayload
              ? {
                  healthQuestionsByCanal: byCanalPayload,
                  ...(Object.keys(byCanalPayload).includes('default')
                    ? { healthQuestions: byCanalPayload.default }
                    : {}),
                }
              : {}),
            apiUrl,
            apiFormat,
            apiMethod,
            apiAuth,
            apiToken,
            apiKeyHeader,
            apiKeyValue,
          },
    );
    if (ok) {
      healthQuestionsDirty.current = false;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white';
  const lbl = 'text-[11px] font-bold text-slate-500 block mb-1.5';

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />

      <div className="pt-[40px] px-4 sm:px-6 lg:px-10 pb-12 w-full max-w-5xl mx-auto relative z-10">
        <header className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black tracking-[0.22em] text-indigo-500 uppercase mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" />
                PARAMETRIZADOR · {producto}
              </p>
              <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                Creación de Póliza
              </h1>
              <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                {soloPreguntas
                  ? 'Define las preguntas de salud del flujo funerario por empresa y canal.'
                  : 'Configura hacia dónde se envían los datos al emitir una póliza, el formato, la autenticación y el mapeado de campos.'}
              </p>
              <div className="mt-3 inline-flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100">
                  empresa: {EMPRESA_ID}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                  canal: {PANEL_CTX.canal}
                </span>
                {PANEL_CTX.cproductor && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    cproductor: {PANEL_CTX.cproductor}
                  </span>
                )}
                {PANEL_CTX.cusuario && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    cusuario: {PANEL_CTX.cusuario}
                  </span>
                )}
                {PANEL_CTX.ctipocanal && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    ctipocanal: {PANEL_CTX.ctipocanal}
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} className="text-white" />
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden animate-fade-in">
          <div className="p-5 sm:p-8">
            {/* Tabs (funerario: solo Preguntas salud por ahora) */}
            {(() => {
              const tabs = (
                soloPreguntas
                  ? ([['preguntas', 'Preguntas salud', ClipboardList]] as const)
                  : ([
                      ['general', 'Ajustes Generales', Layers],
                      ...(producto === 'funerario'
                        ? [['preguntas', 'Preguntas salud', ClipboardList] as const]
                        : []),
                      ['conexion', 'Conexión API', Globe],
                      ['mapeador', 'Mapeador de Campos', ArrowLeftRight],
                    ] as const)
              );
              if (tabs.length <= 1) return null;
              return (
                <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
                  {tabs.map(([t, label, Icon]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t as Tab)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                      <Icon size={15} />{label}
                    </button>
                  ))}
                </div>
              );
            })()}

            {loadState === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
                <Loader2 size={20} className="animate-spin" /><span className="text-sm">Cargando configuración...</span>
              </div>
            )}

            {loadState === 'error' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 mb-4">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-amber-700 text-sm font-medium">No se pudo cargar la configuración. Se usan los valores por defecto.</p>
              </div>
            )}

            {loadState !== 'loading' && (
              <>
                {/* ── TAB GENERAL ── */}
                {tab === 'general' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Opciones de Emisión</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                      {producto === 'rcv' && (
                        <>
                          <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={permitirEstimado} onChange={e => { setPermitirEstimado(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                            <div>
                              <span className="text-sm text-slate-800 font-bold block mb-1">Permitir cotizaciones estimadas</span>
                              <span className="text-xs text-slate-500">Si la aseguradora no responde o el vehículo está incompleto, permite mostrar una prima referencial (Fallback).</span>
                            </div>
                          </label>
                          <hr className="border-slate-100" />
                          <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={inspeccionObligatoria} onChange={e => { setInspeccionObligatoria(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                            <div>
                              <span className="text-sm text-slate-800 font-bold block mb-1">Inspección Obligatoria</span>
                              <span className="text-xs text-slate-500">Exigir paso por el módulo de inspección si el riesgo lo amerita.</span>
                            </div>
                          </label>
                        </>
                      )}

                      {producto === 'funerario' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-2">
                          <div>
                            <label className={lbl}>Días de Carencia</label>
                            <input type="number" min={0} className={inp} value={diasCarencia} onChange={e => { setDiasCarencia(Number(e.target.value)); setSaved(false); }} />
                            <span className="text-[10px] text-slate-500 block mt-1">Días de espera antes de que el plan sea utilizable.</span>
                          </div>
                          <div>
                            <label className={lbl}>Edad Máxima de Ingreso</label>
                            <input type="number" min={0} max={100} className={inp} value={edadMaxima} onChange={e => { setEdadMaxima(Number(e.target.value)); setSaved(false); }} />
                            <span className="text-[10px] text-slate-500 block mt-1">Límite de edad del titular para adquirir la póliza.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB PREGUNTAS (funerario) ── */}
                {tab === 'preguntas' && producto === 'funerario' && (
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Canal
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {canalLocked
                            ? 'Fijo por el enlace del integrador'
                            : 'default = si el SSO no envía canal'}
                        </p>
                      </div>
                      {canalLocked ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold">
                            {activeCanal}
                            <span className="text-slate-300 font-normal">
                              {(healthByCanal[activeCanal] || healthQuestions).length} preg.
                            </span>
                          </span>
                          {PANEL_CTX.cproductor && (
                            <span className="text-[11px] text-slate-500">
                              cproductor {PANEL_CTX.cproductor}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {Object.keys(healthByCanal)
                            .sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)))
                            .map((k) => {
                              const active = activeCanal === k;
                              const count = (healthByCanal[k] || []).length;
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => switchCanal(k)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                    active
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {k === 'default' ? 'default' : k}
                                  <span className={active ? 'text-slate-300 font-normal' : 'text-slate-400 font-normal'}>
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          <div className="inline-flex items-center gap-1.5 pl-1">
                            <input
                              className="w-[7.5rem] text-xs border-0 border-b border-slate-200 rounded-none px-1 py-1 outline-none focus:border-slate-400 bg-transparent placeholder:text-slate-300"
                              value={newCanalName}
                              onChange={(e) => setNewCanalName(e.target.value)}
                              placeholder="Nuevo canal…"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addCanal();
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={addCanal}
                              disabled={!newCanalName.trim()}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-30 disabled:hover:text-indigo-600"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <FuneralHealthQuestionsEditor
                      questions={healthQuestions}
                      onChange={onHealthQuestionsChange}
                      planOptions={funeralPlanOptions}
                      plansLoading={funeralPlansLoading}
                      plansError={funeralPlansError}
                    />
                  </div>
                )}

                {/* ── TAB CONEXIÓN API ── */}
                {tab === 'conexion' && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 flex items-start gap-3">
                      <Globe size={18} className="text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-indigo-700 leading-relaxed">
                        Configura el endpoint donde se enviarán los datos del tomador y vehículo al momento de emitir la póliza. Si el campo URL está vacío, se usa el endpoint interno por defecto.
                      </p>
                    </div>

                    {/* URL y método */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Destino</p>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                        <div>
                          <label className={lbl}>URL del endpoint de creación de póliza</label>
                          <input
                            className={inp}
                            type="url"
                            placeholder="https://api.aseguradora.com/v1/polizas"
                            value={apiUrl}
                            onChange={e => { setApiUrl(e.target.value); setSaved(false); }}
                          />
                          <span className="text-[10px] text-slate-500 block mt-1">Deja vacío para usar el endpoint interno configurado en el servidor.</span>
                        </div>
                        <div>
                          <label className={lbl}>Método HTTP</label>
                          <select className={inp} value={apiMethod} onChange={e => { setApiMethod(e.target.value as any); setSaved(false); }}>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={lbl}>Formato de envío</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {([
                            ['json', 'JSON', 'application/json — El más común'],
                            ['form', 'Form URL-Encoded', 'application/x-www-form-urlencoded'],
                            ['multipart', 'Multipart', 'Para enviar archivos adjuntos'],
                          ] as const).map(([val, title, desc]) => (
                            <label key={val} className={`flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-all ${apiFormat === val ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-400/20' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                              <div className="flex items-center gap-2">
                                <input type="radio" name="apiFormat" value={val} checked={apiFormat === val} onChange={() => { setApiFormat(val); setSaved(false); }} className="text-indigo-600" />
                                <span className="font-bold text-sm text-slate-800">{title}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 ml-5">{desc}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Autenticación */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Lock size={12} /> Autenticación
                      </p>
                      <div>
                        <label className={lbl}>Tipo de autenticación</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {([
                            ['none', 'Sin auth'],
                            ['bearer', 'Bearer Token'],
                            ['apikey', 'API Key Header'],
                            ['basic', 'Basic Auth'],
                          ] as const).map(([val, title]) => (
                            <label key={val} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${apiAuth === val ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-400/20' : 'border-slate-200 hover:border-indigo-200'}`}>
                              <input type="radio" name="apiAuth" value={val} checked={apiAuth === val} onChange={() => { setApiAuth(val); setSaved(false); }} className="text-indigo-600" />
                              <span className="font-bold text-xs text-slate-700">{title}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Campos condicionales según auth */}
                      {apiAuth === 'bearer' && (
                        <div className="animate-fade-in">
                          <label className={lbl}>Bearer Token</label>
                          <div className="relative">
                            <input
                              className={`${inp} pr-10`}
                              type={showToken ? 'text' : 'password'}
                              placeholder="eyJhbGci..."
                              value={apiToken}
                              onChange={e => { setApiToken(e.target.value); setSaved(false); }}
                            />
                            <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                              {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                      )}

                      {apiAuth === 'apikey' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                          <div>
                            <label className={lbl}>Nombre del header</label>
                            <input className={inp} placeholder="X-API-Key" value={apiKeyHeader} onChange={e => { setApiKeyHeader(e.target.value); setSaved(false); }} />
                          </div>
                          <div>
                            <label className={lbl}>Valor del header</label>
                            <div className="relative">
                              <input
                                className={`${inp} pr-10`}
                                type={showToken ? 'text' : 'password'}
                                placeholder="••••••••••"
                                value={apiKeyValue}
                                onChange={e => { setApiKeyValue(e.target.value); setSaved(false); }}
                              />
                              <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {apiAuth === 'basic' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                          <div>
                            <label className={lbl}>Usuario</label>
                            <input className={inp} placeholder="usuario" value={apiKeyHeader} onChange={e => { setApiKeyHeader(e.target.value); setSaved(false); }} />
                          </div>
                          <div>
                            <label className={lbl}>Contraseña</label>
                            <div className="relative">
                              <input
                                className={`${inp} pr-10`}
                                type={showToken ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={apiKeyValue}
                                onChange={e => { setApiKeyValue(e.target.value); setSaved(false); }}
                              />
                              <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB MAPEADOR ── */}
                {tab === 'mapeador' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mapeador de campos</p>
                        <p className="text-xs text-slate-500 mt-1">Traduce los campos internos al formato que espera la API destino.</p>
                      </div>
                      <button onClick={addMapEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        <Plus size={14} /> Nueva regla
                      </button>
                    </div>

                    {apiMap.length === 0 && (
                      <div className="text-center py-12 text-slate-500 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        No hay mapeos. Los campos se enviarán con su nombre interno.<br />
                        <span className="text-xs">Agrega reglas para traducir los campos al formato de la aseguradora.</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {apiMap.map((entry, idx) => (
                        <div key={idx} className="rounded-2xl border border-indigo-100 bg-white/50 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-4 items-end shadow-sm hover:shadow-md hover:bg-white transition-all group">
                          <div>
                            <label className={lbl}>Campo interno</label>
                            <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-mono outline-none focus:border-indigo-400" value={entry.internalKey} onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)}>
                              <option value="">— Seleccionar —</option>
                              {INTERNAL_FIELDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Campo destino (API)</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: xplan" value={entry.externalKey} onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className={lbl}>Transformación</label>
                            <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-indigo-400" value={entry.transform ?? 'none'} onChange={e => updateMapEntry(idx, 'transform', e.target.value)}>
                              <option value="none">Ninguna</option>
                              <option value="uppercase">MAYÚSCULAS</option>
                              <option value="lowercase">minúsculas</option>
                              <option value="number">A Número</option>
                              <option value="date_ddmmyyyy">Fecha DD/MM/YYYY</option>
                              <option value="date_yyyymmdd">Fecha YYYY-MM-DD</option>
                              <option value="strip_prefix">Quitar prefijo (V-)</option>
                              <option value="json_string">Objeto como JSON string</option>
                            </select>
                          </div>
                          <button onClick={() => removeMapEntry(idx)} className="p-2.5 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 self-end">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {loadState !== 'loading' && (
            <div className="px-5 sm:px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              {saveError && (
                <div className="w-full sm:w-auto flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">
                  <AlertTriangle size={14} />{saveError}
                </div>
              )}
              <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                <button onClick={() => { if (confirm('¿Restaurar configuración original?')) { healthQuestionsDirty.current = false; resetConfig(); } }} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm">
                  <RotateCcw size={15} /> Restaurar defaults
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-8 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle2 size={16} /> ¡Guardado!</> : <><Save size={16} /> Guardar cambios</>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
