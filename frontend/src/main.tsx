import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NexusGuard recheckInterval={30}>
      <App />
    </NexusGuard>
  </StrictMode>,
)
