import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={4500}
      toastOptions={{
        style: {
          fontFamily: 'inherit',
          borderRadius: '16px',
          fontSize: '0.875rem',
        },
        classNames: {
          toast: 'shadow-[0_18px_50px_-12px_rgba(15,23,42,0.18)] border border-slate-200/60',
          title: 'font-bold text-slate-900',
          description: 'text-slate-500 text-[0.78rem]',
          success: '!border-l-4 !border-l-emerald-400',
          error: '!border-l-4 !border-l-rose-400',
          warning: '!border-l-4 !border-l-amber-400',
          info: '!border-l-4 !border-l-indigo-400',
        },
      }}
      offset="80px"
    />
  );
}
