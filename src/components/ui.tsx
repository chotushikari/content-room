import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { ProviderUsage, RunMode, ValidationStatus } from '../core/domain';

/**
 * Shared primitives.
 *
 * Every export that existed before still exists with the same signature, so the
 * panels that have not been touched keep compiling and simply inherit the new
 * palette and type scale.
 */

/* -------------------------------------------------------------------- mark */

/**
 * The mark is the product: a room that has split in two.
 *
 * Two half-discs pulled apart along a seam, one leaning warm and one cool —
 * the same two colours the segment bars use for "argued back" and "passed it
 * on". A logo that encodes the thing the product finds is worth more than a
 * lettermark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-6', className)}
      role="img"
      aria-label="Content Room"
    >
      <path
        d="M11 2.5a9.5 9.5 0 0 0 0 19z"
        fill="var(--color-amplify)"
        transform="translate(-1.1 -0.9)"
      />
      <path
        d="M13 2.5a9.5 9.5 0 0 1 0 19z"
        fill="var(--color-negative)"
        transform="translate(1.1 0.9)"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Logo />
      <span className="display text-[1.0625rem] font-bold tracking-tight text-fg">
        Content Room
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ layout */

export function Panel({
  children,
  className,
  as: As = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return (
    <As className={cn('rounded-xl border border-line-soft bg-surface/60', className)}>
      {children}
    </As>
  );
}

export function PanelHeader({
  title,
  meta,
  event,
  right,
}: {
  title: string;
  meta?: string;
  /** The event that unlocked this panel. Reinforces the event-driven model. */
  event?: string;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-line-soft px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-small font-semibold text-fg">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {event ? (
            <span className="hidden rounded border border-line-soft px-1.5 py-0.5 font-mono text-fine text-subtle xl:inline">
              {event}
            </span>
          ) : null}
          {right}
        </div>
      </div>
      {meta ? <p className="micro mt-1 truncate">{meta}</p> : null}
    </header>
  );
}

/**
 * A section heading inside the verdict flow.
 *
 * The question is the heading, because every section of the verdict answers a
 * question the reader already has. "Will they like it" is more useful as a
 * heading than "Segment analysis".
 */
export function SectionHeading({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-3.5">
      <h2 className="display text-[1.0625rem] font-semibold text-fg">{children}</h2>
      {meta ? <span className="micro shrink-0">{meta}</span> : null}
    </header>
  );
}

/* ----------------------------------------------------------------- actions */

/**
 * Buttons.
 *
 * Minimum 40px tall. The previous ad-hoc buttons were 10px text in a 22px box,
 * which is below every touch-target guideline and was the main reason the
 * interface felt fiddly rather than merely dense.
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  type = 'button',
  className,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  'aria-expanded'?: boolean;
  'aria-current'?: boolean;
}) {
  const variants: Record<string, string> = {
    primary: disabled
      ? 'cursor-not-allowed bg-surface2 text-subtle'
      : 'bg-accent text-bg hover:bg-accent/90 font-semibold',
    secondary: disabled
      ? 'cursor-not-allowed border border-line-soft text-subtle'
      : 'border border-line text-fg hover:border-accent/60 hover:bg-accent/10',
    ghost: disabled
      ? 'cursor-not-allowed text-subtle'
      : 'text-muted hover:text-fg hover:bg-surface2/70',
  };
  const sizes: Record<string, string> = {
    sm: 'min-h-8 px-2.5 text-fine',
    md: 'min-h-10 px-4 text-small',
    lg: 'min-h-12 px-6 text-body',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-lg transition-colors',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Segmented view switcher. Real labels at a readable size, not 10px caps. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-line-soft bg-surface/70 p-0.5"
    >
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={value === id}
          className={cn(
            'focus-ring min-h-8 rounded-[0.4rem] px-3 text-small transition-colors',
            value === id
              ? 'bg-accent/18 font-semibold text-fg'
              : 'text-muted hover:text-fg',
          )}
        >
          {text}
        </button>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ tokens */

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'caution' | 'amplify';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line text-muted',
    accent: 'border-accent/50 text-accent',
    positive: 'border-positive/50 text-positive',
    negative: 'border-negative/50 text-negative',
    caution: 'border-caution/50 text-caution',
    amplify: 'border-amplify/50 text-amplify',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-fine',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MonoStat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}) {
  const tones: Record<string, string> = {
    default: 'text-fg',
    positive: 'text-positive',
    negative: 'text-negative',
    muted: 'text-muted',
  };
  return (
    <div className="min-w-0">
      <div className="micro truncate">{label}</div>
      <div className={cn('tabular display text-lead leading-tight', tones[tone])}>{value}</div>
      {sub ? <div className="micro mt-0.5 truncate">{sub}</div> : null}
    </div>
  );
}

/**
 * The honesty badge, on every screen.
 *
 * `mode` is authoritative and reflects what ACTUALLY served the run, so a
 * degraded run cannot be dressed up as a live one. `provisional` is merely what
 * was configured, and shows as pending while the run is in flight.
 */
export function ModeBadge({
  mode,
  provisional,
  providers,
  running,
}: {
  mode: RunMode | null;
  provisional: RunMode | null;
  providers: ProviderUsage[];
  running: boolean;
}) {
  const effective = mode ?? provisional;
  const tone =
    effective === 'live'
      ? 'text-positive'
      : effective === 'degraded'
        ? 'text-caution'
        : 'text-muted';

  const label =
    effective === 'live'
      ? 'Live models'
      : effective === 'degraded'
        ? 'Fallback model'
        : 'Built-in engine';

  const servedBy =
    providers.length > 0 ? [...new Set(providers.map((p) => p.providerId))].join(', ') : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-line-soft px-2.5 py-1.5 text-fine',
        tone,
      )}
      title={
        mode
          ? 'Authoritative: derived from what actually served this run.'
          : 'Provisional: based on the configured providers.'
      }
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full bg-current', running ? 'animate-breathe' : '')}
        aria-hidden
      />
      <span>
        {label}
        {mode === null && provisional !== null ? ' (pending)' : ''}
      </span>
      {servedBy ? <span className="hidden text-subtle lg:inline">· {servedBy}</span> : null}
    </span>
  );
}

/**
 * Validation state, rendered wherever numbers appear.
 * Not dismissible — it is the current state of the product, not a nag to clear.
 */
export function ValidationNote({ validation }: { validation: ValidationStatus }) {
  if (validation.state === 'not_established') {
    return (
      <p className="honest">
        {validation.note} These are simulated estimates and are not representative of any real
        population.
      </p>
    );
  }
  return (
    <p className="honest">
      Calibrated against {validation.benchmarks.length} benchmarks on {validation.calibratedAt}.
    </p>
  );
}

export function SimulatedLabel() {
  return <span className="micro">Simulated estimate</span>;
}

export function EmptySlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      <span className="text-small font-medium text-muted">{label}</span>
      <span className="micro max-w-xs">{hint}</span>
    </div>
  );
}
