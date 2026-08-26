import { useEffect } from 'react';
import { Globe2, Lock, MapPin, Flag } from 'lucide-react';
import { cn } from '../lib/utils';
import { ocrIndicaPlacaExtranjera } from '../lib/placa-tipo';
import type { VehicleData } from '../types';

type TipoPlaca = VehicleData['tipoPlaca'];

type Props = {
  value: TipoPlaca;
  placa: string;
  certOcr?: { tipoPlaca?: string; placa?: string } | null;
  onChange: (tipo: TipoPlaca) => void;
  /** Ocultar opción binacional (flujos sin RCV La Mundial). */
  showBinacional?: boolean;
  disabled?: boolean;
};

const ALL_OPTIONS: {
  id: TipoPlaca;
  label: string;
  desc: string;
  Icon: typeof Flag;
}[] = [
  { id: 'nacional', label: 'Nacional', desc: 'Placa venezolana · RCV normal', Icon: Flag },
  { id: 'extranjera', label: 'Extranjera', desc: 'Placa no venezolana (según OCR)', Icon: Globe2 },
  { id: 'binacional', label: 'Binacional', desc: 'Viaje a Colombia', Icon: MapPin },
];

export function TipoPlacaSelector({
  value,
  placa: _placa,
  certOcr,
  onChange,
  showBinacional = true,
  disabled = false,
}: Props) {
  const forceExtranjera = ocrIndicaPlacaExtranjera(certOcr);
  const extranjeraBlocked = !forceExtranjera;
  const options = showBinacional
    ? ALL_OPTIONS
    : ALL_OPTIONS.filter((o) => o.id !== 'binacional');

  useEffect(() => {
    if (disabled) return;
    if (forceExtranjera && value !== 'extranjera') {
      onChange('extranjera');
      return;
    }
    if (!forceExtranjera && value === 'extranjera') {
      onChange('nacional');
    }
  }, [forceExtranjera, value, onChange, disabled]);

  return (
    <div className="col-span-full">
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 p-4 sm:p-5 shadow-[0_8px_30px_rgba(79,70,229,0.12)] space-y-3">
        <div>
          <p className="text-sm font-black text-indigo-900 uppercase tracking-wide">
            Tipo de emisión RCV
          </p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Elige cómo emitir. <strong>Extranjera</strong> solo se habilita si el OCR detectó placa no venezolana.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(({ id, label, desc, Icon }) => {
            const isActive = value === id;
            const isExtranjeraOption = id === 'extranjera';
            const isOptionDisabled =
              disabled
              || (forceExtranjera && id !== 'extranjera')
              || (extranjeraBlocked && isExtranjeraOption);

            return (
              <button
                key={id}
                type="button"
                disabled={isOptionDisabled}
                onClick={() => {
                  if (!isOptionDisabled) onChange(id);
                }}
                className={cn(
                  'relative flex flex-col items-start gap-1.5 rounded-xl border-2 px-4 py-3.5 min-h-[4.5rem] text-left transition-all',
                  isActive
                    ? 'border-indigo-600 bg-white shadow-[0_10px_28px_rgba(79,70,229,0.22)] ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white/90 hover:border-indigo-400 hover:bg-white',
                  isOptionDisabled && 'opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white/90',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 text-base font-bold',
                      isActive ? 'text-indigo-800' : 'text-slate-800',
                    )}
                  >
                    <span
                      className={cn(
                        'w-8 h-8 rounded-lg grid place-items-center shrink-0',
                        isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      <Icon size={16} />
                    </span>
                    {label}
                  </span>
                  {(forceExtranjera && isExtranjeraOption) || (extranjeraBlocked && isExtranjeraOption) ? (
                    <Lock size={14} className="text-slate-400 shrink-0" aria-hidden />
                  ) : null}
                </span>
                <span className="text-[0.7rem] text-slate-500 leading-snug pl-10">
                  {extranjeraBlocked && isExtranjeraOption ? 'Requiere placa extranjera en OCR' : desc}
                </span>
              </button>
            );
          })}
        </div>

        {forceExtranjera && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <Lock size={14} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              El OCR detectó placa extranjera. La emisión será <strong>extranjera</strong>.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
