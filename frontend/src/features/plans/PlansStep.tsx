import { useEffect, useRef, useState } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import {
  Check, Star, Shield, ChevronDown, ShieldCheck,
  Loader2, AlertTriangle, BadgeCheck, CalendarClock,
} from 'lucide-react';
import type { Plan } from '../../types';
import { type PlanRcv, catalogoApi, quotePolicy, getFrecuenciasByPlan, type CatalogItem } from '../../lib/api';
import { getProductConfig } from '../../lib/product';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { vehicleSignature, vesAnnual } from '../../lib/money';
import { resolveFrecuenciaAmounts } from '../../lib/frecuencia';
import { toast } from '../../store/toastStore';

/** Beneficios estándar RCV conforme a la Ley — aplica a todos los planes */
const RCV_BENEFITS = [
  'Daños materiales a terceros',
  'Daños corporales a terceros',
  'Gastos de defensa jurídica',
  'Asistencia en el lugar del accidente',
];

/** Convierte un PlanRcv de la API al tipo Plan del wizard */
function apiPlanToWizardPlan(p: PlanRcv, categoryLabel: string): Plan {
  return {
    cplan:     p.cplan,
    name:      ((p.xplan_c ?? '').trim() || (p.xplan ?? '').trim() || p.cplan),
    price:     'Tarifa La Mundial',
    priceNum:  0,
    tag:       categoryLabel,
    desc:      ((p.xplan ?? '').trim() || 'Cobertura de Responsabilidad Civil Vehicular conforme a la Ley.'),
    benefits:  RCV_BENEFITS,
    sumaAsegurada: 0,
    cproducto: p.cproducto,
    coberturasAdicionales: p.coberturasAdicionales,
  };
}

export function PlansStep() {
  const {
    setCategory, selectedPlan, setSelectedPlan,
    vehicle, quote, quoteState, rcv, setRcv,
  } = useWizardStore();

  const product = getProductConfig();

  // ── Planes reales desde backend-api-sys vía modulo-emision server ─────────
  const [apiPlans, setApiPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState(false);
  const [apiFrecuencias, setApiFrecuencias] = useState<CatalogItem[]>([]);
  const [frecLoading, setFrecLoading] = useState(false);
  /** Fallback si xcober no viene en catálogo pero calculate-plan habilita CA/PT/PP */
  const [quoteCoverageOptions, setQuoteCoverageOptions] = useState<
    { value: string; text: string }[]
  >([]);

  const categoryLabel =
    (vehicle.xcategoria_uso?.trim() || vehicle.uso || 'RCV');

  // Carga planes cuando el vehículo está cargado. Patrón de cancelación estándar:
  // evita double-fetch en React StrictMode y descarta respuestas obsoletas.
  useEffect(() => {
    if (!vehicle.cmarca || !vehicle.cmodelo || !vehicle.cversion) return;
    let cancelled = false;

    setPlansLoading(true);
    setPlansError(false);

    const ctipo = (vehicle as any).ctipo as number | undefined;
    catalogoApi.planesRcv(ctipo)
      .then((res) => {
        if (cancelled) return;
        const label = vehicle.xcategoria_uso?.trim() || vehicle.uso || 'RCV';
        const mapped = (res.data.planes ?? []).map((p) => apiPlanToWizardPlan(p, label));
        setApiPlans(mapped);
        if (mapped.length > 0) setCategory(label);
        // No auto-seleccionamos: el usuario elige el plan explícitamente.
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
  }, [vehicle.ctipo as any, vehicle.cversion, vehicle.cmarca]);

  // ── Frecuencias por plan (spBuscaFrecuenciaPlan) ─────────────────────────
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
        if (cancelled) return;
        setApiFrecuencias(items);
        const current = items.find((i) => String(i.code) === rcv.frecuencia);
        if (!current && items.length > 0) {
          setRcv({
            frecuencia: String(items[0].code),
            ndias: items[0].ndias ?? null,
          });
        } else if (current) {
          setRcv({ ndias: current.ndias ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setApiFrecuencias([]);
      })
      .finally(() => {
        if (!cancelled) setFrecLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedPlan?.cplan, product.cramo, setRcv, rcv.frecuencia]);

  // ── Cotización automática contra La Mundial ───────────────────────────────
  const hasVehicleData =
    Boolean(vehicle.marca?.trim()) &&
    Boolean(vehicle.modelo?.trim()) &&
    Boolean(vehicle.año?.trim());

  const sig = hasVehicleData ? vehicleSignature(vehicle) : '';
  const planCode = selectedPlan?.cplan ?? '';
  const coberAdicional = rcv.coberAdicional ?? 'RC';
  const quoteSig = sig && planCode
    ? `${sig}|${planCode}|${coberAdicional}|${rcv.frecuencia ?? 'A'}`
    : '';

  // Ref para rastrear el sig activo y descartar respuestas obsoletas.
  const activeQuoteSigRef = useRef('');

  useEffect(() => {
    if (!quoteSig || !planCode) return;

    const snap = useWizardStore.getState();
    if (snap.quoteVehicleSignature === quoteSig) return;

    activeQuoteSigRef.current = quoteSig;
    snap.setQuoteState('loading');

    quotePolicy({
      state: { vehicle, rcv, selectedPlan },
      plan: planCode,
    })
      .then((r) => {
        if (activeQuoteSigRef.current !== quoteSig) return;

        const meta = r.metadata as
          | { vehicleLabel?: string; vehicleFallback?: boolean }
          | undefined;
        useWizardStore.getState().setQuote(
          {
            mprima: r.mprima,
            mprimaext: r.mprimaext,
            ptasa: r.ptasa,
            coberturas: r.coberturas,
            vehicleLabel: meta?.vehicleLabel,
            vehicleFallback: meta?.vehicleFallback,
          },
          quoteSig,
        );

        const metaFull = r.metadata as {
          tasas?: { tasaCA?: number; tasaPT?: number; tasaPP?: number };
          coverageOptions?: { value: string; text: string }[];
        } | undefined;
        if (metaFull?.tasas && (metaFull.tasas.tasaCA != null || metaFull.tasas.tasaPT != null || metaFull.tasas.tasaPP != null)) {
          useWizardStore.getState().setRcv({
            tasaCA: metaFull.tasas.tasaCA,
            tasaPT: metaFull.tasas.tasaPT,
            tasaPP: metaFull.tasas.tasaPP,
          });
        }
        if (Array.isArray(metaFull?.coverageOptions) && metaFull.coverageOptions.length > 0) {
          setQuoteCoverageOptions(metaFull.coverageOptions);
        }
      })
      .catch((err) => {
        if (activeQuoteSigRef.current !== quoteSig) return;

        const message =
          (err as { message?: string })?.message ?? 'No pudimos obtener la tarifa.';
        useWizardStore.getState().setQuoteState('error', message);
        toast.warning(
          'Cotización no disponible',
          'Mostramos una tarifa estimada. Reintenta más tarde para obtener la real.',
          5000,
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSig]);

  const coberturasAdicionales =
    (selectedPlan?.coberturasAdicionales?.length
      ? selectedPlan.coberturasAdicionales
      : quoteCoverageOptions);
  const coberSeleccionada = rcv.coberAdicional ?? 'RC';
  const isLoadingQuote = quoteState === 'loading';
  const hasRealQuote   = quoteState === 'ready' && Boolean(quote);

  const frecuenciaLabel =
    apiFrecuencias.find((f) => String(f.code) === rcv.frecuencia)?.label
    ?? 'Anual';
  const annualUsd = hasRealQuote ? quote!.mprimaext : 0;
  const displayPrice = annualUsd;
  const freqAmounts = resolveFrecuenciaAmounts(hasRealQuote ? quote : null, rcv.frecuencia, {
    quoteBasis: 'annual-total',
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap -mt-2">
        <p className="text-slate-500 text-sm leading-relaxed max-w-md">
          Selecciona el plan que mejor se ajuste a tu vehículo.
        </p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-700">
          <Shield size={11} />
          {frecuenciaLabel}
        </span>
      </div>

      {/* Selectores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Categoría de uso — read-only, proviene del vehículo seleccionado */}
        <div>
          <label className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-2 inline-flex items-center gap-1.5">
            <Shield size={11} className="text-indigo-500" />
            Categoría de uso
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center text-white shadow-[0_4px_14px_rgba(15,26,90,0.3)] pointer-events-none">
              <Shield size={15} strokeWidth={2.2} />
            </div>
            <div className="w-full pl-14 pr-4 py-3.5 rounded-xl border-2 border-indigo-200 bg-indigo-50/60 text-sm font-bold text-slate-900 select-none">
              {categoryLabel}
            </div>
          </div>
        </div>

        {/* Plan de cobertura — datos reales desde la API */}
        <div>
          <label className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-2 inline-flex items-center gap-1.5">
            <Star size={11} className="text-violet-500" />
            Plan de cobertura
          </label>
          <div className="relative group">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center pointer-events-none transition-all ${
              selectedPlan
                ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_4px_14px_rgba(46,109,191,0.3)]'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {plansLoading
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={15} strokeWidth={2.5} />}
            </div>
            <select
              value={selectedPlan?.cplan ?? ''}
              onChange={(e) => {
                const found = apiPlans.find((p) => p.cplan === e.target.value);
                setSelectedPlan(found ?? null);
                setRcv({ coberAdicional: 'RC' });
                setQuoteCoverageOptions([]);
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
                    <option key={p.cplan} value={p.cplan ?? ''}>
                      {p.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Frecuencia de pago */}
        <div>
          <label className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-2 inline-flex items-center gap-1.5">
            <CalendarClock size={11} className="text-emerald-500" />
            Frecuencia de pago
          </label>
          <div className="relative group">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center pointer-events-none transition-all ${
              rcv.frecuencia
                ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {frecLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={15} strokeWidth={2.5} />}
            </div>
            <select
              value={rcv.frecuencia ?? ''}
              onChange={(e) => {
                const code = e.target.value;
                const item = apiFrecuencias.find((f) => String(f.code) === code);
                setRcv({
                  frecuencia: code,
                  ndias: item?.ndias ?? null,
                });
              }}
              disabled={frecLoading || apiFrecuencias.length === 0 || !selectedPlan}
              className="w-full pl-14 pr-10 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-900 appearance-none cursor-pointer hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {frecLoading ? (
                <option value="">Cargando...</option>
              ) : !selectedPlan ? (
                <option value="">Selecciona un plan primero</option>
              ) : apiFrecuencias.length === 0 ? (
                <option value="A">Anual</option>
              ) : (
                apiFrecuencias.map((f) => (
                  <option key={String(f.code)} value={String(f.code)}>{f.label}</option>
                ))
              )}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {selectedPlan && coberturasAdicionales.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <p className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-3">
            Incluir cobertura adicional
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Pulsa una opción para añadirla a la póliza (como &quot;Incluir&quot; en Sys2000).
            Sin selección = solo RCV. Vuelve a pulsar la misma para quitarla.
          </p>
          <div className="flex flex-wrap gap-2">
            {coberturasAdicionales.map((cober) => {
              const selected = coberSeleccionada === cober.value;
              return (
                <button
                  key={cober.value}
                  type="button"
                  disabled={isLoadingQuote}
                  onClick={() => {
                    const next = selected ? 'RC' : cober.value;
                    setRcv({ coberAdicional: next });
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold border-2 transition-all ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50'
                  } disabled:opacity-50`}
                >
                  {cober.text}
                </button>
              );
            })}
          </div>
          {coberSeleccionada !== 'RC' && (
            <p className="mt-3 text-[0.7rem] font-semibold text-indigo-700">
              Seleccionado: {coberturasAdicionales.find((c) => c.value === coberSeleccionada)?.text ?? coberSeleccionada}
              {isLoadingQuote && (
                <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
                  <Loader2 size={12} className="animate-spin" />
                  Recalculando…
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Card de detalle del plan */}
      {selectedPlan ? (
        <PlanDetailCard
          plan={selectedPlan}
          displayPrice={displayPrice}
          isLoadingQuote={isLoadingQuote}
          hasRealQuote={hasRealQuote}
          quoteVes={vesAnnual(quote)}
          frecuenciaLabel={frecuenciaLabel}
          freqAmounts={freqAmounts}
          ptasa={quote?.ptasa}
          vehicleLabel={quote?.vehicleLabel}
          vehicleFallback={quote?.vehicleFallback}
          quoteError={quoteState === 'error'}
          quote={quote}
        />
      ) : (
        <div className="text-center py-14 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50/70 to-white">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 grid place-items-center mx-auto mb-3 shadow-sm">
            <Shield size={22} className="text-slate-500" />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {plansLoading
              ? 'Cargando planes disponibles para tu vehículo...'
              : apiPlans.length > 0
                ? 'Elige un plan en el selector para ver la cotización.'
                : 'Selecciona primero el vehículo para ver los planes disponibles.'}
          </p>
        </div>
      )}
    </div>
  );
}

function PlanDetailCard({
  plan, displayPrice,
  isLoadingQuote, hasRealQuote, quoteVes, frecuenciaLabel, freqAmounts, ptasa,
  vehicleLabel, vehicleFallback, quoteError,
  quote,
}: {
  plan: Plan;
  displayPrice: number;
  isLoadingQuote: boolean;
  hasRealQuote: boolean;
  quoteVes: number;
  frecuenciaLabel: string;
  freqAmounts: ReturnType<typeof resolveFrecuenciaAmounts>;
  ptasa?: number;
  vehicleLabel?: string;
  vehicleFallback?: boolean;
  quoteError: boolean;
  quote: import('../../types').PolicyQuote | null;
}) {
  return (
    <article className="relative rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-50/90 via-violet-50/40 to-white p-4 sm:p-6 shadow-[0_24px_48px_-12px_rgba(15,26,90,0.22)] animate-spring-in overflow-hidden">
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-fuchsia-500/12 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-indigo-500/12 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 rounded-2xl gradient-border pointer-events-none" />

      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-5 mb-5">
          <div className="min-w-0 flex-1">
            <span className="inline-block px-2 py-0.5 rounded-md bg-white text-slate-500 text-[0.62rem] font-bold mb-2 uppercase tracking-wider border border-slate-200">
              {plan.tag}
            </span>
            <h3 className="font-display font-black text-slate-900 text-xl sm:text-2xl leading-tight break-words">{plan.name}</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-md">{plan.desc}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {hasRealQuote && !vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.6rem] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wider">
                  <BadgeCheck size={11} strokeWidth={2.4} />
                  Tarifa La Mundial
                </span>
              )}
              {hasRealQuote && vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.6rem] font-black text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 uppercase tracking-wider">
                  <AlertTriangle size={11} strokeWidth={2.4} />
                  Tarifa estimada
                </span>
              )}
              {hasRealQuote && vehicleLabel && (
                <span className="inline-flex items-center text-[0.6rem] font-bold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 uppercase tracking-wider">
                  {vehicleLabel}
                </span>
              )}
              {quoteError && (
                <span className="inline-flex items-center gap-1 text-[0.6rem] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-md border border-rose-200 uppercase tracking-wider">
                  <AlertTriangle size={11} strokeWidth={2.4} />
                  Cotización pendiente
                </span>
              )}
            </div>
          </div>

          <div className="w-full sm:w-auto sm:shrink-0 sm:max-w-[260px] flex flex-col items-stretch sm:items-end gap-3">
            <div className="text-left sm:text-right">
              <div className="flex items-end gap-1 sm:justify-end">
                <span className="text-base sm:text-[1.2rem] font-display font-black text-slate-500 leading-none pb-1 sm:pb-2">$</span>
                {isLoadingQuote && !hasRealQuote ? (
                  <span className="text-4xl sm:text-5xl font-display font-black gradient-text-indigo leading-none tabular-nums inline-flex items-center gap-2">
                    <Loader2 size={28} className="animate-spin opacity-70" />
                    <span className="opacity-50">---</span>
                  </span>
                ) : (
                  <span className="text-4xl sm:text-5xl font-display font-black gradient-text-indigo leading-none tabular-nums">
                    <AnimatedCounter
                      value={displayPrice}
                      duration={500}
                      decimals={hasRealQuote ? 2 : 0}
                    />
                  </span>
                )}
                <span className="text-[0.7rem] text-slate-500 font-semibold pb-1.5 sm:hidden">/ año</span>
              </div>
              <p className="hidden sm:block text-[0.7rem] text-slate-500 font-semibold mt-1">/ año</p>

              {hasRealQuote && quoteVes > 0 && (
                <p className="text-[0.65rem] font-bold text-indigo-700/80 mt-1.5 tabular-nums">
                  ≈ Bs{' '}
                  {quoteVes.toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
              {hasRealQuote && ptasa && ptasa > 0 && (
                <p className="text-[0.6rem] text-slate-500 mt-0.5 tabular-nums">
                  Tasa de cambio: {ptasa.toFixed(2)} Bs/$
                </p>
              )}
            </div>

            <PrimaCard
              quote={quote}
              freqAmounts={freqAmounts}
              frecuenciaLabel={frecuenciaLabel}
              isLoading={isLoadingQuote && !hasRealQuote}
              hasReal={hasRealQuote}
            />
          </div>
        </div>

        <div className="divider-soft mb-5" />

        <p className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
          <Shield size={11} className="text-indigo-500" />
          Cobertura incluida
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {plan.benefits.map((b) => (
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
            <Shield size={11} />
            Plan seleccionado
          </div>
          <div className="text-[0.62rem] text-slate-500 font-medium">
            Recibos: {frecuenciaLabel}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Card de prima — muestra datos reales de La Mundial cuando hay cotización.
 */
function PrimaCard({
  quote,
  freqAmounts,
  frecuenciaLabel,
  isLoading,
  hasReal,
}: {
  quote: import('../../types').PolicyQuote | null;
  freqAmounts: ReturnType<typeof resolveFrecuenciaAmounts>;
  frecuenciaLabel: string;
  isLoading: boolean;
  hasReal: boolean;
}) {
  if (isLoading) {
    return (
      <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-800 via-indigo-700 to-violet-700 p-4 sm:p-5 shadow-[0_22px_42px_-14px_rgba(9,17,51,0.6)] ring-1 ring-white/10 flex flex-col gap-3 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/20" />
          <div className="h-3 w-28 bg-white/20 rounded-full" />
        </div>
        <div className="h-8 w-24 bg-white/20 rounded-lg" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-white/10 rounded-full" />
          <div className="h-3 w-3/4 bg-white/10 rounded-full" />
        </div>
      </div>
    );
  }

  if (!hasReal || !quote) {
    return (
      <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 sm:p-5 ring-1 ring-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-lg bg-white/10 grid place-items-center ring-1 ring-white/15">
            <Loader2 size={12} className="text-white/60 animate-spin" />
          </span>
          <span className="text-[0.62rem] font-black text-white/70 uppercase tracking-widest">Prima oficial</span>
        </div>
        <p className="text-white/50 text-xs leading-relaxed">
          Completa los datos del vehículo para obtener la tarifa real de La Mundial.
        </p>
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-800 via-indigo-700 to-violet-700 p-4 sm:p-5 shadow-[0_22px_42px_-14px_rgba(9,17,51,0.6)] ring-1 ring-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_55%)] pointer-events-none" />
      <div className="absolute -bottom-20 -right-12 w-44 h-44 rounded-full bg-fuchsia-500/18 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-2 text-[0.62rem] font-black text-white uppercase tracking-widest">
            <span className="w-6 h-6 rounded-lg bg-white/15 grid place-items-center ring-1 ring-white/20">
              <ShieldCheck size={12} className="text-white" strokeWidth={2.5} />
            </span>
            Prima La Mundial
          </span>
          <span className="text-[0.55rem] font-black text-emerald-200 bg-emerald-500/20 px-2 py-0.5 rounded-md ring-1 ring-emerald-300/30 tracking-wider">
            OFICIAL
          </span>
        </div>

        <div className="flex items-baseline gap-1 mb-0.5">
          <span className="text-base font-display font-black text-white/50 leading-none pb-1">$</span>
          <span className="font-display font-black text-white text-[2.1rem] leading-none tabular-nums tracking-tight">
            {quote.mprimaext.toFixed(2)}
          </span>
          <span className="text-[0.7rem] text-white/50 font-semibold pb-1 ml-1">USD / año</span>
        </div>

        <p className="text-[0.72rem] font-bold text-indigo-300 tabular-nums mb-3">
          ≈ Bs {fmt(quote.mprima)} / año
        </p>

        <div className="h-px bg-white/10 mb-3" />

        <div className="space-y-1.5">
          {freqAmounts.cuotas > 1 ? (
            <>
              <div className="flex items-center justify-between text-[0.67rem]">
                <span className="text-white/55">1er recibo ({frecuenciaLabel})</span>
                <span className="font-bold text-white/80 tabular-nums">
                  ${freqAmounts.installmentUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[0.67rem]">
                <span className="text-white/55">1er recibo Bs</span>
                <span className="font-bold text-white/80 tabular-nums">
                  Bs {fmt(freqAmounts.installmentVes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[0.67rem] pt-1 border-t border-white/10">
                <span className="text-white/55">{freqAmounts.cuotas} recibos al año</span>
                <span className="text-white/50 tabular-nums">{freqAmounts.paySummary}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between text-[0.67rem]">
              <span className="text-white/55">Pago único anual</span>
              <span className="font-bold text-white/80 tabular-nums">${quote.mprimaext.toFixed(2)}</span>
            </div>
          )}
          {quote.ptasa > 0 && (
            <div className="flex items-center justify-between text-[0.67rem] pt-1 border-t border-white/10">
              <span className="text-white/40">Tasa de cambio</span>
              <span className="text-white/50 tabular-nums">{quote.ptasa.toFixed(2)} Bs/$</span>
            </div>
          )}
          {quote.coberturas && quote.coberturas.length > 0 && (
            <div className="pt-2 mt-1 border-t border-white/10 space-y-1">
              <p className="text-[0.6rem] font-black uppercase tracking-wider text-white/45">
                Coberturas incluidas
              </p>
              {quote.coberturas.slice(0, 6).map((c) => (
                <div
                  key={`${c.ccobertura ?? c.name}`}
                  className="flex items-start justify-between gap-2 text-[0.65rem]"
                >
                  <span className="text-white/70 leading-snug">{c.name}</span>
                  <span className="font-semibold text-white/85 tabular-nums shrink-0">
                    ${c.prima.toFixed(2)}
                  </span>
                </div>
              ))}
              {quote.coberturas.length > 6 && (
                <p className="text-[0.6rem] text-white/40">
                  + {quote.coberturas.length - 6} coberturas más
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
