'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventEnvelope } from '../lib/event-log';
import { EVENT_LABELS, describeEvent } from '../lib/event-log';
import { cn, formatDelta, truncate } from '../lib/cn';
import { Panel, PanelHeader } from './ui';

/**
 * The event console — the raw stream.
 *
 * Every frame the server sends is a row here, in arrival order, with the gap
 * since the previous event shown as a `+Δ` badge. This is the interface's
 * ground truth: if a panel looks wrong, the console shows which event produced
 * it. Deliberately monospaced and unadorned so it reads as instrumentation.
 *
 * Auto-scroll is pinned by default and RELEASES the moment the user scrolls up,
 * so reading history during a live run does not fight the stream — the same
 * pattern MiroFish uses for its action log.
 */
export function EventConsole({
  entries,
  running,
  className,
}: {
  entries: readonly EventEnvelope[];
  running: boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Only agent-level events are noisy enough to dominate; they are still shown,
  // but this memo keeps the render cost proportional to what is visible.
  const rows = useMemo(() => entries.slice(-400), [entries]);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, pinned]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setPinned(atBottom);
  }

  return (
    <Panel className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <PanelHeader
        title="Event console"
        meta={`${entries.length} frames`}
        right={
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className={cn(
              'focus-ring rounded border px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wider',
              pinned ? 'border-accent/50 text-accent' : 'border-line text-subtle',
            )}
          >
            {pinned ? 'pinned' : 'follow'}
          </button>
        }
      />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2"
        role="log"
        aria-live="polite"
        aria-label="Raw event stream"
      >
        {rows.length === 0 ? (
          <p className="micro py-4 text-center">awaiting the first event…</p>
        ) : (
          <ol className="space-y-0.5">
            {rows.map((entry) => (
              <li key={entry.seq} className="flex items-baseline gap-2 font-mono text-3xs">
                <span className="w-8 shrink-0 tabular text-subtle">
                  {String(entry.seq).padStart(4, '0')}
                </span>
                <span
                  className={cn(
                    'w-24 shrink-0 truncate',
                    toneFor(entry.event.type),
                  )}
                >
                  {EVENT_LABELS[entry.event.type] ?? entry.event.type}
                </span>
                <span className="w-14 shrink-0 tabular text-subtle">
                  {formatDelta(entry.deltaMs)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {truncate(describeEvent(entry.event), 200)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function toneFor(type: string): string {
  if (type === 'run_failed') return 'text-negative';
  if (type === 'run_completed') return 'text-positive';
  if (type === 'heartbeat') return 'text-subtle';
  if (type === 'agent_event' || type === 'resim_event') return 'text-muted';
  return 'text-accent';
}

/**
 * Per-type counters. Turns the console into a readable instrument: you can see
 * at a glance how many agent events, rounds and provider calls a run took.
 */
export function EventLedger({
  entries,
  className,
}: {
  entries: readonly EventEnvelope[];
  className?: string;
}) {
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.event.type] = (out[e.event.type] ?? 0) + 1;
    for (const key of Object.keys(EVENT_LABELS)) out[key] ??= 0;
    return out;
  }, [entries]);

  const totalElapsedMs = entries.length > 1
    ? (entries[entries.length - 1]?.at ?? 0) - (entries[0]?.at ?? 0)
    : 0;

  return (
    <Panel className={className}>
      <PanelHeader title="Event ledger" meta={`${(totalElapsedMs / 1000).toFixed(1)}s wall clock`} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-3 lg:grid-cols-2">
        {Object.entries(counts)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([type, n]) => (
            <div key={type} className="flex items-baseline justify-between gap-2">
              <span className={cn('truncate font-mono text-3xs', toneFor(type))}>{type}</span>
              <span className="tabular text-xs text-muted">{n}</span>
            </div>
          ))}
      </div>
    </Panel>
  );
}
