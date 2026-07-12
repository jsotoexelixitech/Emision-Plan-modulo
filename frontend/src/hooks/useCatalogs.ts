import { useEffect, useState } from 'react';
import { getEstados, getCiudades, getValrepList, type CatalogItem } from '../lib/api';

export interface Catalogs {
  estados     : CatalogItem[];
  sexos       : CatalogItem[];
  estadosCivil: CatalogItem[];
  parentescos : CatalogItem[];
  loading     : boolean;
  error       : string | null;
}

const EMPTY: Catalogs = {
  estados: [], sexos: [], estadosCivil: [], parentescos: [],
  loading: true, error: null,
};

const LIST_FALLBACKS: Record<string, CatalogItem[]> = {
  SEXO: [
    { code: 'M', label: 'Masculino' },
    { code: 'F', label: 'Femenino' },
  ],
  EDOCIVIL: [
    { code: 'S', label: 'Soltero(a)' },
    { code: 'C', label: 'Casado(a)' },
    { code: 'D', label: 'Divorciado(a)' },
    { code: 'V', label: 'Viudo(a)' },
  ],
  PARENTESCOS: [
    { code: 'T', label: 'TITULAR' },
    { code: 'C', label: 'CONYUGE' },
    { code: 'H', label: 'HIJO(A)' },
  ],
};

async function loadList(domain: keyof typeof LIST_FALLBACKS): Promise<CatalogItem[]> {
  try {
    return await getValrepList(domain);
  } catch (err) {
    console.warn(`[useCatalogs] ${domain} falló, usando fallback:`, (err as Error).message);
    return LIST_FALLBACKS[domain] ?? [];
  }
}

export function useCatalogs(): Catalogs {
  const [cats, setCats] = useState<Catalogs>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [estadosR, sexosR, edoR, parR] = await Promise.allSettled([
        getEstados(),
        loadList('SEXO'),
        loadList('EDOCIVIL'),
        loadList('PARENTESCOS'),
      ]);

      if (cancelled) return;

      const estados = estadosR.status === 'fulfilled' ? estadosR.value : [];
      const sexos = sexosR.status === 'fulfilled' ? sexosR.value : LIST_FALLBACKS.SEXO;
      const estadosCivil = edoR.status === 'fulfilled' ? edoR.value : LIST_FALLBACKS.EDOCIVIL;
      const parentescos = parR.status === 'fulfilled' ? parR.value : LIST_FALLBACKS.PARENTESCOS;

      const errors = [estadosR, sexosR, edoR, parR]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason?.message ?? String(r.reason));

      setCats({
        estados,
        sexos,
        estadosCivil,
        parentescos,
        loading: false,
        error: errors.length ? errors.join('; ') : null,
      });
    })();

    return () => { cancelled = true; };
  }, []);

  return cats;
}

export interface CiudadesState {
  ciudades: CatalogItem[];
  loading : boolean;
  error   : string | null;
}

export function useCiudades(cestado?: number | null): CiudadesState {
  const [state, setState] = useState<CiudadesState>({ ciudades: [], loading: false, error: null });

  useEffect(() => {
    if (!cestado) {
      setState({ ciudades: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ ciudades: [], loading: true, error: null });

    getCiudades(cestado)
      .then((ciudades) => {
        if (!cancelled) setState({ ciudades, loading: false, error: null });
      })
      .catch((err) => {
        console.warn(`[useCiudades] Error cargando ciudades del estado ${cestado}:`, err.message);
        if (!cancelled) setState({ ciudades: [], loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [cestado]);

  return state;
}
