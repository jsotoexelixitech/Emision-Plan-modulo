import { cn } from '../../lib/utils';

interface BadgeProps {
  variant?: 'pending' | 'uploading' | 'processing' | 'done' | 'error' | 'optional';
  children: React.ReactNode;
  className?: string;
}

const variantClasses = {
  pending: 'bg-slate-100 text-slate-500',
  uploading: 'bg-indigo-50 text-indigo-600',
  processing: 'bg-violet-50 text-violet-600',
  done: 'bg-emerald-50 text-emerald-600',
  error: 'bg-rose-50 text-rose-600',
  optional: 'bg-slate-50 text-slate-400 border border-dashed border-slate-300',
};

const dotClasses = {
  pending: 'bg-slate-400',
  uploading: 'bg-indigo-500 animate-pulse-soft',
  processing: 'bg-violet-500 animate-pulse-soft',
  done: 'bg-emerald-500',
  error: 'bg-rose-500',
  optional: 'bg-slate-300',
};

export function Badge({ variant = 'pending', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-bold whitespace-nowrap',
        variantClasses[variant],
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotClasses[variant])} />
      {children}
    </span>
  );
}
