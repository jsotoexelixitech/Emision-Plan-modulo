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

/** Decimales visibles en pantalla (truncar, no redondear). Cálculos internos sin tocar. */
const QUOTE_USD_DISPLAY = 3;
const QUOTE_VES_DISPLAY = 2;
const QUOTE_TASA_DISPLAY = 4;
/** Monto a pagar en Bs — 2 decimales truncados (estándar pago móvil). */
const QUOTE_VES_PAYMENT = 2;

/** Trunca hacia cero; evita redondeo tipo 222.795 → 222.80. */
export function truncateQuoteAmount(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  const adj = n >= 0 ? 1e-9 : -1e-9;
  return Math.trunc((n + adj) * factor) / factor;
}

function formatQuoteDecimal(n: number, locale: string, displayDecimals: number): string {
  const truncated = truncateQuoteAmount(n, displayDecimals);
  return truncated.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

/** USD cotización RCV (ej. 222.795, cuota 55.698). */
export function formatQuoteUsd(n: number): string {
  return formatQuoteDecimal(n, 'en-US', QUOTE_USD_DISPLAY);
}

export function formatQuoteUsdMoney(n: number): string {
  return `$${formatQuoteUsd(n)}`;
}

/** Bs cotización RCV — hasta 2 decimales visibles (ej. 174.909,51). */
export function formatQuoteVes(n: number): string {
  return formatQuoteDecimal(n, 'es-VE', QUOTE_VES_DISPLAY);
}

export function formatQuoteVesLabel(n: number): string {
  return `Bs ${formatQuoteVes(n)}`;
}

export function formatQuoteTasa(n: number): string {
  return `${formatQuoteDecimal(n, 'es-VE', QUOTE_TASA_DISPLAY)} Bs/$`;
}

/** Monto del recibo para pago móvil / OTP (2 decimales truncados). */
export function formatQuoteVesPaymentInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  const truncated = truncateQuoteAmount(n, QUOTE_VES_PAYMENT);
  return truncated.toLocaleString('en-US', {
    minimumFractionDigits: QUOTE_VES_PAYMENT,
    maximumFractionDigits: QUOTE_VES_PAYMENT,
    useGrouping: false,
  });
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
