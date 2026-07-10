import { useEffect } from 'react';
import { useWizardStore } from '../store/wizardStore';

/** Intercepta session_token SSO y limpia la URL. Compartido RCV / funerario. */
export function useSessionTokenDelegation() {
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);

  useEffect(() => {
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
