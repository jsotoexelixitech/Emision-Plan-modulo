import { useEffect, useRef, useState } from 'react';

import { roundQuoteAmount } from '../../lib/money';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Si se define, muestra hasta N decimales sin forzar mínimo (cotización RCV exacta). */
  maximumFractionDigits?: number;
  className?: string;
}

/**
 * Smoothly tweens a number from its previous value to the new value.
 * Uses easeOutCubic for a natural deceleration feel.
 */
export function AnimatedCounter({
  value,
  duration = 700,
  prefix = '',
  suffix = '',
  decimals = 0,
  maximumFractionDigits,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;

    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const fractionDigits = maximumFractionDigits ?? decimals;
  const formatted = roundQuoteAmount(display, fractionDigits).toLocaleString('es-VE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
