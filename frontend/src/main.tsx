import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'

import { EmisionConfigPanel } from './config/EmisionConfigPanel'
import { EmisionRevisionPanel } from './config/EmisionRevisionPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Emisión');

// /config (dev) o /emision/config (prod) · /config/preguntas = solo cuestionario
const isConfigRoute = /\/config(\/preguntas)?\/?$/i.test(window.location.pathname)
  || new URL(window.location.href).searchParams.get('view') === 'preguntas';
const isRevisionRoute = /\/revision\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <EmisionConfigPanel />
    ) : isRevisionRoute ? (
      <EmisionRevisionPanel />
    ) : (
      <NexusGuard recheckInterval={30}>
        <App />
      </NexusGuard>
    )}
  </StrictMode>,
)
