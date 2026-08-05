import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'

import { EmisionConfigPanel } from './config/EmisionConfigPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Emisión');

const isConfigRoute = window.location.pathname === '/config';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <EmisionConfigPanel />
    ) : (
      <NexusGuard recheckInterval={30}>
        <App />
      </NexusGuard>
    )}
  </StrictMode>,
)
