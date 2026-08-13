import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'
import { applyCotizadorWizardHandoff } from './lib/cotizador-flow'
import { useWizardStore } from './store/wizardStore'

import { EmisionConfigPanel } from './config/EmisionConfigPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Emisión');

function CotizadorHandoffBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { goTo } = useWizardStore.getState();
    const setState = (partial: Record<string, unknown>) => {
      (useWizardStore as unknown as { setState: (p: Record<string, unknown>) => void }).setState(partial);
    };
    applyCotizadorWizardHandoff(setState, goTo);
  }, []);
  return children;
}

// /config (dev) o /emision/config (prod con prefijo Apache)
const isConfigRoute = /\/config\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <EmisionConfigPanel />
    ) : (
      <NexusGuard recheckInterval={30}>
        <CotizadorHandoffBootstrap>
          <App />
        </CotizadorHandoffBootstrap>
      </NexusGuard>
    )}
  </StrictMode>,
)
