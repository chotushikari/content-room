import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { ProviderUsage, RunMode, ValidationStatus } from '../core/domain';

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
    <As
      className={cn(
        'rounded-lg border border-line bg-surface/70 backdrop-blur-[2px]',
        className,
      )}
    >
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
  /** The event type that unlocked this panel. Reinforces the event-driven model. */
  event?: string;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-line-soft px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-medium tracking-tight">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {event ? (
            <span className="micro hidden rounded border border-line px-1.5 py-0.5 xl:inline">
              {event}
            </span>
          ) : null}
          {right}
        </div>
      </div>
      {/* Meta gets its own line. Sharing a row with the title and the event chip
          truncated it to "SELECTED · SYNTHETI…" in narrow panels, which is worse
          than not showing it. */}
      {meta ? <p className="micro mt-0.5 truncate">{meta}</p> : null}
    </header>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'caution';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line text-muted',
    accent: 'border-accent/50 text-accent',
    positive: 'border-positive/50 text-positive',
    negative: 'border-negative/50 text-negative',
    caution: 'border-caution/50 text-caution',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wider',
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
      <div className={cn('tabular text-lg leading-tight', tones[tone])}>{value}</div>
      {sub ? <div className="micro mt-0.5 truncate">{sub}</div> : null}
    </div>
  );
}

/**
 * The honesty badge. Rendered on every station.
 *
 * `mode` is authoritative and comes from what ACTUALLY served the run, so a
 * degraded run cannot be presented as live. `provisional` is what was merely
 * configured, and is shown as pending while the run is in flight.
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
      ? 'border-positive/60 text-positive'
      : effective === 'degraded'
        ? 'border-caution/60 text-caution'
        : 'border-line text-muted';

  const label =
    effective === 'live'
      ? 'Live'
      : effective === 'degraded'
        ? 'Degraded: fallback model'
        : 'Demo mode: deterministic engine';

  const servedBy = providers.length > 0
    ? [...new Set(providers.map((p) => p.providerId))].join(', ')
    : null;

  return (
    <span
      className={cn('inline-flex items-center gap-2 rounded border px-2 py-1', tone)}
      title={mode ? 'Authoritative: derived from what served this run.' : 'Provisional: based on configured providers.'}
    >
      <span
        className={cn(
          'size-1.5 rounded-full bg-current',
          running ? 'animate-pulse' : '',
        )}
        aria-hidden
      />
      <span className="font-mono text-3xs uppercase tracking-wider">
        {label}
        {mode === null && provisional !== null ? ' (pending)' : ''}
      </span>
      {servedBy ? <span className="micro hidden lg:inline">via {servedBy}</span> : null}
    </span>
  );
}

/**
 * Validation state, rendered wherever numbers appear.
 * Not dismissible — it is the truthful current state, not a disclaimer to clear.
 */
export function ValidationNote({ validation }: { validation: ValidationStatus }) {
  if (validation.state === 'not_established') {
    return (
      <p className="note">
        {validation.note} Simulated estimates, not representative of any real population.
      </p>
    );
  }
  return (
    <p className="note">
      Calibrated against {validation.benchmarks.length} benchmarks on {validation.calibratedAt}.
    </p>
  );
}

export function SimulatedLabel() {
  return <span className="micro">Simulated estimate</span>;
}

export function EmptySlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <span className="micro">{label}</span>
      <span className="text-xs text-subtle">{hint}</span>
    </div>
  );
}
