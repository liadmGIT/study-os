import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LoaderCircle, X } from 'lucide-react';

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-brand text-canvas hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-sunken',
        variant === 'ghost' && 'text-muted hover:bg-sunken hover:text-ink',
        variant === 'danger' && 'border border-line bg-surface text-overdue hover:bg-sunken',
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-2xl border border-line bg-surface', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {icon ? <span className="text-muted">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

const tones = {
  neutral: 'bg-sunken text-muted',
  red: 'bg-overdue/12 text-overdue',
  orange: 'bg-urgent/12 text-urgent',
  amber: 'bg-week/15 text-week',
  green: 'bg-ok/12 text-ok',
  brand: 'bg-brand-soft text-brand',
  slate: 'bg-later/12 text-later',
};
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4', tones[tone], className)}>
      {children}
    </span>
  );
}

export function CourseTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-muted', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-muted', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-faint">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 rounded-[10px] font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line')}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all', checked ? 'start-[18px]' : 'start-0.5')} />
      </button>
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none disabled:opacity-60';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, 'h-10', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, 'h-10', props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, 'min-h-24', props.className)} />;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-sunken', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color ?? 'var(--color-brand)' }} />
    </div>
  );
}

/** Side panel on desktop, bottom sheet on phones. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-surface shadow-2xl md:inset-y-0 md:start-auto md:end-0 md:max-h-none md:w-[480px] md:rounded-none md:rounded-s-3xl"
      >
        <div className="flex items-start gap-2 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1 text-lg font-semibold leading-snug">{title}</div>
          <IconButton label="סגירה" onClick={onClose} className="-me-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center gap-2 first:mt-0">
      <h3 className="text-[13px] font-semibold tracking-wide text-muted">{children}</h3>
      {count !== undefined ? <span className="text-xs text-faint tabular">{count}</span> : null}
      <div className="flex-1" />
      {action}
    </div>
  );
}
