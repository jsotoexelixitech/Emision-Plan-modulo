/** Visibilidad de canal (nest-api GET /canal/visibility). */
export type MetodoPagoExelixi =
  | 'mobile'
  | 'otp'
  | 'domiciliacion'
  | 'mobile_bancamiga'
  | 'ubii';

export type TipoEmisionCanal =
  | 'emit'
  | 'emit_pay'
  | 'emit_libre_pago'
  | 'emit_convenio'
  | 'emit_garage_plus';

export interface CanalVisibilityUi {
  mostrarPasoPago: boolean;
  requierePagoVerificado: boolean;
  metodosPago: MetodoPagoExelixi[];
  planesPermitidos: string[];
}

export interface CanalVisibility {
  centidad: string;
  citem: string;
  ccanalalt?: number | null;
  cscanalalt?: number | null;
  cproducto?: string;
  cramo?: number;
  tipoEmision: TipoEmisionCanal | string | null;
  tipoPago: string[];
  planes: Array<{
    cplan: string;
    cramo: number;
    xplan?: string;
    cproducto?: string;
  }>;
  ui: CanalVisibilityUi;
}

export function shouldRequirePaymentVerification(
  canalVisibility: CanalVisibility | null | undefined,
): boolean | null {
  if (!canalVisibility?.ui) return null;
  if (!canalVisibility.ui.mostrarPasoPago) return false;
  return canalVisibility.ui.requierePagoVerificado;
}

export function shouldShowPaymentStep(
  canalVisibility: CanalVisibility | null | undefined,
): boolean | null {
  if (!canalVisibility?.ui) return null;
  return canalVisibility.ui.mostrarPasoPago;
}

export function labelTipoEmision(tipo: string | null | undefined): string | null {
  switch (tipo) {
    case 'emit': return 'Emisión pendiente';
    case 'emit_pay': return 'Emisión paga';
    case 'emit_libre_pago': return 'Emisión libre pago';
    case 'emit_convenio': return 'Emisión convenio';
    case 'emit_garage_plus': return 'Emisión + Garage Plus';
    default: return null;
  }
}
