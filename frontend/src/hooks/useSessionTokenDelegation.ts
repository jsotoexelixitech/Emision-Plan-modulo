import { useEffect } from 'react';
import { useWizardStore } from '../store/wizardStore';
import { applyMetadataFromNexusToken } from '../lib/nexus-token-client';
import { persistProductFromHints } from '../lib/product';

const STORAGE_KEY = 'nexus_access_token_emision';

/** Sincroniza metadata SSO del JWT (nexus_token) y legacy session_token. */
export function useSessionTokenDelegation() {
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);

  useEffect(() => {
    applyMetadataFromNexusToken(STORAGE_KEY, (metadata) => {
      setMetadataCanal(metadata);
      if (metadata.product === 'funerario' || metadata.product === 'rcv') {
        persistProductFromHints({ product: String(metadata.product) });
      }
    });

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('session_token');

    if (!token) return;

    try {
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        if (payload.metadata) {
          setMetadataCanal(payload.metadata);
        }
      }
    } catch {
      // Token inválido — no bloquea el flujo
    } finally {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [setMetadataCanal]);
}
