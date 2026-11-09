import { clsx, type ClassValue } from 'clsx';
import { LoaderCircle, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { twMerge } from 'tailwind-merge';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

/* ---------- Actions ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export const buttonClass = (variant: ButtonProps['variant'] = 'secondary', size: ButtonProps['size'] = 'md') =>
  cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,color,border-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-45 select-none',
    size === 'sm' ? 'h-9 px-3 text-[13.5px]' : 'h-11 px-4 text-[14.5px] md:h-10',
    variant === 'primary' && 'bg-ink text-paper hover:bg-ink/85',
    variant === 'secondary' && 'border border-rule-strong bg-surface text-ink hover:border-ink-3 hover:bg-sunken/60',
    variant === 'ghost' && 'text-ink-2 hover:bg-sunken hover:text-ink',
    variant === 'danger' && 'text-accent hover:bg-accent/8',
  );

export function Button({ variant, size, className, loading, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={cn(buttonClass(variant, size), className)}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
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
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40 md:size-9',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Structure ---------- */

/** A raised sheet of paper. Use sparingly: most content sits directly on the page. */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-lg border border-rule bg-surface', className)}>
      {children}
    </div>
  );
}

/** A titled section of a page, separated by a hairline. `i` staggers its entrance. */
export function Section({
  title,
  meta,
  action,
  children,
  className,
  i,
  headingLevel = 2,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  i?: number;
  headingLevel?: 2 | 3;
}) {
  const id = useId();
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={id} className={cn('rise border-t border-rule pt-4', className)} style={{ '--i': i ?? 0 } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <H id={id} className="display text-[19px]">
          {title}
        </H>
        {meta ? <span className="order-last w-full text-[13px] text-ink-3 sm:order-none sm:w-auto">{meta}</span> : null}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise mb-7 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="display text-[30px] md:text-[36px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-prose text-[14.5px] text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Label over a group of rows, with a rule running to the end of the line. */
export function GroupLabel({
  children,
  count,
  action,
  color,
  level = 2,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
  color?: string;
  /** Heading level, so headings never skip a level (h1 → h2 → h3). */
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="mt-6 mb-1 flex items-center gap-2.5 first:mt-0">
      {color ? <span className="size-2 rounded-full" style={{ background: color }} aria-hidden /> : null}
      <H className="text-[13px] font-semibold text-ink-2">{children}</H>
      {count !== undefined ? <span className="text-[12.5px] text-ink-3 tabular">{count}</span> : null}
      <span className="h-px flex-1 bg-rule" aria-hidden />
      {action}
    </div>
  );
}

/* ---------- Small marks ---------- */

const tones = {
  neutral: 'text-ink-2 bg-sunken',
  accent: 'text-accent bg-accent/10',
  green: 'text-green bg-green/10',
  amber: 'text-amber bg-amber/12',
  blue: 'text-blue bg-blue/10',
};
export type Tone = keyof typeof tones;

export function Tag({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-px text-[12px] font-medium leading-5', tones[tone], className)}>
      {children}
    </span>
  );
}

/** A course's colour as a short vertical tab, like a coloured page marker. */
export function CourseMark({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-3.5 w-[3px] shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export function CourseTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2', className)}>
      <CourseMark color={color} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-rule-strong bg-surface px-1.5 font-sans text-[12px] text-ink-2 shadow-[0_1px_0_var(--c-rule-strong)]">
      {children}
    </kbd>
  );
}

export function Progress({ value, color, label, className }: { value: number; color?: string; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1 overflow-hidden rounded-full bg-rule', className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color ?? 'var(--c-ink)' }} />
    </div>
  );
}

/* ---------- Loading & empty ---------- */

export function Spinner({ className, label = 'טוען' }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cn('size-5 animate-spin text-ink-3', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} />;
}

/** Placeholder rows while a page loads for the first time. */
export function PageLoader() {
  return (
    <div role="status" aria-label="טוען" className="space-y-7 pt-2">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 border-t border-rule pt-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="w-full" />
          <Skeleton className="w-5/6" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('py-8 text-center', className)}>
      <p className="display text-[18px] text-ink-2">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-sm text-[14px] text-ink-3">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------- Choices ---------- */

/** One-of-many as underlined text tabs. Buttons with aria-pressed, inside a labelled group. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('-mb-px flex max-w-full gap-5 overflow-x-auto border-b border-rule', className)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative shrink-0 py-2.5 text-[14px] whitespace-nowrap transition-colors',
              active ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
            <span aria-hidden className={cn('absolute inset-x-0 -bottom-px h-0.5 rounded-full', active ? 'bg-ink' : 'bg-transparent')} />
          </button>
        );
      })}
    </div>
  );
}

/** Compact one-of-many (inside forms and panels). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-md border border-rule-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 rounded-[5px] whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-[14px]',
            value === o.value ? 'bg-ink font-medium text-paper' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13.5px] whitespace-nowrap transition-colors',
        active ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-[14.5px]">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="text-[13px] text-ink-3">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors', checked ? 'border-ink bg-ink' : 'border-rule-strong bg-sunken')}
      >
        <span
          aria-hidden
          className={cn('absolute top-[3px] size-4 rounded-full transition-all', checked ? 'start-[19px] bg-paper' : 'start-[3px] bg-ink-3')}
        />
      </button>
    </div>
  );
}

/* ---------- Form fields ---------- */

const fieldCls =
  'w-full rounded-md border border-rule-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-blue focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-60';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cn(fieldCls, 'h-11 md:h-10', props.className)} />;
}
export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cn(fieldCls, 'h-11 md:h-10', props.className)} />;
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(fieldCls, 'min-h-24 py-2.5 leading-relaxed', props.className)} />;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12.5px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

/* ---------- Dialog ---------- */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Side panel on desktop, bottom sheet on phones. Keeps keyboard focus inside while open,
 * closes on Escape, and puts focus back where it was.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Accessible name when `title` is not plain text (e.g. an input). */
  label?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#1f1c17]/35 animate-[fade-in_.2s_ease]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-xl border-t border-rule bg-surface shadow-[0_-12px_40px_-12px_rgba(31,28,23,.35)] animate-[sheet-in-bottom_.28s_cubic-bezier(.2,.7,.2,1)] focus:outline-none md:inset-y-0 md:start-auto md:end-0 md:max-h-none md:w-[500px] md:rounded-none md:border-t-0 md:border-s md:shadow-[12px_0_40px_-12px_rgba(31,28,23,.35)] md:animate-[sheet-in-side_.28s_cubic-bezier(.2,.7,.2,1)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule-strong md:hidden" aria-hidden />
        <div className="flex items-start gap-3 border-b border-rule px-5 py-4 md:px-6">
          <div id={titleId} className="display min-w-0 flex-1 pt-1 text-[21px]">
            {title}
          </div>
          <IconButton label="סגירה" onClick={onClose} className="-me-2">
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
        {footer ? <div className="safe-bottom border-t border-rule px-5 py-3 md:px-6">{footer}</div> : null}
      </div>
    </div>
  );
}
