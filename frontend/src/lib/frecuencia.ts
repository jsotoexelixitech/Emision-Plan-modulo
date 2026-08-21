/**
 * Frecuencia de pago La Mundial (ifrecuencia).
 *
 * Cotización nacional: prima anual en mprimaext (ifrecuencia solo divide cuotas en UI).
 * Binacional con ndias: la API recotiza con vigencia corta (paridad SysIP selectFrecuencia → searchPrice).
 * Emisión: prima cotizada + ifrecuencia (Sis2000 genera los recibos).
 * UI: solo PaymentStep usa esta utilidad para mostrar el monto del 1er recibo.
 */
import type { PolicyQuote } from '../types';

/** Cuotas por vigencia anual — paridad adrecibos / sp_genera_coberturas_recibos_auto_rcv_nexus */
const CUOTAS_BY_FREC: Record<string, number> = {
  A: 1,
  S: 2,
  T: 4,
  C: 3,
  M: 12,
  E: 1,
  D: 1,
  B: 1,
};

export function normalizeFrecuenciaCode(code?: string | null): string {
  const c = String(code ?? 'A').trim().toUpperCase();
  return c.charAt(0) || 'A';
}

export function getCuotasByFrecuencia(code?: string | null): number {
  const n = CUOTAS_BY_FREC[normalizeFrecuenciaCode(code)];
  return n != null && n > 0 ? n : 1;
}

export function getFrecuenciaPeriodSuffix(code?: string | null): string {
  const map: Record<string, string> = {
    M: '/ mes',
    T: '/ trimestre',
    C: '/ cuatrimestre',
    S: '/ semestre',
    A: '/ año',
    E: '/ pago',
  };
  return map[normalizeFrecuenciaCode(code)] ?? '/ cuota';
}

export function getFrecuenciaPaySummary(
  code?: string | null,
  label?: string,
): string {
  const c = normalizeFrecuenciaCode(code);
  const cuotas = getCuotasByFrecuencia(c);
  if (label?.trim()) {
    if (cuotas === 1) return `Pagas ${label.toLowerCase()}`;
    return `${cuotas} cuotas · ${label}`;
  }
  const defaults: Record<string, string> = {
    M: 'Pagas mensualmente · 12 cuotas',
    T: 'Pagas trimestralmente · 4 cuotas',
    C: 'Pagas cuatrimestralmente · 3 cuotas',
    S: 'Pagas semestralmente · 2 cuotas',
    A: 'Pagas anualmente',
  };
  return defaults[c] ?? `Pagas en ${cuotas} cuota${cuotas === 1 ? '' : 's'}`;
}

/** Texto aclaratorio: la API cotiza anual; la cuota es división en UI. */
export function getFrecuenciaQuoteNote(amounts: FrecuenciaAmounts): string | null {
  if (amounts.cuotas <= 1 || amounts.annualUsd <= 0) return null;
  return `Prima anual cotizada $${amounts.annualUsd.toFixed(2)} ÷ ${amounts.cuotas} cuotas`;
}

export interface FrecuenciaAmounts {
  cuotas: number;
  /** Prima anual USD (valor de cotización). */
  annualUsd: number;
  /** Prima anual Bs. */
  annualVes: number;
  /** Monto por cuota USD. */
  installmentUsd: number;
  /** Monto por cuota Bs. */
  installmentVes: number;
  periodSuffix: string;
  paySummary: string;
}

/**
 * @param quoteBasis
 *   - `annual-total`: mprimaext es prima anual (RCV auto vía spCalculoAuto).
 *   - `per-installment`: mprimaext ya es el monto del periodo (p. ej. spCalculoPer).
 */
export function resolveFrecuenciaAmounts(
  quote: PolicyQuote | null,
  frecuenciaCode?: string | null,
  options?: { frecuenciaLabel?: string; quoteBasis?: 'annual-total' | 'per-installment' },
): FrecuenciaAmounts {
  const cuotas = getCuotasByFrecuencia(frecuenciaCode);
  const basis = options?.quoteBasis ?? 'annual-total';
  const rawUsd = quote?.mprimaext ?? 0;
  const rawVes = quote?.mprima ?? 0;

  let annualUsd: number;
  let annualVes: number;
  let installmentUsd: number;
  let installmentVes: number;

  if (basis === 'per-installment') {
    installmentUsd = rawUsd;
    installmentVes = rawVes;
    annualUsd = rawUsd * cuotas;
    annualVes = rawVes * cuotas;
  } else {
    annualUsd = rawUsd;
    annualVes = rawVes;
    installmentUsd = cuotas > 0 ? rawUsd / cuotas : rawUsd;
    installmentVes = cuotas > 0 ? rawVes / cuotas : rawVes;
  }

  return {
    cuotas,
    annualUsd,
    annualVes,
    installmentUsd,
    installmentVes,
    periodSuffix: getFrecuenciaPeriodSuffix(frecuenciaCode),
    paySummary: getFrecuenciaPaySummary(frecuenciaCode, options?.frecuenciaLabel),
  };
}

/** Código de frecuencia activo según producto del wizard. */
export function resolveWizardFrecuenciaCode(
  hasVehicle: boolean,
  rcvFrecuencia?: string,
  funeralFrecuencia?: string,
): string {
  return normalizeFrecuenciaCode(hasVehicle ? rcvFrecuencia : funeralFrecuencia);
}

/** Binacional o frecuencia D: el SP cotiza el periodo (ndias), no la prima anual. */
export function rcvQuoteUsesPeriodPremium(
  tipoPlaca?: string | null,
  frecuenciaCode?: string | null,
): boolean {
  if (tipoPlaca === 'binacional') return true;
  return normalizeFrecuenciaCode(frecuenciaCode) === 'D';
}

export function resolveRcvQuoteBasis(
  tipoPlaca?: string | null,
  frecuenciaCode?: string | null,
): 'annual-total' | 'per-installment' {
  return rcvQuoteUsesPeriodPremium(tipoPlaca, frecuenciaCode)
    ? 'per-installment'
    : 'annual-total';
}

/** Solo recotizar al cambiar frecuencia cuando la vigencia del SP cambia. */
export function rcvQuoteIncludesFrecuenciaSig(
  tipoPlaca?: string | null,
  frecuenciaCode?: string | null,
): boolean {
  return rcvQuoteUsesPeriodPremium(tipoPlaca, frecuenciaCode);
}
