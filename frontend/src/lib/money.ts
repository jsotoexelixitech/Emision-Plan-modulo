/**
 * Helpers de formato monetario para mostrar la prima real de La Mundial.
 *
 * La Mundial cotiza la prima ANUAL:
 *   - mprima    -> en Bs (VES)
 *   - mprimaext -> en USD
 *   - ptasa     -> tasa Bs/USD usada en la cotizacion
 *
 * Regla RCV: calcular con todos los decimales (ej. 222.795 × 785.0693);
 * mostrar solo 2 decimales truncados con coma (locale es-VE).
 */
import type { PolicyQuote } from '../types';

const LOCALE = 'es-VE';

const USD = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const VES = new Intl.NumberFormat(LOCALE, {
  style: 'decimal',
  maximumFractionDigits: 2,
});

/** Decimales visibles en pantalla (truncar, no redondear). */
const QUOTE_DISPLAY = 2;
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

/** Bs = USD × tasa BCV (precisión completa, sin truncar). */
export function computeQuoteVes(usd: number, ptasa: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(ptasa) || ptasa <= 0) return 0;
  return usd * ptasa;
}

/** Bs anual para pantalla: USD × tasa si hay tasa; si no, mprima de la API. */
export function resolveQuoteVesAmount(
  usd: number | undefined | null,
  ptasa: number | undefined | null,
  fallbackMprima?: number | null,
): number {
  if (usd != null && Number.isFinite(usd) && ptasa != null && ptasa > 0) {
    return computeQuoteVes(usd, ptasa);
  }
  return fallbackMprima ?? 0;
}

function formatQuoteDecimal(n: number, displayDecimals: number): string {
  const truncated = truncateQuoteAmount(n, displayDecimals);
  return truncated.toLocaleString(LOCALE, {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}

/** USD cotización RCV (ej. 222,79). */
export function formatQuoteUsd(n: number): string {
  return formatQuoteDecimal(n, QUOTE_DISPLAY);
}

export function formatQuoteUsdMoney(n: number): string {
  return `$${formatQuoteUsd(n)}`;
}

/** Bs cotización RCV (ej. 174.909,51). */
export function formatQuoteVes(n: number): string {
  return formatQuoteDecimal(n, QUOTE_DISPLAY);
}

export function formatQuoteVesLabel(n: number): string {
  return `Bs ${formatQuoteVes(n)}`;
}

export function formatQuoteTasa(n: number): string {
  return `${formatQuoteTasaValue(n)} Bs/$`;
}

export function formatQuoteTasaValue(n: number): string {
  const truncated = truncateQuoteAmount(n, QUOTE_TASA_DISPLAY);
  return truncated.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: QUOTE_TASA_DISPLAY,
  });
}

/** Monto del recibo para pago móvil / OTP (2 decimales truncados, punto para input). */
export function formatQuoteVesPaymentInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  const truncated = truncateQuoteAmount(n, QUOTE_VES_PAYMENT);
  return truncated.toFixed(QUOTE_VES_PAYMENT);
}

export type Billing = 'monthly' | 'annual';

export function usdAnnual(quote: PolicyQuote | null): number {
  return quote?.mprimaext ?? 0;
}
export function usdMonthly(quote: PolicyQuote | null): number {
  return quote ? quote.mprimaext / 12 : 0;
}

export function vesAnnual(quote: PolicyQuote | null): number {
  if (!quote) return 0;
  const ptasa = quote.ptasa ?? 0;
  if (ptasa > 0 && quote.mprimaext != null) {
    return computeQuoteVes(quote.mprimaext, ptasa);
  }
  return quote.mprima ?? 0;
}
export function vesMonthly(quote: PolicyQuote | null): number {
  return quote ? vesAnnual(quote) / 12 : 0;
}

export function formatUsd(n: number): string {
  return USD.format(n);
}

export function formatVes(n: number): string {
  return `Bs ${VES.format(n)}`;
}

export function formatUsdShort(n: number): string {
  return formatQuoteUsdMoney(n);
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
