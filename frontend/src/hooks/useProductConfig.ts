/**
 * useProductConfig.ts
 *
 * Hook compartido para leer y guardar la configuración paramétrica
 * de un módulo desde el servidor Nexus.
 */
import { useEffect, useState, useCallback } from 'react';

const NEXUS_URL = import.meta.env.VITE_NEXUS_API_URL ?? 'http://localhost:3091';
const NEXUS_KEY = import.meta.env.VITE_NEXUS_API_KEY ?? '';

export type LoadState = 'loading' | 'ready' | 'error';

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
      const res = await fetch(`${NEXUS_URL}/api/config/${empresaId}/${producto}/${modulo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': NEXUS_KEY },
        body: JSON.stringify(newConfig),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      } else {
        setSaveError(data.message ?? 'Error al guardar.');
      }
    } catch {
      setSaveError('No se pudo conectar al servidor Nexus.');
    } finally {
      setSaving(false);
    }
  }, [empresaId, producto, modulo]);

  const resetConfig = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${NEXUS_URL}/api/config/${empresaId}/${producto}/${modulo}/reset`, {
        method: 'POST',
        headers: { 'x-api-key': NEXUS_KEY },
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      } else {
        setSaveError(data.message ?? 'Error al resetear.');
      }
    } catch {
      setSaveError('No se pudo conectar al servidor Nexus.');
    } finally {
      setSaving(false);
    }
  }, [empresaId, producto, modulo]);

  return { config, loadState, saving, saveError, saveConfig, resetConfig, refetch: fetchConfig };
}
