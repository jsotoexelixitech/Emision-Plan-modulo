import { useEffect, useState } from 'react';

const VISIBLE_MS = 2400;
const FADE_MS = 700;

// Paleta oficial — Manual de Identidad La Mundial de Seguros
const BRAND = {
  navyDeep: '#091133', // Azul Pennsylvania (oscuro)
  navy: '#0F1A5A', // Azul Pennsylvania (principal)
  navySoft: '#162A7F', // Azul Pennsylvania (claro)
  blueMid: '#2E6DBF', // Azul brillante del logo
  blueLight: '#4A8DD5', // Azul claro del logo
  red: '#E84F51', // Rojo Imperial (principal)
  redLight: '#FF6675', // Rojo Imperial (claro)
};

export function WelcomeSplash() {
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const fadeTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setShow(false), VISIBLE_MS + FADE_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        setLeaving(true);
        window.setTimeout(() => setShow(false), FADE_MS);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  if (!show) return null;

  const skip = () => {
    setLeaving(true);
    window.setTimeout(() => setShow(false), FADE_MS);
  };

  return (
    <div
      role="dialog"
      aria-label="Bienvenida La Mundial de Seguros"
      className="fixed inset-0 z-[200] grid place-items-center overflow-hidden"
      style={{
        animation: leaving ? `splashFadeOut ${FADE_MS}ms ease-out forwards` : undefined,
      }}
    >
      {/* Layered background with brand-aligned tones */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #EAF1FB 0%, #FFFFFF 45%, #FCEFEF 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 18% 28%, ${BRAND.blueLight}33, transparent 60%),
            radial-gradient(ellipse 55% 45% at 82% 72%, ${BRAND.navy}22, transparent 60%),
            radial-gradient(ellipse 35% 30% at 75% 25%, ${BRAND.red}1A, transparent 65%)
          `,
        }}
      />

      {/* Subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center text-center px-6">
        {/* Halo */}
        <div className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] grid place-items-center">
          <span
            className="absolute inset-0 rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${BRAND.blueLight}44, transparent 60%), radial-gradient(circle at 75% 70%, ${BRAND.red}33, transparent 65%)`,
              animation: 'splashHaloPulse 2.6s ease-in-out infinite',
            }}
          />
          <span
            className="absolute inset-6 rounded-full bg-white/75 backdrop-blur-md"
            style={{
              boxShadow: `0 20px 55px -12px ${BRAND.navyDeep}40, inset 0 0 0 1px #FFFFFFCC`,
              animation: 'splashLogoIn 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}
          />

          {/* Isotipo (M-symbol) */}
          <img
            src="/logo-isotipo-transparente.png"
            alt="La Mundial de Seguros"
            draggable={false}
            className="relative w-[110px] sm:w-[140px] h-auto select-none"
            style={{
              animation: 'splashLogoIn 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both',
              filter: `drop-shadow(0 12px 30px ${BRAND.navyDeep}55)`,
            }}
          />

          {/* Shine sweep */}
          <span
            aria-hidden
            className="absolute inset-6 rounded-full overflow-hidden pointer-events-none"
          >
            <span
              className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent"
              style={{ animation: 'splashShine 1.6s ease-out 0.7s both' }}
            />
          </span>
        </div>

        {/* Tagline */}
        <div className="mt-7 sm:mt-9">
          <p
            className="text-[0.68rem] sm:text-[0.72rem] font-black tracking-[0.32em] uppercase mb-2"
            style={{
              animation: 'splashTextIn 0.6s ease-out 0.6s both',
              color: BRAND.red,
            }}
          >
            Bienvenido
          </p>

          <h1
            className="font-wordmark text-3xl sm:text-4xl leading-tight"
            style={{
              animation: 'splashTextIn 0.6s ease-out 0.78s both',
              color: BRAND.navyDeep,
            }}
          >
            La Mundial{' '}
            <span style={{ color: BRAND.red, fontStyle: 'italic' }}>
              de Seguros
            </span>
          </h1>

          <p
            className="text-xs sm:text-sm mt-3 max-w-xs sm:max-w-sm leading-relaxed"
            style={{
              animation: 'splashTextIn 0.6s ease-out 0.95s both',
              color: '#475569',
            }}
          >
            Suscripción digital de pólizas RCV en minutos. Seguro, rápido y sin papeleo.
          </p>

          {/* Decorative line — navy → red gradient (logo accent) */}
          <div
            className="mx-auto mt-5 h-[3px] w-24 rounded-full origin-left"
            style={{
              background: `linear-gradient(90deg, ${BRAND.navy} 0%, ${BRAND.blueMid} 55%, ${BRAND.red} 100%)`,
              animation: 'splashLineGrow 0.7s cubic-bezier(0.22, 1, 0.36, 1) 1.05s both',
            }}
          />
        </div>

        {/* Loader dots in brand colors */}
        <div
          className="mt-6 flex items-center gap-1.5"
          style={{ animation: 'splashTextIn 0.6s ease-out 1.2s both' }}
        >
          {[BRAND.navy, BRAND.blueMid, BRAND.red].map((c, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: c,
                animation: 'pulse-soft 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Skip button */}
      <button
        type="button"
        onClick={skip}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 px-3 py-1.5 rounded-full bg-white/85 hover:bg-white backdrop-blur-md text-[0.66rem] font-bold ring-1 ring-slate-200/70 transition-colors uppercase tracking-wider"
        style={{ color: BRAND.navy }}
        aria-label="Omitir bienvenida"
      >
        Omitir
      </button>
    </div>
  );
}
