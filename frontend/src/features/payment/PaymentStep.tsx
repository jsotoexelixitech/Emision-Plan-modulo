import { useEffect, useRef, useState } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input } from '../../components/ui/FormField';
import { BankSearchSelect } from '../../components/ui/BankSearchSelect';
import type { PaymentMethod } from '../../types';
import {
  Smartphone, Lock, ShieldCheck, KeyRound,
  Check, Receipt, Sparkles, Loader2, BadgeCheck, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Send, ClipboardCheck,
} from 'lucide-react';
import { formatUsdShort, vesAnnual } from '../../lib/money';
import {
  verifyMobilePayment,
  MobilePaymentVerifyError,
  type VerifyMobilePaymentResponse,
  sypagoRequestOtp,
  sypagoConfirmOtp,
  type SypagoOtpConfirmResponse,
  SypagoError,
} from '../../lib/api';

// ── Lista completa de 26 bancos venezolanos (fuente: sudeban / notilogia 2026)
// Ordenados alfabéticamente. Etiquetas cortas para que no desborden el <select>.
const BANCOS_MOVIL: { code: string; label: string }[] = [
  { code: '0156', label: '100% Banco'                    },
  { code: '0171', label: 'Banco Activo'                  },
  { code: '0166', label: 'Banco Agrícola de Venezuela'   },
  { code: '0175', label: 'Banco Bicentenario del Pueblo' },
  { code: '0128', label: 'Banco Caroní'                  },
  { code: '0114', label: 'Bancaribe'                     },
  { code: '0163', label: 'Banco del Tesoro'              },
  { code: '0102', label: 'Banco de Venezuela (BDV)'      },
  { code: '0115', label: 'Banco Exterior'                },
  { code: '0177', label: 'BANFANB'                       },
  { code: '0146', label: 'BANGENTE'                      },
  { code: '0173', label: 'Banco Internacional de Des.'   },
  { code: '0105', label: 'Banco Mercantil'               },
  { code: '0138', label: 'Banco Plaza'                   },
  { code: '0108', label: 'Banco Provincial (BBVA)'       },
  { code: '0104', label: 'Venezolano de Crédito (BVC)'   },
  { code: '0172', label: 'Bancamiga'                     },
  { code: '0168', label: 'Bancrecer'                     },
  { code: '0134', label: 'Banesco'                       },
  { code: '0174', label: 'Banplus'                       },
  { code: '0191', label: 'BNC'                           },
  { code: '0157', label: 'DelSur'                        },
  { code: '0151', label: 'Fondo Común'                   },
  { code: '0601', label: 'IMCP'                          },
  { code: '0169', label: 'Mi Banco'                      },
  { code: '0137', label: 'Sofitasa'                      },
];

const PAYMENT_OPTIONS: {
  method: PaymentMethod;
  label: string;
  sub: string;
  Icon: React.ElementType;
}[] = [
  // { method: 'transfer', label: 'Transferencia',  sub: 'Referencia bancaria',     Icon: Building2  },
  { method: 'mobile',   label: 'Pago móvil',     sub: 'Banco Activo · Verificación automática', Icon: Smartphone },
  { method: 'otp',      label: 'Débito OTP',     sub: 'SyPago · Débito directo', Icon: KeyRound   },
];

type VerifyStatus = 'idle' | 'loading' | 'success' | 'failed' | 'error';
type OtpStep = 'form' | 'requesting' | 'awaiting_otp' | 'confirming' | 'done' | 'error';

const TODAY_ISO = new Date().toISOString().split('T')[0];

export function PaymentStep() {
  const { paymentMethod, setPaymentMethod, selectedPlan, quote, quoteState } = useWizardStore();

  // ── Campos compartidos ────────────────────────────────────────────────
  const [bankCode,    setBankCode]    = useState('');
  const [bankLabel,   setBankLabel]   = useState('');

  // ── Pago móvil (Meritop) ──────────────────────────────────────────────
  const [telefonoPago, setTelPago]   = useState('');
  const [montoPagoM,   setMontoM]    = useState('');
  const [fechaPagoM,   setFechaM]    = useState('');
  const [horaPagoM,    setHoraM]     = useState('');

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyResult, setVerifyResult] = useState<VerifyMobilePaymentResponse | null>(null);
  const [verifyError,  setVerifyError]  = useState<string>('');

  // ── SyPago Débito OTP ─────────────────────────────────────────────────
  const [otpDocType,   setOtpDocType]   = useState('V');
  const [otpDocNum,    setOtpDocNum]    = useState('');
  const [otpName,      setOtpName]      = useState('');
  const [otpBankCode,  setOtpBankCode]  = useState('');
  const [otpPhone,     setOtpPhone]     = useState('');
  const [otpAmount,    setOtpAmount]    = useState('');
  const [otpCode,      setOtpCode]      = useState('');
  const [otpStep,      setOtpStep]      = useState<OtpStep>('form');
  const [otpError,     setOtpError]     = useState('');
  const [otpResult,    setOtpResult]    = useState<SypagoOtpConfirmResponse | null>(null);
  // otpSubmitted: true después del primer intento de "Solicitar OTP"
  const [otpSubmitted, setOtpSubmitted] = useState(false);
  const [otpCooldown,  setOtpCooldown]  = useState(0); // segundos restantes para reenvío

  // Latch síncrono para evitar doble-click en "Confirmar pago".
  // useRef garantiza que el bloqueo ocurre ANTES del siguiente render,
  // a diferencia de setState que necesita un ciclo para propagarse.
  const confirmInFlight = useRef(false);

  // Resetear estados al cambiar método de pago
  useEffect(() => {
    setVerifyStatus('idle');
    setVerifyResult(null);
    setVerifyError('');
    setOtpStep('form');
    setOtpError('');
    setOtpResult(null);
    setOtpCode('');
    setOtpSubmitted(false);
    setOtpCooldown(0);
    confirmInFlight.current = false;
  }, [paymentMethod]);

  // Sincroniza el monto en Bs con la cotización oficial cada vez que cambia.
  // No es editable por el usuario: es el monto exacto a pagar (prima anual a tasa BCV).
  // Esto evita que el cliente coloque un monto menor al cotizado.
  useEffect(() => {
    if (quoteState !== 'ready' || !quote) return;
    const vesStr = vesAnnual(quote).toFixed(2);
    setMontoM(vesStr);
    setOtpAmount(vesStr);
  }, [quoteState, quote]);

  // Countdown para reenvío de OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = window.setTimeout(() => setOtpCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [otpCooldown]);

  // Si el store quedó con un método legacy ('card' / 'transfer' que ya no se
  // ofrecen en PAYMENT_OPTIONS), redirigimos a 'mobile' para evitar pantalla
  // vacía. Esto puede ocurrir si el usuario tenía estado previo persistido o
  // si el flujo cambió entre versiones.
  useEffect(() => {
    if (paymentMethod === 'card' || paymentMethod === 'transfer') {
      setPaymentMethod('mobile');
    }
  }, [paymentMethod, setPaymentMethod]);

  const isLoadingQuote = quoteState === 'loading';
  const hasRealQuote   = quoteState === 'ready' && Boolean(quote);
  const isQuoteError   = quoteState === 'error';

  const annualUsd = hasRealQuote ? quote!.mprimaext      : (selectedPlan?.priceNum ?? 0) * 12;
  const annualVes = hasRealQuote ? vesAnnual(quote)       : 0;

  // ── Validaciones transferencia ──────────────────────────────────────
  // ── Validaciones pago móvil (Meritop) ─────────────────────────────
  const movErrors = {
    banco    : !bankCode                                          ? 'Selecciona el banco'                : '',
    telefono : telefonoPago.length > 0 && !/^04\d{9}$/.test(telefonoPago) ? 'Formato inválido: 04XXXXXXXXX' : !telefonoPago ? 'El teléfono es obligatorio' : '',
    monto    : !montoPagoM                                        ? 'El monto es obligatorio'            : isNaN(parseFloat(montoPagoM)) || parseFloat(montoPagoM) <= 0 ? 'Monto inválido' : '',
    fecha    : !fechaPagoM                                        ? 'La fecha es obligatoria'            : '',
    hora     : !horaPagoM                                        ? 'La hora es obligatoria'             : '',
  };
  const pagoMovilListo = Object.values(movErrors).every(e => !e) && telefonoPago.length === 11;

  // ── Función verificar pago móvil ─────────────────────────────────────
  async function handleVerificar() {
    if (!pagoMovilListo) return;
    setVerifyStatus('loading');
    setVerifyResult(null);
    setVerifyError('');

    const paidOn = `${fechaPagoM}T${horaPagoM}:00`;

    try {
      const result = await verifyMobilePayment({
        sourcePhoneNumber : telefonoPago,
        bankCode,
        amount            : parseFloat(montoPagoM),
        paidOn,
      });

      setVerifyResult(result);
      setVerifyStatus(result.isVerified ? 'success' : 'failed');
    } catch (err) {
      const msg = err instanceof MobilePaymentVerifyError
        ? err.message
        : 'Error inesperado al verificar el pago.';
      setVerifyError(msg);
      setVerifyStatus('error');
    }
  }

  // ── Validaciones OTP (SyPago) ─────────────────────────────────────────
  // Mismo patrón que pago móvil: errores de formato mientras escribe,
  // errores de campo vacío visibles siempre (sin gate de "touched").
  const otpErrors = {
    docNum : otpDocNum.length > 0 && !/^\d{5,10}$/.test(otpDocNum)
               ? 'Solo dígitos, entre 5 y 10 caracteres'
               : !otpDocNum ? 'Número de documento obligatorio' : '',

    name   : otpName.length > 0 && otpName.trim().split(/\s+/).filter(Boolean).length < 2
               ? 'Ingresa nombre y apellido'
               : !otpName.trim() ? 'Nombre obligatorio' : '',

    bank   : !otpBankCode ? 'Selecciona el banco' : '',

    phone  : otpPhone.length > 0 && !/^04\d{9}$/.test(otpPhone)
               ? 'Formato inválido: 04XXXXXXXXX'
               : !otpPhone ? 'Teléfono obligatorio' : '',

    amount : otpAmount.length > 0 && (isNaN(parseFloat(otpAmount)) || parseFloat(otpAmount) <= 0)
               ? 'Ingresa un monto válido'
               : !otpAmount ? 'Monto obligatorio' : '',
  };
  const otpFormListo = !Object.values(otpErrors).some(e => e);

  async function handleOtpRequest() {
    setOtpSubmitted(true);
    if (!otpFormListo) return;

    setOtpStep('requesting');
    setOtpError('');

    let succeeded = false;
    try {
      const resp = await sypagoRequestOtp({
        documentType  : otpDocType,
        documentNumber: otpDocNum,
        debtorBankCode: otpBankCode,
        debtorPhone   : otpPhone,
        amount        : parseFloat(otpAmount),
      });
      if (resp && resp.success === false) {
        throw new SypagoError({ message: resp.message || 'Error al solicitar OTP.', code: 'SYPAGO_ERROR' });
      }
      succeeded = true;
    } catch (err) {
      setOtpError(err instanceof SypagoError ? err.message : 'Error al solicitar OTP.');
      setOtpStep('error');
    }

    if (succeeded) {
      setOtpStep('awaiting_otp');
      setOtpCooldown(60); // 60 s antes de poder reenviar
    }
  }

  async function handleOtpConfirm() {
    if (!otpCode.trim()) return;

    // Bloqueo síncrono — impide que dos clicks simultáneos pasen al mismo tiempo
    if (confirmInFlight.current) return;
    confirmInFlight.current = true;

    setOtpStep('confirming');
    setOtpError('');
    try {
      const result = await sypagoConfirmOtp({
        documentType  : otpDocType,
        documentNumber: otpDocNum,
        debtorBankCode: otpBankCode,
        debtorPhone   : otpPhone,
        debtorName    : otpName,
        amount        : parseFloat(otpAmount),
        otp           : otpCode.trim(),
        concept       : 'Prima de seguro RCV - La Mundial',
      });
      setOtpResult(result);
      setOtpStep('done');
      // Latch queda activo en 'done' — no se puede volver a confirmar
    } catch (err) {
      setOtpError(err instanceof SypagoError ? err.message : 'Error al confirmar pago.');
      setOtpStep('error');
      // Liberar latch solo en error para permitir reintentar
      confirmInFlight.current = false;
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <p className="text-slate-500 text-sm leading-relaxed -mt-2">
        Confirma el método de pago y emite la póliza. La operación está cifrada de extremo a extremo.
      </p>

      {/* Total bar */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-violet-50/40 to-fuchsia-50/30 p-5 flex items-center justify-between flex-wrap gap-4 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 relative min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 grid place-items-center text-white shadow-[0_8px_22px_rgba(15,26,90,0.32)] shrink-0">
            <Receipt size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-black tracking-widest text-indigo-600 uppercase mb-0.5">
              Total a pagar (prima anual)
            </p>
            <p className="font-display font-bold text-slate-900 text-sm truncate">
              {selectedPlan?.name ?? 'Plan no seleccionado'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {hasRealQuote && !quote?.vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wider">
                  <BadgeCheck size={9} strokeWidth={2.4} /> Tarifa La Mundial
                </span>
              )}
              {hasRealQuote && quote?.vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 uppercase tracking-wider">
                  <AlertTriangle size={9} strokeWidth={2.4} /> Tarifa estimada
                </span>
              )}
              {isQuoteError && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200 uppercase tracking-wider">
                  <AlertTriangle size={9} strokeWidth={2.4} /> Cotización pendiente
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative text-right">
          <div className="flex items-end gap-1 justify-end">
            {isLoadingQuote && !hasRealQuote ? (
              <span className="text-3xl sm:text-4xl font-display font-black gradient-text-indigo leading-none inline-flex items-center gap-2">
                <Loader2 size={26} className="animate-spin opacity-70" />
                <span className="opacity-50">---</span>
              </span>
            ) : (
              <span className="text-3xl sm:text-4xl font-display font-black gradient-text-indigo leading-none tabular-nums">
                {formatUsdShort(annualUsd)}
              </span>
            )}
            <span className="text-xs text-slate-500 font-semibold pb-1">/ año</span>
          </div>
          {hasRealQuote && annualVes > 0 && (
            <p className="text-sm font-display font-black text-indigo-700 mt-1 tabular-nums">
              Bs {annualVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
          {hasRealQuote && quote?.ptasa && quote.ptasa > 0 && (
            <p className="text-[0.6rem] text-slate-400 mt-0.5 tabular-nums">
              Tasa BCV: {quote.ptasa.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      {/* Selector de método */}
      <div>
        <p className="text-[0.7rem] font-black text-slate-500 uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
          <Sparkles size={11} className="text-indigo-500" />
          Método de pago
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PAYMENT_OPTIONS.map(({ method, label, sub, Icon }) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`
                group relative flex items-center gap-3 p-4 rounded-2xl border text-left transition-all duration-200 overflow-hidden
                ${paymentMethod === method
                  ? 'border-2 border-indigo-500 bg-gradient-to-br from-indigo-50 to-violet-50/40 shadow-[0_12px_30px_-8px_rgba(15,26,90,0.2)] -translate-y-0.5'
                  : 'border border-slate-200 bg-white hover:border-indigo-300 hover:-translate-y-0.5'
                }
              `}
            >
              {paymentMethod === method && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-md">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 transition-all
                ${paymentMethod === method
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-500'
                }`}>
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-sm text-slate-900 leading-tight">{label}</p>
                <p className="text-[0.7rem] text-slate-500 mt-0.5">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Formularios */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Lock size={12} className="text-emerald-500" />
            <span className="font-semibold">Conexión segura · Tus datos están protegidos</span>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-[0.62rem] font-bold text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">PCI-DSS</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">SSL</span>
          </span>
        </div>

        {/* ── PAGO MÓVIL ── */}
        {paymentMethod === 'mobile' && (
          <div className="animate-fade-in space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* fila 1: banco · teléfono */}
              <Field label="Banco de origen" error={movErrors.banco}>
                <BankSearchSelect
                  options={BANCOS_MOVIL}
                  value={bankCode}
                  onChange={(code) => {
                    const found = BANCOS_MOVIL.find(b => b.code === code);
                    setBankCode(code);
                    setBankLabel(found?.label ?? '');
                    setVerifyStatus('idle');
                  }}
                />
              </Field>

              <Field label="Teléfono de origen" hint="Número que realizó el pago" error={movErrors.telefono}>
                <Input
                  value={telefonoPago}
                  onChange={(e) => { setTelPago(e.target.value.replace(/\D/g, '').slice(0, 11)); setVerifyStatus('idle'); }}
                  placeholder="04121234567"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                />
              </Field>

              {/* fila 2: fecha · hora */}
              <Field label="Fecha del pago" error={movErrors.fecha}>
                <Input
                  type="date"
                  value={fechaPagoM}
                  onChange={(e) => { setFechaM(e.target.value); setVerifyStatus('idle'); }}
                  max={TODAY_ISO}
                />
              </Field>

              <Field label="Hora del pago" hint="Hora aproximada" error={movErrors.hora}>
                <Input
                  type="time"
                  value={horaPagoM}
                  onChange={(e) => { setHoraM(e.target.value); setVerifyStatus('idle'); }}
                />
              </Field>

              {/* fila 3: monto (ancho completo) — bloqueado cuando hay cotización oficial */}
              <Field
                label="Monto a pagar (Bs)"
                hint={
                  hasRealQuote
                    ? 'Monto exacto según cotización oficial · no editable'
                    : isLoadingQuote
                    ? 'Calculando monto en bolívares desde la cotización...'
                    : 'Esperando cotización para calcular el monto'
                }
                error={movErrors.monto}
                full
              >
                <Input
                  value={montoPagoM}
                  onChange={(e) => {
                    if (hasRealQuote) return; // bloqueado si hay cotización oficial
                    setMontoM(e.target.value.replace(/[^0-9.]/g, ''));
                    setVerifyStatus('idle');
                  }}
                  placeholder="198114.50"
                  inputMode="decimal"
                  readOnly={hasRealQuote}
                  className={hasRealQuote ? 'bg-slate-50 text-slate-700 font-bold cursor-not-allowed' : ''}
                />
              </Field>
            </div>

            {/* Botón verificar */}
            <button
              type="button"
              disabled={!pagoMovilListo || verifyStatus === 'loading'}
              onClick={handleVerificar}
              className={`
                w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                ${verifyStatus === 'success'
                  ? 'bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)]'
                  : verifyStatus === 'failed' || verifyStatus === 'error'
                  ? 'bg-rose-500 text-white'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:shadow-[0_12px_28px_rgba(79,70,229,0.45)] hover:-translate-y-0.5 active:translate-y-0'
                }
              `}
            >
              {verifyStatus === 'loading' && <Loader2 size={16} className="animate-spin" />}
              {verifyStatus === 'success' && <CheckCircle2 size={16} />}
              {(verifyStatus === 'failed' || verifyStatus === 'error') && <XCircle size={16} />}
              {verifyStatus === 'idle'    && <Smartphone size={16} />}

              {verifyStatus === 'loading' ? 'Verificando con Banco Activo...' :
               verifyStatus === 'success' ? 'Pago verificado correctamente' :
               verifyStatus === 'failed'  ? 'Pago no encontrado · Reintentar' :
               verifyStatus === 'error'   ? 'Error · Reintentar' :
               'Verificar pago móvil'}

              {(verifyStatus === 'failed' || verifyStatus === 'error') && (
                <RefreshCw size={13} className="ml-1 opacity-80" />
              )}
            </button>

            {/* Resultado de la verificación */}
            {verifyStatus === 'success' && verifyResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
                    <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 mb-2">Pago verificado por Banco Activo</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {verifyResult.reference && (
                        <>
                          <dt className="text-slate-500 font-semibold">Referencia</dt>
                          <dd className="font-mono font-bold text-slate-800">{verifyResult.reference}</dd>
                        </>
                      )}
                      {verifyResult.verifiedAmount != null && (
                        <>
                          <dt className="text-slate-500 font-semibold">Monto verificado</dt>
                          <dd className="font-bold text-emerald-700">
                            Bs {verifyResult.verifiedAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </dd>
                        </>
                      )}
                      {verifyResult.verifiedOn && (
                        <>
                          <dt className="text-slate-500 font-semibold">Fecha confirmada</dt>
                          <dd className="text-slate-700">
                            {new Date(verifyResult.verifiedOn).toLocaleString('es-VE', {
                              dateStyle: 'medium', timeStyle: 'short',
                            })}
                          </dd>
                        </>
                      )}
                      <dt className="text-slate-500 font-semibold">Banco</dt>
                      <dd className="text-slate-700">{bankLabel}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {verifyStatus === 'failed' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Pago no encontrado</p>
                  <p className="text-xs text-amber-700 mt-1">
                    {verifyResult?.message || 'No se encontró el pago con los datos proporcionados.'}
                    {' '}Verifica el teléfono, banco, monto y hora, y vuelve a intentarlo.
                  </p>
                </div>
              </div>
            )}

            {verifyStatus === 'error' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 animate-fade-in flex items-start gap-3">
                <XCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-rose-800">Error al verificar</p>
                  <p className="text-xs text-rose-700 mt-1">{verifyError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DÉBITO OTP (SyPago) ── */}
        {paymentMethod === 'otp' && (
          <div className="animate-fade-in space-y-5">

            {/* Paso 1: formulario */}
            {(otpStep === 'form' || otpStep === 'requesting' || otpStep === 'error') && (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ingresa los datos del pagador. El banco le enviará una clave OTP por SMS o notificación push.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* fila 1: documento · nombre */}
                  <Field label="Documento del pagador" hint="Tipo y número de cédula"
                    error={otpErrors.docNum}>
                    <div className="flex gap-2 w-full">
                      {/* Selector de tipo — ancho fijo, legible en móvil */}
                      <select
                        value={otpDocType}
                        onChange={(e) => setOtpDocType(e.target.value)}
                        className="w-[4.5rem] shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                      >
                        {['V','E','J','G','P'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <Input
                        value={otpDocNum}
                        onChange={(e) => setOtpDocNum(e.target.value.replace(/\D/g, ''))}
                        placeholder="12345678"
                        inputMode="numeric"
                        maxLength={10}
                        className="flex-1 min-w-0"
                      />
                    </div>
                  </Field>

                  <Field label="Nombre completo" error={otpErrors.name}
                    hint="Nombre y apellido">
                    <Input
                      value={otpName}
                      onChange={(e) => setOtpName(e.target.value)}
                      placeholder="Juan Pérez"
                    />
                  </Field>

                  {/* fila 2: banco · teléfono */}
                  <Field label="Banco del pagador" error={otpErrors.bank}>
                    <BankSearchSelect
                      options={BANCOS_MOVIL}
                      value={otpBankCode}
                      onChange={setOtpBankCode}
                    />
                  </Field>

                  <Field label="Teléfono del pagador" hint="04XX · número en el banco"
                    error={otpErrors.phone}>
                    <Input
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="04141234567"
                      type="tel"
                      inputMode="numeric"
                      maxLength={11}
                    />
                  </Field>

                  {/* fila 3: monto (ancho completo) — bloqueado cuando hay cotización oficial */}
                  <Field
                    label="Monto a debitar (Bs)"
                    hint={
                      hasRealQuote
                        ? 'Monto exacto según cotización oficial · no editable'
                        : isLoadingQuote
                        ? 'Calculando monto en bolívares desde la cotización...'
                        : 'Esperando cotización para calcular el monto'
                    }
                    error={otpErrors.amount}
                    full
                  >
                    <Input
                      value={otpAmount}
                      onChange={(e) => {
                        if (hasRealQuote) return; // bloqueado si hay cotización oficial
                        setOtpAmount(e.target.value.replace(/[^0-9.]/g, ''));
                      }}
                      placeholder="198114.50"
                      inputMode="decimal"
                      readOnly={hasRealQuote}
                      className={hasRealQuote ? 'bg-slate-50 text-slate-700 font-bold cursor-not-allowed' : ''}
                    />
                  </Field>
                </div>

                {(otpStep === 'error') && otpError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5 animate-fade-in">
                    <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 font-medium">{otpError}</p>
                  </div>
                )}

                {otpSubmitted && !otpFormListo && otpStep !== 'error' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 animate-fade-in">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">Completa todos los campos correctamente para solicitar la OTP.</p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={otpStep === 'requesting'}
                  onClick={handleOtpRequest}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:shadow-[0_12px_28px_rgba(79,70,229,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {otpStep === 'requesting'
                    ? <><Loader2 size={16} className="animate-spin" /> Enviando OTP al banco...</>
                    : <><Send size={16} /> Solicitar OTP</>
                  }
                </button>
              </>
            )}

            {/* Paso 2: ingresar OTP */}
            {(otpStep === 'awaiting_otp' || otpStep === 'confirming') && (
              <div className="space-y-4 animate-fade-in">
                {/* Banner de instrucción */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500 grid place-items-center shrink-0 shadow-md">
                    <Smartphone size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Clave OTP enviada</p>
                    <p className="text-xs text-indigo-600 mt-1">
                      El banco ha enviado una clave de un solo uso al teléfono <span className="font-mono font-bold">{otpPhone}</span>.
                      Ingrésala a continuación para autorizar el débito.
                    </p>
                  </div>
                </div>

                <Field label="Clave OTP" hint="La clave de 6 u 8 dígitos que recibiste por SMS o notificación">
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={8}
                    className="text-center tracking-[0.5em] text-xl font-bold"
                  />
                </Field>

                {otpCode.length > 0 && otpCode.length < 6 && (
                  <p className="text-xs text-amber-600 font-medium -mt-2">
                    La clave OTP debe tener al menos 6 dígitos.
                  </p>
                )}

                {/* Reenviar OTP con countdown */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">
                    {otpCooldown > 0
                      ? <>¿No recibiste el código? Puedes reenviarlo en <span className="font-bold text-slate-700 tabular-nums">{otpCooldown}s</span></>
                      : <>¿No recibiste el código?</>
                    }
                  </div>
                  <button
                    type="button"
                    disabled={otpCooldown > 0 || otpStep === 'confirming'}
                    onClick={async () => {
                      setOtpCode('');
                      await handleOtpRequest();
                    }}
                    className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:border-indigo-300 enabled:text-indigo-600 enabled:hover:bg-indigo-50"
                  >
                    <RefreshCw size={12} /> Reenviar código
                  </button>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => { setOtpStep('form'); setOtpCode(''); setOtpSubmitted(false); setOtpCooldown(0); }}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors"
                  >
                    <RefreshCw size={14} /> Cambiar datos
                  </button>
                  <button
                    type="button"
                    disabled={otpCode.length < 6 || otpStep === 'confirming' || confirmInFlight.current}
                    onClick={handleOtpConfirm}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {otpStep === 'confirming'
                      ? <><Loader2 size={16} className="animate-spin" /> Autorizando débito...</>
                      : <><ClipboardCheck size={16} /> Confirmar pago</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Paso 3: éxito */}
            {otpStep === 'done' && otpResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.4)]">
                    <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 mb-2">
                      {otpResult.mock ? 'Pago autorizado [MODO PRUEBA]' : 'Débito autorizado por SyPago'}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <dt className="text-slate-500 font-semibold">ID de transacción</dt>
                      <dd className="font-mono font-bold text-slate-800 truncate">{otpResult.transaction_id}</dd>
                      <dt className="text-slate-500 font-semibold">Pagador</dt>
                      <dd className="text-slate-700">{otpName}</dd>
                      <dt className="text-slate-500 font-semibold">Monto</dt>
                      <dd className="font-bold text-emerald-700">
                        Bs {parseFloat(otpAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </dd>
                    </dl>
                    <p className="text-[0.65rem] text-emerald-600/70 mt-2">
                      El resultado definitivo se recibirá vía webhook. Puedes continuar a emitir la póliza.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-6 flex-wrap pt-2 text-[0.7rem] text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span className="font-semibold">Datos protegidos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lock size={13} className="text-emerald-500" />
          <span className="font-semibold">Pago cifrado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Check size={13} className="text-emerald-500" />
          <span className="font-semibold">Sin cargos ocultos</span>
        </div>
      </div>
    </div>
  );
}
