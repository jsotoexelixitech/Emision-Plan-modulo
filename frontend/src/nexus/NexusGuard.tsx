import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { verifyNexusAccess, type NexusVerifyResult } from './nexus-core';

// ─── Context ──────────────────────────────────────────────────────────────────
interface NexusContextValue {
  empresa: NexusVerifyResult['empresa'];
  submodulo: NexusVerifyResult['submodulo'];
}

const NexusContext = createContext<NexusContextValue | null>(null);

export function useNexus(): NexusContextValue {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus debe usarse dentro de <NexusGuard>');
  return ctx;
}

// ─── Pantalla de bloqueo / loading ───────────────────────────────────────────
function NexusScreen({ type, reason, onRetry }: {
  type: 'loading' | 'blocked';
  reason?: string;
  onRetry?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetry?.();
    setRetrying(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0C133A 0%, #1a2460 100%)',
      fontFamily: 'Inter, system-ui, sans-serif', zIndex: 9999,
    }}>
      <div style={{
        background: '#fff', borderRadius: '1.25rem',
        padding: '3rem 2.5rem', maxWidth: 420, width: '90%',
        textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
      }}>
        {type === 'loading' ? (
          <>
            <div style={{
              width: 44, height: 44,
              border: '3px solid #e5e7eb', borderTopColor: '#ED7423',
              borderRadius: '50%', margin: '0 auto 1.5rem',
              animation: 'nexusSpin 0.8s linear infinite',
            }} />
            <p style={{ fontSize: '0.95rem', color: '#475569' }}>Verificando acceso…</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0C133A', margin: '0 0 0.75rem' }}>
              Acceso no disponible
            </h1>
            <p style={{ fontSize: '0.95rem', color: '#475569', margin: '0 0 0.5rem', lineHeight: 1.5 }}>
              {reason}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>
              Si cree que esto es un error, contacte a su administrador.
            </p>
            {onRetry && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                style={{
                  marginTop: '1.5rem',
                  padding: '0.6rem 1.5rem',
                  background: retrying ? '#e5e7eb' : '#0C133A',
                  color: retrying ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: '0.5rem',
                  fontSize: '0.9rem', fontWeight: 600,
                  cursor: retrying ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {retrying ? 'Verificando…' : '🔄 Reintentar'}
              </button>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes nexusSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── NexusGuard ───────────────────────────────────────────────────────────────
interface NexusGuardProps {
  children: React.ReactNode;
  recheckInterval?: number;
}

type GuardStatus = 'loading' | 'active' | 'blocked';

interface GuardState {
  status: GuardStatus;
  empresa?: NexusVerifyResult['empresa'];
  submodulo?: NexusVerifyResult['submodulo'];
  reason?: string;
}

/** Detecta si venimos de un flujo encadenado (bridge ya validó el token). */
function isChainedFlow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('sid') && params.get('nexus_token'));
  } catch { return false; }
}

export function NexusGuard({ children, recheckInterval = 30 }: NexusGuardProps) {
  // Si venimos del bridge (hay sid + nexus_token), mostramos el contenido
  // de inmediato y verificamos en background para no interrumpir la UX.
  const chained = isChainedFlow();
  const [state, setState] = useState<GuardState>({ status: chained ? 'active' : 'loading' });
  const nexusApiUrl = import.meta.env.VITE_NEXUS_API_URL as string;
  const isMounted = useRef(true);

  const doVerify = useCallback(async () => {
    if (!nexusApiUrl) {
      setState({ status: 'blocked', reason: 'VITE_NEXUS_API_URL no está definida en .env' });
      return;
    }
    const result = await verifyNexusAccess(nexusApiUrl);
    if (!isMounted.current) return;
    if (result.active) {
      setState({ status: 'active', empresa: result.empresa, submodulo: result.submodulo });
    } else {
      setState({ status: 'blocked', reason: result.reason });
    }
  }, [nexusApiUrl]);

  useEffect(() => {
    isMounted.current = true;
    doVerify();
    return () => { isMounted.current = false; };
  }, [doVerify]);

  useEffect(() => {
    if (!recheckInterval || recheckInterval <= 0) return;
    const id = setInterval(doVerify, recheckInterval * 1000);
    return () => clearInterval(id);
  }, [doVerify, recheckInterval]);

  useEffect(() => {
    const origFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await origFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url ?? '';
      if (!url.includes('/api/access/verify') && (res.status === 401 || res.status === 403)) {
        doVerify();
      }
      return res;
    };
    return () => { window.fetch = origFetch; };
  }, [doVerify]);

  if (state.status === 'loading') return <NexusScreen type="loading" />;
  if (state.status === 'blocked') return (
    <NexusScreen type="blocked" reason={state.reason} onRetry={doVerify} />
  );

  return (
    <NexusContext.Provider value={{ empresa: state.empresa, submodulo: state.submodulo }}>
      {children}
    </NexusContext.Provider>
  );
}
