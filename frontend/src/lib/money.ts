/**
 * Helpers de formato monetario para mostrar la prima real de La Mundial.
 *
 * La Mundial cotiza la prima ANUAL:
 *   - mprima    -> en Bs (VES)
 *   - mprimaext -> en USD
 *   - ptasa     -> tasa Bs/USD usada en la cotizacion
 *
 * La frecuencia de pago (ifrecuencia) no cambia la prima anual en
 * spCalculoAuto; ver `frecuencia.ts` para cuota por periodo en UI.
 */
import type { PolicyQuote } from '../types';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const VES = new Intl.NumberFormat('es-VE', {
  style: 'decimal',
  maximumFractionDigits: 2,
});

/** Decimales máximos al mostrar cotización RCV (paridad API — sin redondear de más). */
const QUOTE_USD_MAX = 6;
const QUOTE_VES_MAX = 10;
const QUOTE_TASA_MAX = 4;

function formatQuoteDecimal(n: number, locale: string, maxFrac: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

/** USD cotización RCV tal cual viene de mprimaext (ej. 222.795). */
export function formatQuoteUsd(n: number): string {
  return formatQuoteDecimal(n, 'en-US', QUOTE_USD_MAX);
}

export function formatQuoteUsdMoney(n: number): string {
  return `$${formatQuoteUsd(n)}`;
}

/** Bs cotización RCV tal cual viene de mprima. */
export function formatQuoteVes(n: number): string {
  return formatQuoteDecimal(n, 'es-VE', QUOTE_VES_MAX);
}

export function formatQuoteVesLabel(n: number): string {
  return `Bs ${formatQuoteVes(n)}`;
}

export function formatQuoteTasa(n: number): string {
  return `${formatQuoteDecimal(n, 'es-VE', QUOTE_TASA_MAX)} Bs/$`;
}

/** Monto exacto para pago móvil / OTP (sin toFixed(2)). */
export function formatQuoteVesPaymentInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(QUOTE_VES_MAX);
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export type Billing = 'monthly' | 'annual';

export function usdAnnual(quote: PolicyQuote | null): number {
  return quote?.mprimaext ?? 0;
}
export function usdMonthly(quote: PolicyQuote | null): number {
  return quote ? quote.mprimaext / 12 : 0;
}

export function vesAnnual(quote: PolicyQuote | null): number {
  return quote?.mprima ?? 0;
}
export function vesMonthly(quote: PolicyQuote | null): number {
  return quote ? quote.mprima / 12 : 0;
}

export function formatUsd(n: number): string {
  return USD.format(n);
}

export function formatVes(n: number): string {
  return `Bs ${VES.format(n)}`;
}

export function formatUsdShort(n: number): string {
  // ej. "$408.29"  -> usado en bloques compactos
  return `$${n.toFixed(2)}`;
}

/**
 * Devuelve el monto a mostrar segun toggle billing y la quote actual.
 * Si no hay quote, retorna `fallback` (para no romper UIs durante carga).
 */
export function pickDisplayAmount(
  quote: PolicyQuote | null,
  billing: Billing,
  fallback = 0
): { usd: number; ves: number } {
  if (!quote) return { usd: fallback, ves: 0 };
  return billing === 'monthly'
    ? { usd: usdMonthly(quote), ves: vesMonthly(quote) }
    : { usd: usdAnnual(quote), ves: vesAnnual(quote) };
}

/**
 * Firma del vehiculo usada para invalidar la quote en el store cuando cambian
 * datos relevantes para la cotizacion. Debe coincidir con lo que se mira en
 * setVehicle del store.
 */
export function vehicleSignature(v: {
  placa: string;
  marca: string;
  modelo: string;
  año: string;
  uso: string;
  cversion?: string;
  ccategoria_uso?: number | string;
}): string {
  return `${v.placa}|${v.marca}|${v.modelo}|${v.año}|${v.uso}|${v.cversion ?? ''}|${v.ccategoria_uso ?? ''}`.toUpperCase();
}
