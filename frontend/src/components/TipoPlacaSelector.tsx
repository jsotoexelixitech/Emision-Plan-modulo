import { useEffect } from 'react';
import { Globe2, Lock, MapPin, Flag } from 'lucide-react';
import { cn } from '../lib/utils';
import { shouldLockTipoPlacaExtranjera } from '../lib/placa-tipo';
import type { VehicleData } from '../types';

type TipoPlaca = VehicleData['tipoPlaca'];

type Props = {
  value: TipoPlaca;
  placa: string;
  certOcr?: { tipoPlaca?: string; placa?: string } | null;
  onChange: (tipo: TipoPlaca) => void;
};

const OPTIONS: {
  id: TipoPlaca;
  label: string;
  desc: string;
  Icon: typeof Flag;
}[] = [
  { id: 'nacional', label: 'Nacional', desc: 'Placa venezolana · RCV normal', Icon: Flag },
  { id: 'extranjera', label: 'Extranjera', desc: 'Placa no venezolana', Icon: Globe2 },
  { id: 'binacional', label: 'Binacional', desc: 'Viaje a Colombia', Icon: MapPin },
];

export function TipoPlacaSelector({ value, placa, certOcr, onChange }: Props) {
  const lockExtranjera = shouldLockTipoPlacaExtranjera(placa, certOcr);

  useEffect(() => {
    if (lockExtranjera && value !== 'extranjera') {
      onChange('extranjera');
    }
  }, [lockExtranjera, value, onChange]);

  return (
    <div className="col-span-full space-y-2.5">
      <div>
        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
          Tipo de emisión
        </p>
        <p className="text-[0.7rem] text-slate-500 mt-0.5">
          Elige nacional, extranjera o binacional (Colombia). Define los planes disponibles.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {OPTIONS.map(({ id, label, desc, Icon }) => {
          const isActive = value === id;
          const isLockedOption = lockExtranjera && id === 'extranjera';
          const isDisabled = lockExtranjera ? id !== 'extranjera' : false;

          return (
            <button
              key={id}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) onChange(id);
              }}
              className={cn(
                'relative flex flex-col items-start gap-1 rounded-xl border-2 px-3.5 py-3 text-left transition-all',
                isActive
                  ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-[0_6px_20px_rgba(79,70,229,0.18)]'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50',
                isDisabled && 'opacity-45 cursor-not-allowed hover:border-slate-200 hover:bg-white',
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-bold',
                    isActive ? 'text-indigo-800' : 'text-slate-700',
                  )}
                >
                  <Icon size={15} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                  {label}
                </span>
                {isLockedOption && (
                  <Lock size={13} className="text-amber-600 shrink-0" aria-hidden />
                )}
              </span>
              <span className="text-[0.65rem] text-slate-500 leading-snug">{desc}</span>
            </button>
          );
        })}
      </div>

      {lockExtranjera && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <Lock size={14} className="shrink-0 mt-0.5 text-amber-600" />
          <span>
            Placa extranjera detectada en el documento o en el formato ingresado.
            La emisión se realizará como <strong>extranjera</strong>.
          </span>
        </p>
      )}
    </div>
  );
}
