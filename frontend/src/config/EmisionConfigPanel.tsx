import { useState, useEffect } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, RotateCcw, Save, CheckCircle2, AlertTriangle,
  Loader2, Plus, Trash2, ArrowLeftRight, Layers, Sparkles
} from 'lucide-react';
import { AuroraBackground } from '../components/AuroraBackground';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

type Tab = 'general' | 'mapeador';

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
];

export function EmisionConfigPanel() {
  const producto = getProductId();
  const { config, loadState, saving, saveError, saveConfig, resetConfig } =
    useProductConfig(EMPRESA_ID, producto, 'emision');

  const [tab, setTab] = useState<Tab>('general');
  const [saved, setSaved] = useState(false);
  
  const [apiMap, setApiMap] = useState<ApiMapEntry[]>([]);
  const [permitirEstimado, setPermitirEstimado] = useState(true);
  const [inspeccionObligatoria, setInspeccionObligatoria] = useState(false);
  const [diasCarencia, setDiasCarencia] = useState(0);
  const [edadMaxima, setEdadMaxima] = useState(70);

  useEffect(() => {
    if (!config) return;
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
    setPermitirEstimado(config.permitirEstimado ?? true);
    setInspeccionObligatoria(config.inspeccionObligatoria ?? false);
    setDiasCarencia(config.diasCarencia ?? 0);
    setEdadMaxima(config.edadMaxima ?? 70);
  }, [config]);

  const addMapEntry = () => {
    setApiMap(prev => [...prev, { internalKey: '', externalKey: '', transform: 'none' }]);
    setSaved(false);
  };

  const updateMapEntry = (idx: number, field: keyof ApiMapEntry, val: string) => {
    setApiMap(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    setSaved(false);
  };

  const removeMapEntry = (idx: number) => {
    setApiMap(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  };

  async function handleSave() {
    await saveConfig({ apiMap, permitirEstimado, inspeccionObligatoria, diasCarencia, edadMaxima });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />

      <div className="pt-[40px] px-6 lg:px-10 pb-12 max-w-4xl mx-auto relative z-10">
        <header className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black tracking-[0.22em] text-indigo-500 uppercase mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" />
                PARAMETRIZADOR · {producto}
              </p>
              <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                Módulo Emisión
              </h1>
              <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                Configura parámetros generales de cotización y mapeo de planes.
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} className="text-white" />
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden animate-fade-in">
          <div className="p-6 sm:p-8 lg:p-10">
            {/* Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50 backdrop-blur-sm">
              {([['general', 'Ajustes Generales', Layers], ['mapeador', 'Mapeador API', ArrowLeftRight]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t as Tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            {loadState === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
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
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Días de Carencia</label>
                            <input type="number" min={0} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 font-semibold" value={diasCarencia} onChange={e => { setDiasCarencia(Number(e.target.value)); setSaved(false); }} />
                            <span className="text-[10px] text-slate-400 block mt-1">Días de espera antes de que el plan sea utilizable.</span>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Edad Máxima de Ingreso</label>
                            <input type="number" min={0} max={100} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 font-semibold" value={edadMaxima} onChange={e => { setEdadMaxima(Number(e.target.value)); setSaved(false); }} />
                            <span className="text-[10px] text-slate-400 block mt-1">Límite de edad del titular para adquirir la póliza.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB MAPEADOR ── */}
                {tab === 'mapeador' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mapeador de campos API</p>
                        <p className="text-xs text-slate-400 mt-1">Traduce los campos del plan al formato de la API destino.</p>
                      </div>
                      <button onClick={addMapEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        <Plus size={14} /> Nueva regla
                      </button>
                    </div>

                    {apiMap.length === 0 && (
                      <div className="text-center py-12 text-slate-400 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        No hay mapeos. Los campos se enviarán con el nombre interno.
                      </div>
                    )}

                    <div className="space-y-3">
                      {apiMap.map((entry, idx) => (
                        <div key={idx} className="rounded-2xl border border-indigo-100 bg-white/50 backdrop-blur-sm p-5 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-5 items-end shadow-sm hover:shadow-md hover:bg-white transition-all group">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo origen</label>
                            <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-mono outline-none focus:border-indigo-400" value={entry.internalKey} onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)}>
                              <option value="">— Seleccionar —</option>
                              {INTERNAL_FIELDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo destino (API)</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: xplan" value={entry.externalKey} onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Transformación</label>
                            <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-indigo-400" value={entry.transform ?? 'none'} onChange={e => updateMapEntry(idx, 'transform', e.target.value)}>
                              <option value="none">Ninguna</option>
                              <option value="uppercase">MAYÚSCULAS</option>
                              <option value="lowercase">minúsculas</option>
                              <option value="number">A Número</option>
                            </select>
                          </div>
                          <button onClick={() => removeMapEntry(idx)} className="p-2.5 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
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
            <div className="px-6 sm:px-8 lg:px-10 py-5 bg-slate-50/80 border-t border-slate-100 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              {saveError && (
                <div className="w-full sm:w-auto flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">
                  <AlertTriangle size={14} />{saveError}
                </div>
              )}
              <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                <button onClick={() => { if (confirm('¿Restaurar originales?')) resetConfig(); }} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm">
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
