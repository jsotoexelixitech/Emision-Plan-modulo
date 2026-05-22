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

/**
 * Carga los catálogos estáticos de La Mundial en paralelo (estados + listas de dominio).
 * Las ciudades se cargan dinámicamente con `useCiudades(cestado)` para evitar bajar
 * todas las ciudades del país en una sola request.
 */
export function useCatalogs(): Catalogs {
  const [cats, setCats] = useState<Catalogs>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getEstados(),
      getValrepList('SEXO'),
      getValrepList('EDOCIVIL'),
      getValrepList('PARENTESCOS'),
    ])
      .then(([estados, sexos, estadosCivil, parentescos]) => {
        if (!cancelled) {
          setCats({ estados, sexos, estadosCivil, parentescos, loading: false, error: null });
        }
      })
      .catch((err) => {
        console.warn('[useCatalogs] Error cargando catálogos, usando fallback estático:', err.message);
        if (!cancelled) {
          setCats((prev) => ({ ...prev, loading: false, error: err.message }));
        }
      });

    return () => { cancelled = true; };
  }, []);

  return cats;
}

export interface CiudadesState {
  ciudades: CatalogItem[];
  loading : boolean;
  error   : string | null;
}

/**
 * Carga las ciudades correspondientes al estado seleccionado.
 * Cada cestado genera una request independiente que se cachea en `api.ts`.
 * Si `cestado` es null/undefined, devuelve la lista vacía sin llamar al backend.
 */
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
