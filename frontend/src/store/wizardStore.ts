import { create } from 'zustand';
import type {
  WizardState,
  DocType,
  DocumentState,
  TomadorData,
  PersonData,
  VehicleData,
  FuneralData,
  RcvPlanData,
  Plan,
  PaymentMethod,
  IssuedPolicy,
  PolicyQuote,
  QuoteState,
} from '../types';
import { getProductId } from '../lib/product';
import { buildDiligenciaState, preClasificarDiligencia, type DiligenciaState } from '../lib/diligencia';

const defaultDoc = (): DocumentState => ({ status: 'idle', progress: 0 });

const defaultTomador = (): TomadorData => ({
  tipoDoc: 'V',
  identificacion: '',
  nombre: '',
  apellido: '',
  telefono: '',
  email: '',
  email2: '',
  fechaNac: '',
  sexo: '',
  estadoCivil: '',
  estado: '',
  ciudad: '',
  direccion: '',
  personaPoliticamenteExpuesta: false,
});

const defaultPerson = (): PersonData => ({
  nombre: '',
  apellido: '',
  identificacion: '',
  tipoDoc: 'V',
  fechaNac: '',
  parentesco: '',
  licencia: '',
  relacion: '',
  telefono: '',
  email: '',
});

const defaultVehicle = (): VehicleData => ({
  placa: '',
  tipoPlaca: 'nacional',
  marca: '',
  modelo: '',
  año: '',
  color: '',
  serial: '',
  serialMotor: '',
  ntoneladas: undefined,
  precargorcv: 0,
  uso: 'Particular',
});

const defaultRcv = (): RcvPlanData => ({
  frecuencia: 'A',
  ndias: null,
  coberAdicional: 'RC',
  coberAdicionales: [],
});

const defaultFuneral = (): FuneralData => ({
  asegurados: [{ tipoDoc: 'V', identificacion: '', nombre: '', apellido: '', fechaNac: '', sexo: '', parentesco: '1' }],
  beneficiarios: [],
  frecuencia: 'M',
  diagnosticoEnfermedad: false,
  descripcionEnfermedad: '',
  aceptaTerminos: false,
  healthAnswers: {},
  healthQuestionnaireDone: false,
});

interface WizardActions {
  goTo: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setDocState: (doc: DocType, state: Partial<DocumentState>) => void;
  setOcrDone: (done: boolean) => void;
  setTomador: (data: Partial<TomadorData>) => void;
  setSameInsured: (v: boolean) => void;
  setAsegurado: (data: Partial<PersonData>) => void;
  setDifferentPayer: (v: boolean) => void;
  setPagador: (data: Partial<PersonData>) => void;
  setHasBeneficiary: (v: boolean) => void;
  setBeneficiario: (data: Partial<PersonData>) => void;
  setHasDriver: (v: boolean) => void;
  setConductor: (data: Partial<PersonData>) => void;
  setVehicle: (data: Partial<VehicleData>) => void;
  setFuneral: (data: Partial<FuneralData>) => void;
  setRcv: (data: Partial<RcvPlanData>, options?: { keepQuote?: boolean }) => void;
  setCategory: (c: string) => void;
  setSelectedPlan: (plan: Plan | null) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setPolicy: (p: IssuedPolicy) => void;
  setQuote: (q: PolicyQuote, vehicleSignature: string) => void;
  setQuoteState: (s: QuoteState, error?: string | null) => void;
  clearQuote: () => void;
  setMetadataCanal: (data: Record<string, any> | null) => void;
  setDiligencia: (data: Partial<DiligenciaState> | null) => void;
  reset: () => void;
}

const initialState: WizardState = {
  step: 1,
  product: getProductId(),
  documents: {
    cedula: defaultDoc(),
    licencia: defaultDoc(),
    certificado: defaultDoc(),
    rif: defaultDoc(),
    pasaporte: defaultDoc(),
  },
  ocrDone: false,
  tomador: defaultTomador(),
  funeral: defaultFuneral(),
  rcv: defaultRcv(),
  sameInsured: true,
  asegurado: defaultPerson(),
  differentPayer: false,
  pagador: defaultPerson(),
  hasBeneficiary: false,
  beneficiario: defaultPerson(),
  hasDriver: false,
  conductor: defaultPerson(),
  vehicle: defaultVehicle(),
  category: '',
  selectedPlan: null,
  // 'mobile' (Pago MÃ³vil vÃ­a Banco Activo) es el mÃ©todo activo por defecto.
  // 'transfer' estÃ¡ oculto en la UI por ahora; se mantendrÃ¡ el tipo para compat.
  paymentMethod: 'mobile',
  policy: null,
  quote: null,
  quoteState: 'idle',
  quoteError: null,
  quoteVehicleSignature: null,
  metadataCanal: null,
  diligencia: buildDiligenciaState({ itipoDiligencia: 'S', clasificadoEn: 'emision' }),
};

export const useWizardStore = create<WizardState & WizardActions>()((set) => ({
  ...initialState,

  goTo: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(s.step + 1, 6) })),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),

  setDocState: (doc, state) =>
    set((s) => ({
      documents: {
        ...s.documents,
        [doc]: { ...s.documents[doc], ...state },
      },
    })),

  setOcrDone: (ocrDone) => set({ ocrDone }),

  setTomador: (data) =>
    set((s) => ({ tomador: { ...s.tomador, ...data } })),

  setSameInsured: (sameInsured) => set({ sameInsured }),

  setAsegurado: (data) =>
    set((s) => ({ asegurado: { ...s.asegurado, ...data } })),

  setDifferentPayer: (differentPayer) => set({ differentPayer }),

  setPagador: (data) =>
    set((s) => ({ pagador: { ...s.pagador, ...data } })),

  setHasBeneficiary: (hasBeneficiary) => set({ hasBeneficiary }),

  setBeneficiario: (data) =>
    set((s) => ({ beneficiario: { ...s.beneficiario, ...data } })),

  setHasDriver: (hasDriver) => set({ hasDriver }),

  setConductor: (data) =>
    set((s) => ({ conductor: { ...s.conductor, ...data } })),

  setVehicle: (data) =>
    set((s) => {
      const next = { ...s.vehicle, ...data };
      // Invalidamos quote si cambian datos relevantes para la cotizacion.
      // Incluimos cmarca/cmodelo/cversion para que el cambio de selector INMA tambiÃ©n invalide.
      const sigKeys: (keyof VehicleData)[] = [
        'placa', 'marca', 'modelo', 'año', 'uso', 'cmarca', 'cmodelo', 'cversion',
        'ccategoria_uso', 'ntoneladas', 'precargorcv', 'tipoPlaca',
      ];
      const changed = sigKeys.some((k) => s.vehicle[k] !== next[k]);
      if (changed && s.quote) {
        return {
          vehicle: next,
          quote: null,
          quoteState: 'idle',
          quoteError: null,
          quoteVehicleSignature: null,
        };
      }
      return { vehicle: next };
    }),

  setFuneral: (data) =>
    set((s) => ({ funeral: { ...s.funeral, ...data } })),

  setRcv: (data, options?: { keepQuote?: boolean }) =>
    set((s) => {
      const next = { ...s.rcv, ...data };
      if (options?.keepQuote) return { rcv: next };
      // frecuencia/ndias no invalidan quote en RCV nacional (prima anual fija).
      const sigKeys: (keyof RcvPlanData)[] = [
        'coberAdicional', 'coberAdicionales',
      ];
      const changed = sigKeys.some((k) => s.rcv[k] !== next[k]);
      if (changed && s.quote) {
        return {
          rcv: next,
          quote: null,
          quoteState: 'idle',
          quoteError: null,
          quoteVehicleSignature: null,
        };
      }
      return { rcv: next };
    }),

  setCategory: (category) => set({ category, selectedPlan: null }),

  setSelectedPlan: (selectedPlan) => set({ selectedPlan }),

  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

  setPolicy: (policy) => set({ policy }),

  setQuote: (quote, vehicleSignature) =>
    set({
      quote,
      quoteState: 'ready',
      quoteError: null,
      quoteVehicleSignature: vehicleSignature,
    }),

  setQuoteState: (quoteState, quoteError = null) =>
    set({ quoteState, quoteError }),

  clearQuote: () =>
    set({ quote: null, quoteState: 'idle', quoteError: null, quoteVehicleSignature: null }),

  setMetadataCanal: (data) => set({ metadataCanal: data }),

  setDiligencia: (data) =>
    set((s) => {
      if (data === null) {
        return {
          diligencia: buildDiligenciaState({
            itipoDiligencia: preClasificarDiligencia(s.tomador.tipoDoc),
            clasificadoEn: 'emision',
          }),
        };
      }
      const base = s.diligencia ?? buildDiligenciaState({
        itipoDiligencia: preClasificarDiligencia(s.tomador.tipoDoc),
        clasificadoEn: 'emision',
      });
      return { diligencia: { ...base, ...data } };
    }),

  reset: () => set(initialState),
}));

// ExposiciÃ³n controlada al objeto global para tests E2E (Playwright).
// Solo se activa cuando el frontend corre en modo desarrollo (vite dev) o
// cuando explÃ­citamente se setea VITE_E2E_EXPOSE_STORE=1 en el build.
// En producciÃ³n NO se expone para evitar manipulaciÃ³n externa del estado.
if (
  typeof window !== 'undefined' &&
  (import.meta.env?.DEV || import.meta.env?.VITE_E2E_EXPOSE_STORE === '1')
) {
  (window as unknown as Record<string, unknown>).__wizardStore = useWizardStore;
}
