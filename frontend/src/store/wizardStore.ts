import { create } from 'zustand';
import type {
  WizardState,
  DocType,
  DocumentState,
  TomadorData,
  PersonData,
  VehicleData,
  Plan,
  PaymentMethod,
  IssuedPolicy,
  PolicyQuote,
  QuoteState,
} from '../types';

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
  uso: 'Particular',
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
  setCategory: (c: string) => void;
  setSelectedPlan: (plan: Plan | null) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setPolicy: (p: IssuedPolicy) => void;
  setQuote: (q: PolicyQuote, vehicleSignature: string) => void;
  setQuoteState: (s: QuoteState, error?: string | null) => void;
  clearQuote: () => void;
  reset: () => void;
}

const initialState: WizardState = {
  step: 1,
  documents: {
    cedula: defaultDoc(),
    licencia: defaultDoc(),
    certificado: defaultDoc(),
    rif: defaultDoc(),
  },
  ocrDone: false,
  tomador: defaultTomador(),
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
  // 'mobile' (Pago Móvil vía Banco Activo) es el método activo por defecto.
  // 'transfer' está oculto en la UI por ahora; se mantendrá el tipo para compat.
  paymentMethod: 'mobile',
  policy: null,
  quote: null,
  quoteState: 'idle',
  quoteError: null,
  quoteVehicleSignature: null,
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
      // Incluimos cmarca/cmodelo/cversion para que el cambio de selector INMA también invalide.
      const sigKeys: (keyof VehicleData)[] = ['placa', 'marca', 'modelo', 'año', 'uso', 'cmarca', 'cmodelo', 'cversion', 'ccategoria_uso'];
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

  reset: () => set(initialState),
}));

// Exposición controlada al objeto global para tests E2E (Playwright).
// Solo se activa cuando el frontend corre en modo desarrollo (vite dev) o
// cuando explícitamente se setea VITE_E2E_EXPOSE_STORE=1 en el build.
// En producción NO se expone para evitar manipulación externa del estado.
if (
  typeof window !== 'undefined' &&
  (import.meta.env?.DEV || import.meta.env?.VITE_E2E_EXPOSE_STORE === '1')
) {
  (window as unknown as Record<string, unknown>).__wizardStore = useWizardStore;
}
