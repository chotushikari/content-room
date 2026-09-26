'use client';

import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Parts of the simulation world.
 *
 * Small, labelled instrument components. The register is a console: thin
 * borders, micro-sized labels, monospaced numerals, and colour that carries data
 * rather than decoration.
 */

/** The brand | world | run-mode strip, and the live pill on the right. */
export function ConsoleBar({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line-soft bg-surface/60 px-4 py-2">
      <div className="flex min-w-0 items-center gap-4">{left}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

/** Small uppercase tag. Used for world/segment/role labels, never for sentences. */
export function Tag({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'negative' | 'positive' | 'caution';
  className?: string;
}) {
  const tones = {
    default: 'border-line text-subtle',
    accent: 'border-accent/50 bg-accent/10 text-accent',
    negative: 'border-negative/50 bg-negative/10 text-negative',
    positive: 'border-positive/50 bg-positive/10 text-positive',
    caution: 'border-caution/50 bg-caution/10 text-caution',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.09em] uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type StageState = 'done' | 'active' | 'next';

/**
 * The numbered stage stepper: 01 Content → 05 Strategy.
 *
 * A stage is `done` or `active` because its event has ARRIVED, not because a
 * counter advanced — so the stepper can never show a stage that has no data
 * behind it yet.
 */
export function StageStepper({
  stages,
}: {
  stages: Array<{ n: string; label: string; state: StageState }>;
}) {
  return (
    <ol className="flex items-center gap-0 overflow-x-auto border-b border-line-soft bg-bg/60 px-4 py-2 scroll-thin">
      {stages.map((s, i) => (
        <li key={s.label} className="flex shrink-0 items-center">
          <span
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors',
              s.state === 'active'
                ? 'text-accent'
                : s.state === 'done'
                  ? 'text-muted'
                  : 'text-subtle/70',
            )}
          >
            <span className="tabular">{s.n}</span>
            <span>{s.label}</span>
            {s.state === 'done' ? (
              <span aria-label="complete" className="text-positive">
                ✓
              </span>
            ) : null}
            {s.state === 'active' ? (
              <span aria-hidden className="ml-0.5 size-1.5 rounded-full bg-accent animate-live" />
            ) : null}
          </span>
          {i < stages.length - 1 ? (
            <span
              aria-hidden
              className={cn('mx-1 h-px w-6', s.state === 'next' ? 'bg-line-soft' : 'bg-line')}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * A bar built from discrete blocks rather than a smooth fill.
 *
 * The segmented form reads as an instrument and, more usefully, makes it
 * obvious the value is a count of agents rather than a continuous measurement.
 */
export function SegmentedBar({
  value,
  tone,
  blocks = 40,
  className,
}: {
  value: number;
  tone: string;
  blocks?: number;
  className?: string;
}) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * blocks);
  return (
    <span className={cn('flex h-3 items-stretch gap-[2px]', className)} aria-hidden>
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px] transition-colors duration-200"
          style={{
            background: i < filled ? tone : 'color-mix(in oklab, var(--color-line) 55%, transparent)',
            // The last lit block is brighter, so the leading edge is readable.
            opacity: i < filled ? (i === filled - 1 ? 1 : 0.72) : 1,
          }}
        />
      ))}
    </span>
  );
}

/** A labelled metric with its bar, e.g. "Attention 79%". */
export function MetricBar({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: number;
  tone: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-muted">{label}</span>
        <span className="tabular text-[12.5px] text-fg">{Math.round(value)}%</span>
      </div>
      <SegmentedBar value={value} tone={tone} className="mt-1.5" />
    </div>
  );
}

/** The inline metric triple on the content card: value + three-letter code. */
export function MetricChip({
  value,
  code,
  tone,
}: {
  value: number;
  code: string;
  tone: string;
}) {
  return (
    <span className="flex items-center gap-1" title={`${code} — simulated estimate`}>
      <span className="size-1.5 rounded-full" style={{ background: tone }} aria-hidden />
      <span className="tabular text-[12px] text-fg">{Math.round(value)}</span>
      <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-subtle">{code}</span>
    </span>
  );
}

/** The status pill in the middle of the canvas while a run is in flight. */
export function StatusPill({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="pointer-events-none flex items-center gap-3 rounded-full border border-line bg-surface/90 px-4 py-2 backdrop-blur-sm">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1 rounded-full bg-accent animate-live"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-fg">{title}</span>
      <span className="text-[12.5px] text-muted">{detail}</span>
    </div>
  );
}

/** The bottom-centre finding callout with a jump-to-detail action. */
export function WorldCallout({
  tone,
  children,
  action,
  onAction,
}: {
  tone: string;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2 backdrop-blur-sm">
      <span className="size-2 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
      <span className="text-[12.5px] text-fg">{children}</span>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="focus-ring shrink-0 rounded-sm font-mono text-[10px] tracking-[0.09em] uppercase text-accent hover:underline"
        >
          {action} →
        </button>
      ) : null}
    </div>
  );
}
