import { useEffect } from 'react';
import { useWizardStore } from './store/wizardStore';
import { publish } from '../../../shared/src/index';
import { SidebarNav } from './components/SidebarNav';
import { TopProgressBar } from './components/TopProgressBar';
import { AuroraBackground } from './components/AuroraBackground';
import { Toaster } from './components/Toaster';
import { WelcomeSplash } from './components/WelcomeSplash';
import { Button } from './components/ui/Button';
import { PlansStep } from './features/plans/PlansStep';
import { toast } from './store/toastStore';
import { ChevronRight, Sparkles, ShieldCheck, HelpCircle } from 'lucide-react';

export default function App() {
  const { category, selectedPlan, goTo } = useWizardStore();

  // Inicializa el store en el paso 4 para que el sidebar lo resalte correctamente
  useEffect(() => { goTo(4); }, [goTo]);

  function handleContinuar() {
    if (!category || !selectedPlan) {
      toast.warning(
        'Selecciona un plan',
        'Elige una categoría y un plan para continuar.',
      );
      return;
    }
    toast.success(
      '¡Plan seleccionado!',
      `Categoría ${category} · Plan ${selectedPlan.name} listo para emitir.`,
    );
    // Publicar evento para módulos activos en el mismo contexto
    const s = useWizardStore.getState();
    publish({
      source: 'emision',
      type: 'emision:quote-ready',
      payload: {
        mprima    : s.quote?.mprima    ?? selectedPlan.priceNum,
        mprimaext : s.quote?.mprimaext ?? undefined,
        ptasa     : s.quote?.ptasa     ?? undefined,
      },
    });
    // Si el bridge está activo (flujo completo en cadena), avanzar al siguiente módulo
    window.__bridgeAdvance?.();
  }

  return (
    <div className="min-h-screen relative">
      <WelcomeSplash />
      <Toaster />
      <AuroraBackground />
      <TopProgressBar />

      <div className="lg:flex">
        <SidebarNav />

        <main className="flex-1 lg:ml-[300px] min-h-screen pt-[72px] lg:pt-20 px-4 sm:px-6 lg:px-10 pb-32 lg:pb-12">
          <div className="max-w-5xl mx-auto">

            <header className="mb-8 animate-fade-in">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                    <Sparkles size={11} className="text-indigo-500" />
                    Paso 04 · Cobertura
                  </p>
                  <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                    Elige tu plan ideal
                  </h1>
                  <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                    Categorías diseñadas para cada perfil de uso del vehículo.
                  </p>
                </div>
                <a
                  href="mailto:soporte@lamundialdeseguros.com?subject=Suscripci%C3%B3n%20RCV%20-%20Soporte"
                  className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass-light text-slate-600 hover:text-indigo-600 text-xs font-bold transition-all hover:-translate-y-0.5"
                >
                  <HelpCircle size={13} />
                  ¿Necesitas ayuda?
                </a>
              </div>
            </header>

            <section className="surface-card overflow-hidden step-enter">
              <div className="p-6 sm:p-8 lg:p-10">
                <PlansStep />
              </div>

              <div className="hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  <span className="font-medium">Cifrado de extremo a extremo · TLS 1.3</span>
                </div>
                <Button variant="primary" onClick={handleContinuar} className="min-w-[180px]">
                  Confirmar plan
                  <ChevronRight size={15} />
                </Button>
              </div>
            </section>

          </div>
        </main>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <Button variant="primary" className="w-full" onClick={handleContinuar}>
          Confirmar plan
        </Button>
      </div>
    </div>
  );
}
