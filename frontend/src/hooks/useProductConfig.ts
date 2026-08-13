/**
 * useProductConfig.ts
 *
 * Hook compartido para leer y guardar la configuración paramétrica
 * de un módulo desde el servidor Nexus.
 *
 * Escritura: usa el JWT ?token= que abre Nexus Admin (scope config-panel),
 * con fallback a VITE_NEXUS_API_KEY si existe.
 */
import { useEffect, useState, useCallback } from 'react';
import { resolveNexusApiUrl } from '../nexus/nexus-core';

const NEXUS_URL = resolveNexusApiUrl(import.meta.env.VITE_NEXUS_API_URL);
const NEXUS_KEY = import.meta.env.VITE_NEXUS_API_KEY ?? '';

export type LoadState = 'loading' | 'ready' | 'error';

function readConfigPanelToken(): string {
  try {
    return new URL(window.location.href).searchParams.get('token')?.trim() || '';
  } catch {
    return '';
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const panelToken = readConfigPanelToken();
  if (panelToken) {
    headers.Authorization = `Bearer ${panelToken}`;
    headers['x-config-token'] = panelToken;
  }
  if (NEXUS_KEY) {
    headers['x-api-key'] = NEXUS_KEY;
  }
  return headers;
}

export function useProductConfig(empresaId: number, producto: string, modulo: string) {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await fetch(`${NEXUS_URL}/api/config/${empresaId}/${producto}/${modulo}`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    } catch {
      setLoadState('error');
    }
  }, [empresaId, producto, modulo]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: Record<string, any>) => {
    setSaving(true);
    setSaveError('');
    try {
      if (!readConfigPanelToken() && !NEXUS_KEY) {
        setSaveError(
          'Sin token de acceso. Abre el parametrizador desde Nexus Admin (Configurar módulo).',
        );
        return null;
      }
      // Merge con lo cargado: un PUT parcial no debe borrar otras claves
      const payload = { ...(config ?? {}), ...newConfig };
      const res = await fetch(`${NEXUS_URL}/api/config/${empresaId}/${producto}/${modulo}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfig(data.data);
        return data.data as Record<string, any>;
      }
      setSaveError(
        data.message
          || (res.status === 403
            ? 'Token expirado o inválido. Vuelve a abrir desde Nexus Admin.'
            : `Error al guardar (HTTP ${res.status}).`),
      );
      return null;
    } catch {
      setSaveError('No se pudo conectar al servidor Nexus.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [empresaId, producto, modulo, config]);

  const resetConfig = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (!readConfigPanelToken() && !NEXUS_KEY) {
        setSaveError(
          'Sin token de acceso. Abre el parametrizador desde Nexus Admin (Configurar módulo).',
        );
        return;
      }
      const res = await fetch(`${NEXUS_URL}/api/config/${empresaId}/${producto}/${modulo}/reset`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfig(data.data);
      } else {
        setSaveError(
          data.message
            || (res.status === 403
              ? 'Token expirado o inválido. Vuelve a abrir desde Nexus Admin.'
              : `Error al resetear (HTTP ${res.status}).`),
        );
      }
    } catch {
      setSaveError('No se pudo conectar al servidor Nexus.');
    } finally {
      setSaving(false);
    }
  }, [empresaId, producto, modulo]);

  return { config, loadState, saving, saveError, saveConfig, resetConfig, refetch: fetchConfig };
}
