export type DocType = 'cedula' | 'licencia' | 'certificado' | 'rif';

export type DocStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface DocumentFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

export interface OcrResult {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  fechaNacimiento?: string;
  sexo?: string;
  estadoCivil?: string;
  numeroLicencia?: string;
  categoria?: string;
  vencimiento?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  año?: string;
  serial?: string;
  color?: string;
  rif?: string;
  razonSocial?: string | null;
}

export interface DocumentState {
  status: DocStatus;
  progress: number;
  file?: DocumentFile;
  ocr?: OcrResult;
  error?: string;
}

export type TomadorData = {
  tipoDoc: string;
  identificacion: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  email2: string;
  fechaNac: string;
  sexo: string;
  estadoCivil: string;
  estado: string;
  ciudad: string;
  direccion: string;
  /** Código numérico La Mundial del estado (cestado). Se obtiene del selector de catálogo. */
  cestado?: number;
  /** Código numérico La Mundial de la ciudad (cciudad). Se obtiene del selector de catálogo. */
  cciudad?: number;
};

export type PersonData = {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc?: string;
  fechaNac?: string;
  parentesco?: string;
  licencia?: string;
  relacion?: string;
  telefono?: string;
  email?: string;
};

export interface Plan {
  name: string;
  price: string;
  priceNum: number;
  tag: string;
  desc: string;
  benefits: string[];
  /** Suma asegurada (USD) — máximo cubierto por la póliza */
  sumaAsegurada: number;
  /** Sufijo opcional para la suma asegurada (ej. "/unidad") */
  sumaAseguradaUnit?: string;
}

export type PaymentMethod = 'card' | 'transfer' | 'mobile' | 'otp';

export interface VehicleData {
  placa: string;
  /** Tipo de placa: nacional (formato venezolano AAA000A/AAA000) o extranjera. */
  tipoPlaca: 'nacional' | 'extranjera';
  marca: string;   // nombre descriptivo (ej. "TOYOTA") — para display
  modelo: string;  // nombre descriptivo (ej. "COROLLA") — para display
  año: string;
  color: string;
  serial: string;
  uso: string;
  /** Código INMA de marca (ej. "074") — set al elegir en selector de catálogo */
  cmarca?: string;
  /** Código INMA de modelo (ej. "005") — set al elegir en selector de catálogo */
  cmodelo?: string;
  /** Código INMA de versión (ej. "05") — set al elegir en selector de catálogo */
  cversion?: string;
  /** Código La Mundial de categoría de uso (numérico) — set por getCategoriasUso al elegir versión */
  ccategoria_uso?: number | string;
  /** Etiqueta legible de la categoría de uso (ej. "Auto particular") — para display */
  xcategoria_uso?: string;
}

export interface PolicyQuote {
  /** Prima anual en bolivares (VES). */
  mprima: number;
  /** Prima anual en dolares (USD). */
  mprimaext: number;
  /** Tasa de cambio Bs/USD usada en la cotizacion. */
  ptasa: number;
  /** Etiqueta legible del vehiculo cotizado (ej. "TOYOTA / COROLLA"). */
  vehicleLabel?: string;
  /** Indica si La Mundial uso el catalogo por defecto (vehiculo no encontrado). */
  vehicleFallback?: boolean;
}

export type QuoteState = 'idle' | 'loading' | 'ready' | 'error';

export interface IssuedPolicy {
  /** Numero de poliza La Mundial (ej. "18-1-0000048127"). Tambien expuesto como `number`. */
  number: string;
  cnpoliza: string;
  /** Numero de recibo La Mundial (ej. "18-100143232"). */
  cnrecibo?: string;
  /** URL al PDF emitido por La Mundial. */
  urlpoliza?: string;
  /** Identificador interno (no es el numero oficial). */
  internalPolicyId?: string;
  ncuota?: number;
  emittedAt: string;
  quote?: PolicyQuote;
}

export interface WizardState {
  step: number;
  documents: Record<DocType, DocumentState>;
  ocrDone: boolean;
  tomador: TomadorData;
  sameInsured: boolean;
  asegurado: PersonData;
  /** True cuando quien rellena el formulario NO es quien va a pagar la póliza. */
  differentPayer: boolean;
  /** Datos del pagador alternativo cuando differentPayer = true. */
  pagador: PersonData;
  hasBeneficiary: boolean;
  beneficiario: PersonData;
  hasDriver: boolean;
  conductor: PersonData;
  vehicle: VehicleData;
  category: string;
  selectedPlan: Plan | null;
  paymentMethod: PaymentMethod;
  policy: IssuedPolicy | null;
  /** Cotizacion vigente desde La Mundial (mprima/mprimaext/ptasa). */
  quote: PolicyQuote | null;
  /** Estado de la cotizacion para feedback en UI. */
  quoteState: QuoteState;
  /** Mensaje de error de la cotizacion (si quoteState === 'error'). */
  quoteError: string | null;
  /** Snapshot del vehiculo con el que se hizo la ultima cotizacion. Sirve para
   *  invalidar la quote si cambian datos relevantes (placa, marca, modelo, año, uso). */
  quoteVehicleSignature: string | null;
}
