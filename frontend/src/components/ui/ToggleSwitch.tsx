interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

export function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  return (
    <div
      className={`
        rounded-2xl p-4 transition-all duration-300
        ${checked
          ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200/70'
          : 'bg-slate-50 border border-slate-200'
        }
      `}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${checked ? 'text-indigo-900' : 'text-slate-700'}`}>
            {label}
          </p>
          {description && (
            <p className={`mt-1 text-[0.78rem] leading-relaxed ${checked ? 'text-indigo-700/80' : 'text-slate-500'}`}>
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`
            relative flex-shrink-0 w-12 h-7 rounded-full transition-all duration-300 cursor-pointer outline-none
            focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2
            ${checked
              ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_4px_14px_rgba(15, 26, 90,0.35)]'
              : 'bg-slate-300'
            }
          `}
        >
          <span
            className={`
              absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md
              transition-transform duration-300 ease-out
              ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>
    </div>
  );
}
