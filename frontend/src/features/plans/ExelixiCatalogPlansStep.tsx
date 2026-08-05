import { useEffect, useRef } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import {
  Check, Star, Shield, Loader2, AlertTriangle, BadgeCheck,
} from 'lucide-react';
import type { Plan } from '../../types';
import { quoteExelixiPolicy } from '../../lib/api';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { toast } from '../../store/toastStore';
import {
  activeBuilderPlans,
  readStoredBuilderProduct,
  type BuilderCatalogProduct,
} from '../../lib/exelixi-catalog';

function builderPlanToWizardPlan(
  plan: { id?: string; name: string; isRecommended?: boolean },
  product: BuilderCatalogProduct,
): Plan {
  return {
    cplan: plan.id ?? plan.name,
    name: plan.name,
    price: 'Prima comercial',
    priceNum: 0,
    tag: product.commercialName,
    desc: `Plan comercial · ${product.branch}`,
    benefits: ['Coberturas según product-builder', 'Emisión genérica Exélixi'],
    sumaAsegurada: 0,
  };
}

/** Paso 4 — planes del catálogo product-builder (sin Sis2000). */
export function ExelixiCatalogPlansStep() {
  const {
    category,
    setCategory,
    selectedPlan,
    setSelectedPlan,
    quote,
    quoteState,
    setQuote,
    setQuoteState,
  } = useWizardStore();

  const product = readStoredBuilderProduct();
  const plans = product ? activeBuilderPlans(product) : [];
  const productCommercialName = product?.commercialName ?? '';

  // Depende de `category`: si la hidratación del bridge la pisa con vacío,
  // este efecto la vuelve a fijar (evita el falso "Selecciona un plan").
  useEffect(() => {
    if (!productCommercialName) return;
    if (category !== productCommercialName) {
      setCategory(productCommercialName);
    }
  }, [productCommercialName, category, setCategory]);

  useEffect(() => {
    if (!product || !plans.length || selectedPlan) return;
    const pick = plans.find((p) => p.isRecommended) ?? plans[0];
    setSelectedPlan(builderPlanToWizardPlan(pick, product));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, plans.length, selectedPlan]);

  const planName = selectedPlan?.name ?? '';
  const quoteSig = product && planName ? `${product.id}|${planName}` : '';
  const activeQuoteSigRef = useRef('');

  useEffect(() => {
    if (!quoteSig || !product) return;

    const snap = useWizardStore.getState();
    if (snap.quoteVehicleSignature === quoteSig && snap.quoteState === 'ready') return;

    activeQuoteSigRef.current = quoteSig;
    setQuoteState('loading');

    quoteExelixiPolicy({ productId: product.id, planName })
      .then((r) => {
        if (activeQuoteSigRef.current !== quoteSig) return;
        const prima = Number(r.primaTotal ?? 0);
        setQuote(
          { mprima: prima, mprimaext: prima, ptasa: 1 },
          quoteSig,
        );
      })
      .catch((err: unknown) => {
        if (activeQuoteSigRef.current !== quoteSig) return;
        const ax = err as { response?: { data?: { message?: string } }; message?: string };
        const message = ax.response?.data?.message || ax.message || 'No pudimos cotizar el plan.';
        setQuoteState('error', message);
        toast.warning('Cotización no disponible', message, 5000);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSig]);

  if (!product) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        No se encontró el producto del catálogo. Vuelve al OCR y selecciona un ramo.
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        El producto «{product.commercialName}» no tiene planes activos en product-builder.
      </div>
    );
  }

  const isLoadingQuote = quoteState === 'loading';
  const hasRealQuote = quoteState === 'ready' && Boolean(quote);
  const displayPrice = hasRealQuote ? quote!.mprimaext : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <p className="text-slate-500 text-sm leading-relaxed max-w-md">
        Selecciona el plan comercial de <strong>{product.commercialName}</strong>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const wizardPlan = builderPlanToWizardPlan(plan, product);
          const isSelected = selectedPlan?.name === plan.name;

          return (
            <button
              key={plan.id ?? plan.name}
              type="button"
              onClick={() => setSelectedPlan(wizardPlan)}
              className={`relative text-left rounded-2xl border-2 p-5 transition-all hover:-translate-y-0.5 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/60 shadow-lg shadow-indigo-100'
                  : 'border-slate-200/80 bg-white hover:border-indigo-200'
              }`}
            >
              {plan.isRecommended && (
                <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400 text-[0.65rem] font-black uppercase tracking-wide text-amber-950">
                  <Star size={10} fill="currentColor" />
                  Recomendado
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{plan.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{product.branch}</p>
                </div>
                {isSelected && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <Check size={14} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedPlan && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Prima anual estimada
              </p>
              {isLoadingQuote ? (
                <div className="flex items-center gap-2 text-indigo-600">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm font-semibold">Calculando…</span>
                </div>
              ) : quoteState === 'error' ? (
                <div className="flex items-center gap-2 text-rose-600">
                  <AlertTriangle size={18} />
                  <span className="text-sm font-semibold">Cotización no disponible</span>
                </div>
              ) : (
                <p className="font-display text-3xl font-black text-slate-900">
                  $<AnimatedCounter value={displayPrice} decimals={2} />
                  <span className="text-base font-bold text-slate-500 ml-1">USD</span>
                </p>
              )}
            </div>
            {hasRealQuote && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
                <BadgeCheck size={16} />
                Tarifa del catálogo Exélixi
              </div>
            )}
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <Shield size={14} className="text-indigo-500 shrink-0 mt-0.5" />
            <span>La emisión generará el cuadro-póliza PDF vía nest-api (sin Sis2000).</span>
          </div>
        </div>
      )}
    </div>
  );
}
