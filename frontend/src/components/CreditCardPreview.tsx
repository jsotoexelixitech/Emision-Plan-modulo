import { Wifi } from 'lucide-react';

interface CreditCardPreviewProps {
  number?: string;
  holder?: string;
  expiry?: string;
  cvv?: string;
  flipped?: boolean;
  brand?: 'visa' | 'mastercard' | 'amex' | 'unknown';
}

function formatCardNumber(num: string): string {
  const digits = num.replace(/\D/g, '').slice(0, 19);
  const groups = digits.match(/.{1,4}/g) ?? [];
  const filled = (groups.join(' ') + ' •••• •••• •••• ••••').slice(0, 19);
  return filled;
}

function detectBrand(num: string): 'visa' | 'mastercard' | 'amex' | 'unknown' {
  const d = num.replace(/\D/g, '');
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'mastercard';
  if (/^(34|37)/.test(d)) return 'amex';
  return 'unknown';
}

function BrandLogo({ brand }: { brand: 'visa' | 'mastercard' | 'amex' | 'unknown' }) {
  if (brand === 'visa') {
    return (
      <span className="font-display font-black italic text-2xl tracking-tight text-white">
        VISA
      </span>
    );
  }
  if (brand === 'mastercard') {
    return (
      <div className="flex items-center -space-x-3">
        <span className="w-7 h-7 rounded-full bg-rose-500 opacity-90" />
        <span className="w-7 h-7 rounded-full bg-amber-400 opacity-90 mix-blend-screen" />
      </div>
    );
  }
  if (brand === 'amex') {
    return (
      <span className="font-display font-black text-base bg-white text-blue-700 px-1.5 py-0.5 rounded">
        AMEX
      </span>
    );
  }
  return (
    <span className="text-[0.62rem] text-white/50 font-bold tracking-widest uppercase">
      Card
    </span>
  );
}

export function CreditCardPreview({
  number = '',
  holder = '',
  expiry = '',
  cvv = '',
  flipped = false,
  brand,
}: CreditCardPreviewProps) {
  const detected = brand ?? detectBrand(number);
  const formatted = formatCardNumber(number);

  return (
    <div className="cc-perspective w-full max-w-[360px] mx-auto">
      <div
        className={`cc-card animate-card-float aspect-[1.586/1] ${flipped ? 'cc-flipped' : ''}`}
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {/* FRONT */}
        <div
          className={`absolute inset-0 p-5 flex flex-col justify-between ${
            flipped ? 'opacity-0' : 'opacity-100'
          } transition-opacity duration-300`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.55rem] uppercase tracking-widest text-white/60 font-bold">
                La Mundial · RCV
              </p>
              <p className="text-[0.7rem] text-white/80 font-bold mt-1">Plataforma segura</p>
            </div>
            <Wifi size={18} className="text-white/70 -rotate-90" strokeWidth={2.5} />
          </div>

          <div className="flex items-center gap-2 -mt-2">
            <div className="w-9 h-7 rounded-md bg-gradient-to-br from-amber-300 to-amber-500 grid place-items-center shadow-inner">
              <div className="w-6 h-4 border border-amber-700/40 rounded-sm" />
            </div>
          </div>

          <div className="font-mono text-[1.05rem] tracking-[0.18em] font-bold text-white">
            {formatted || '•••• •••• •••• ••••'}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.5rem] uppercase tracking-widest text-white/55 font-bold">
                Titular
              </p>
              <p className="text-xs font-bold text-white truncate uppercase tracking-wide mt-0.5">
                {holder || 'Tu nombre aquí'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.5rem] uppercase tracking-widest text-white/55 font-bold">
                Vence
              </p>
              <p className="text-xs font-bold text-white tracking-wide mt-0.5 font-mono">
                {expiry || 'MM/AA'}
              </p>
            </div>
            <BrandLogo brand={detected} />
          </div>
        </div>

        {/* BACK */}
        <div
          className={`absolute inset-0 flex flex-col justify-start pt-5 ${
            flipped ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-300`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="cc-strip" />
          <div className="px-5 pt-4">
            <p className="text-[0.5rem] uppercase tracking-widest text-white/55 font-bold mb-1">
              Código de seguridad
            </p>
            <div className="cc-cvv-band">{cvv || '•••'}</div>
          </div>
          <div className="mt-auto px-5 pb-5">
            <p className="text-[0.6rem] text-white/40 leading-relaxed">
              No compartas el código de seguridad con nadie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
