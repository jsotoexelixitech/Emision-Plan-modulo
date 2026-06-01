/**
 * Producto activo del flujo de suscripción.
 *
 * El producto se determina por el parámetro `?product=` de la URL (configurado
 * por el admin de Nexus en la URL de cada submódulo) y se conserva en
 * sessionStorage. Por defecto es `rcv` (comportamiento previo).
 */
import type { ProductId } from '../types';

export interface ProductConfig {
  id: ProductId;
  label: string;
  fullLabel: string;
  /** Ramo La Mundial asociado (RCV=18, Funerario=9). */
  cramo: number;
  /** True si el flujo incluye datos de vehículo (RCV). */
  hasVehicle: boolean;
}

export const PRODUCTS: Record<ProductId, ProductConfig> = {
  rcv: { id: 'rcv', label: 'RCV', fullLabel: 'Suscripción RCV', cramo: 18, hasVehicle: true },
  funerario: { id: 'funerario', label: 'Funerario', fullLabel: 'Seguro Funerario', cramo: 9, hasVehicle: false },
};

const VALID_PRODUCTS: ProductId[] = ['rcv', 'funerario'];
const STORAGE_KEY = 'exelixi_product';

export function getProductId(): ProductId {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('product');
    if (fromUrl && VALID_PRODUCTS.includes(fromUrl as ProductId)) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl as ProductId;
    }
  } catch { /* ignore */ }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && VALID_PRODUCTS.includes(stored as ProductId)) return stored as ProductId;
  } catch { /* ignore */ }
  return 'rcv';
}

export function getProductConfig(): ProductConfig {
  return PRODUCTS[getProductId()];
}

export function isFunerario(): boolean {
  return getProductId() === 'funerario';
}
