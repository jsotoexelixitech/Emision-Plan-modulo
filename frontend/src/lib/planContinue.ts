import type { PolicyQuote, QuoteState, VehicleData } from '../types';
import type { Plan } from '../types';
import { toast } from '../store/toastStore';
import {
  DOC_LABELS,
  validateDocumentsForDiligencia,
  type DiligenciaState,
} from './diligencia';
import type { DocType } from '../types';

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

/** Bloquea avance a Pagos si faltan documentos del perfil DDS/DDC (Circular SAA-02-1079). */
export function validateRcvDocumentsBeforePagos(params: {
  documents: Partial<Record<DocType, { status?: string; ocr?: unknown }>>;
  diligencia: DiligenciaState | null;
  tomadorTipoDoc?: string;
  vehicle?: Pick<VehicleData, 'tipoPlaca'>;
}): boolean {
  const check = validateDocumentsForDiligencia(params);
  if (check.ok) return true;

  const lista = check.missing.map((d) => DOC_LABELS[d] ?? d).join(', ');
  toast.warning(
    'Documentos originales pendientes',
    check.itipo === 'C'
      ? `Para diligencia completa (DDC) procesa en OCR: ${lista}.`
      : `Procesa en OCR: ${lista}.`,
    6000,
  );
  return false;
}
