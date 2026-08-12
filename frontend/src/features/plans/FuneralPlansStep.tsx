import { useEffect, useRef, useState } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import {
  Check, Star, Shield, ChevronDown, ShieldCheck,
  Loader2, AlertTriangle, Users, CalendarClock
} from 'lucide-react';
import type { Plan } from '../../types';
import { personasApi, type PlanPer, getFrecuenciasByPlan, type CatalogItem } from '../../lib/api';
import { getProductConfig } from '../../lib/product';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { toast } from '../../store/toastStore';

/** Convierte un PlanPer de la API al tipo Plan del wizard. */
function apiPlanToWizardPlan(p: PlanPer): Plan {
  return {
    cplan: p.cplan,
    name: (p.xplan ?? '').trim() || p.cplan,
    price: 'Tarifa La Mundial',
    priceNum: 0,
    tag: 'Funerario',
    desc: 'Cobertura de servicios funerarios para las personas aseguradas.',
    benefits: [
      'Servicio funerario completo',
      'Cobertura para el grupo familiar asegurado',
      'Asistencia y traslado',
    ],
    sumaAsegurada: 0,
  };
}

export function FuneralPlansStep() {
  const {
    funeral, selectedPlan, setSelectedPlan, setCategory,
    quote, quoteState,
  } = useWizardStore();

  const product = getProductConfig();

  const [apiPlans, setApiPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState(false);

  const [apiFrecuencias, setApiFrecuencias] = useState<CatalogItem[]>([]);
  const [frecLoading, setFrecLoading] = useState(false);
  const setFuneral = useWizardStore((s) => s.setFuneral);

  // ── Carga de planes de personas (ramo 9) ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPlansLoading(true);
    setPlansError(false);

    personasApi.planes(product.cramo)
      .then((res) => {
        if (cancelled) return;
        const mapped = (res.data.planes ?? []).map(apiPlanToWizardPlan);
        setApiPlans(mapped);
        setSelectedPlan(null);
      })
      .catch(() => {
        if (cancelled) return;
        setPlansError(true);
        setApiPlans([]);
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carga de frecuencias ──────────────────────────────────────────────────
  useEffect(() => {
    const planCode = selectedPlan?.cplan;
    if (!planCode) {
      setApiFrecuencias([]);
      return;
    }

    let cancelled = false;
    setFrecLoading(true);
    getFrecuenciasByPlan(planCode, product.cramo)
      .then((items) => {
        if (!cancelled) {
          setApiFrecuencias(items);
          // Si la frecuencia actual no es válida, seleccionar la primera por defecto
          const currentValid = items.find((i) => String(i.code) === funeral.frecuencia);
          if (!currentValid && items.length > 0) {
            setFuneral({ frecuencia: String(items[0].code) });
          }
        }
      })
      .catch((err) => console.error('Error cargando frecuencias', err))
      .finally(() => {
        if (!cancelled) setFrecLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedPlan?.cplan, product.cramo, setFuneral, funeral.frecuencia]);

  // ── Cotización contra getCotizacionPer ─────────────────────────────────────
  const aseguradosListos = funeral.asegurados.filter(
    (a) => (a.identificacion || '').toString().trim() && (a.fechaNac || '').toString().trim(),
  );
  const planCode = selectedPlan?.cplan ?? '';
  const quoteSig = planCode
    ? `funeral|${planCode}|${funeral.frecuencia}|${aseguradosListos
        .map((a) => `${a.parentesco}:${a.identificacion}:${a.fechaNac}`)
        .join(',')}`
    : '';

  const activeSigRef = useRef('');

  useEffect(() => {
    if (!quoteSig || !planCode || aseguradosListos.length === 0) return;

    const snap = useWizardStore.getState();
    if (snap.quoteVehicleSignature === quoteSig) return;

    activeSigRef.current = quoteSig;
    snap.setQuoteState('loading');

    personasApi.cotizar({
      cplan: planCode,
      cramo: product.cramo,
      ifrecuencia: funeral.frecuencia,
      asegurados: aseguradosListos.map((a) => ({
        parentesco: a.parentesco,
        identificacion: a.identificacion,
        fechaNac: a.fechaNac,
      })),
    })
      .then((r) => {
        if (activeSigRef.current !== quoteSig) return;
        useWizardStore.getState().setQuote(
          { mprima: r.data.mprima, mprimaext: r.data.mprimaext, ptasa: r.data.ptasa },
          quoteSig,
        );
      })
      .catch((err: unknown) => {
        if (activeSigRef.current !== quoteSig) return;
        const message = (err as { message?: string })?.message ?? 'No pudimos obtener la tarifa.';
        useWizardStore.getState().setQuoteState('error', message);
        toast.warning('Cotización no disponible', 'Reintenta en unos segundos.', 5000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSig]);

  const isLoadingQuote = quoteState === 'loading';
  const hasRealQuote = quoteState === 'ready' && Boolean(quote);
  const annualUsd = hasRealQuote ? quote!.mprimaext : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap -mt-2">
        <p className="text-slate-500 text-sm leading-relaxed max-w-md">
          Selecciona el plan funerario que mejor se ajuste a tu grupo familiar.
        </p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-700">
          <Users size={11} />
          {aseguradosListos.length} asegurado{aseguradosListos.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Selectores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Selector de plan */}
        <div>
          <label className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-2 inline-flex items-center gap-1.5">
            <Star size={11} className="text-violet-500" />
            Plan funerario
          </label>
          <div className="relative group">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center pointer-events-none transition-all ${
              selectedPlan
                ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_4px_14px_rgba(46,109,191,0.3)]'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {plansLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={2.5} />}
            </div>
            <select
              value={selectedPlan?.cplan ?? ''}
              onChange={(e) => {
                const found = apiPlans.find((p) => p.cplan === e.target.value);
                if (found) setCategory(found.name);
                setSelectedPlan(found ?? null);
                // Nuevo plan → exigir cuestionario de salud de nuevo
                if (found) {
                  setFuneral({
                    healthQuestionnaireDone: false,
                    healthAnswers: {},
                    diagnosticoEnfermedad: false,
                    descripcionEnfermedad: '',
                    aceptaTerminos: false,
                  });
                }
              }}
              disabled={plansLoading || apiPlans.length === 0}
              className="w-full pl-14 pr-10 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-900 appearance-none cursor-pointer hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {plansLoading ? (
                <option value="">Cargando planes...</option>
              ) : plansError ? (
                <option value="">Error al cargar planes</option>
              ) : apiPlans.length === 0 ? (
                <option value="">Sin planes disponibles</option>
              ) : (
                <>
                  <option value="" disabled>— Elige un plan —</option>
                  {apiPlans.map((p) => (
                    <option key={p.cplan} value={p.cplan ?? ''}>{p.name}</option>
                  ))}
                </>
              )}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Selector de frecuencia */}
        <div>
          <label className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-2 inline-flex items-center gap-1.5">
            <CalendarClock size={11} className="text-emerald-500" />
            Frecuencia de pago
          </label>
          <div className="relative group">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center pointer-events-none transition-all ${
              funeral.frecuencia
                ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {frecLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={15} strokeWidth={2.5} />}
            </div>
            <select
              value={funeral.frecuencia ?? ''}
              onChange={(e) => setFuneral({ frecuencia: e.target.value })}
              disabled={frecLoading || apiFrecuencias.length === 0 || !selectedPlan}
              className="w-full pl-14 pr-10 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-900 appearance-none cursor-pointer hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {frecLoading ? (
                <option value="">Cargando...</option>
              ) : !selectedPlan ? (
                <option value="">Selecciona un plan primero</option>
              ) : apiFrecuencias.length === 0 ? (
                <option value="">Sin frecuencias</option>
              ) : (
                apiFrecuencias.map((f) => (
                  <option key={f.code} value={String(f.code)}>{f.label}</option>
                ))
              )}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Detalle del plan + prima */}
      {selectedPlan ? (
        <article className="relative rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-50/90 via-violet-50/40 to-white p-4 sm:p-6 shadow-[0_24px_48px_-12px_rgba(15,26,90,0.22)] animate-spring-in overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-fuchsia-500/12 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
              <div className="min-w-0 flex-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-white text-slate-500 text-[0.62rem] font-bold mb-2 uppercase tracking-wider border border-slate-200">
                  {selectedPlan.tag}
                </span>
                <h3 className="font-display font-black text-slate-900 text-xl sm:text-2xl leading-tight break-words">{selectedPlan.name}</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-md">{selectedPlan.desc}</p>
                {quoteState === 'error' && (
                  <span className="mt-3 inline-flex items-center gap-1 text-[0.6rem] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-md border border-rose-200 uppercase tracking-wider">
                    <AlertTriangle size={11} strokeWidth={2.4} />
                    Cotización pendiente
                  </span>
                )}
              </div>

              <div className="w-full sm:w-auto sm:shrink-0 text-left sm:text-right">
                <div className="flex items-end gap-1 sm:justify-end">
                  <span className="text-base sm:text-[1.2rem] font-display font-black text-slate-500 leading-none pb-1 sm:pb-2">$</span>
                  {isLoadingQuote && !hasRealQuote ? (
                    <span className="text-4xl sm:text-5xl font-display font-black gradient-text-indigo leading-none inline-flex items-center gap-2">
                      <Loader2 size={28} className="animate-spin opacity-70" />
                      <span className="opacity-50">---</span>
                    </span>
                  ) : (
                    <span className="text-4xl sm:text-5xl font-display font-black gradient-text-indigo leading-none tabular-nums">
                      <AnimatedCounter value={annualUsd} duration={500} decimals={hasRealQuote ? 2 : 0} />
                    </span>
                  )}
                </div>
                <p className="text-[0.7rem] text-slate-500 font-semibold mt-1 uppercase">/ año</p>
                {hasRealQuote && quote && quote.mprima > 0 && (
                  <p className="text-[0.65rem] font-bold text-indigo-700/80 mt-1.5 tabular-nums">
                    ≈ Bs {quote.mprima.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            <div className="divider-soft mb-5" />

            <p className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
              <Shield size={11} className="text-indigo-500" />
              Cobertura incluida
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
              {selectedPlan.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-white grid place-items-center flex-shrink-0 mt-0.5 shadow-[0_2px_8px_rgba(16,185,129,0.3)]">
                    <Check size={9} strokeWidth={3.5} />
                  </span>
                  <span className="leading-relaxed font-medium">{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 pt-4 border-t border-indigo-100/80 flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold text-indigo-600">
                <ShieldCheck size={11} />
                Plan seleccionado
              </div>
            </div>
          </div>
        </article>
      ) : (
        <div className="text-center py-14 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50/70 to-white">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 grid place-items-center mx-auto mb-3 shadow-sm">
            <Shield size={22} className="text-slate-500" />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {plansLoading ? 'Cargando planes disponibles...' : 'Elige un plan en el selector para ver la cotización.'}
          </p>
        </div>
      )}
    </div>
  );
}
