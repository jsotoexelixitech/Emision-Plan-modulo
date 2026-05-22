import { cn } from '../../lib/utils';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, error, hint, full, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', full && 'sm:col-span-2', className)}>
      <label className="text-[0.78rem] font-bold text-slate-600 tracking-wide">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[0.72rem] text-slate-400">{hint}</p>}
      {error && (
        <p className="text-[0.72rem] text-rose-500 font-semibold flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-rose-500" />
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 outline-none ' +
  'transition-all duration-200 ' +
  'focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 ' +
  'placeholder:text-slate-300 ' +
  'hover:border-slate-300';

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return <input {...props} className={cn(inputBase, className)} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select
      {...props}
      className={cn(
        inputBase,
        // Flecha personalizada — pr-9 deja espacio fijo para el ícono sin que el
        // texto de la opción seleccionada lo tape, independientemente del ancho.
        'cursor-pointer appearance-none bg-no-repeat pr-9 overflow-hidden text-ellipsis',
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
        backgroundPosition: 'right 12px center',
        backgroundSize: '14px 14px',
      }}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return <textarea {...props} className={cn(inputBase, 'resize-none', className)} />;
}
