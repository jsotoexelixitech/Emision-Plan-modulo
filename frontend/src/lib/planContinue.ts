import type { PolicyQuote, QuoteState } from '../types';
import type { Plan } from '../types';
import { toast } from '../store/toastStore';

/** Validación común antes de confirmar plan (RCV y funerario). */
export function validatePlanReady(
  category: string,
  selectedPlan: Plan | null,
  quoteState: QuoteState,
  quote: PolicyQuote | null,
): boolean {
  if (!category || !selectedPlan) {
    toast.warning('Selecciona un plan', 'Elige una categoría y un plan para continuar.');
    return false;
  }
  if (quoteState === 'loading') {
    toast.warning('Cotización en proceso', 'Por favor espera mientras calculamos la prima...', 3000);
    return false;
  }
  if (!quote && quoteState !== 'ready') {
    toast.warning(
      'Cotización pendiente',
      'Selecciona el plan y espera la cotización antes de continuar.',
      3000,
    );
    return false;
  }
  return true;
}
