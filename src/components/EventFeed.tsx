'use client';

import { useMemo } from 'react';
import type { EventEnvelope } from '../lib/event-log';
import type { AgentEvent } from '../core/domain';
import { cn, formatDelta, initials, truncate } from '../lib/cn';
import { Chip, Panel, PanelHeader } from './ui';
import { ACTION_COLORS } from './room/stage-colors';

/**
 * The reaction feed.
 *
 * Deliberately SELECTIVE (docs/user-journey.md, brief §15): it shows what
 * carries meaning — rejections, disagreement, and high-intensity reactions —
 * rather than every event. A wall of 100 generated messages would look busy and
 * communicate nothing.
 *
 * Entries append and dedupe by event id, so a replayed or reconnected stream
 * cannot double-post.
 */

type FeedItem = {
  id: string;
  event: AgentEvent;
  deltaMs: number;
  pass: 'A' | 'B';
};

const NOTABLE = new Set(['REJECT', 'SHARE', 'SAVE', 'BUY', 'COMMENT']);

function isNotable(e: AgentEvent): boolean {
  if (e.stage !== 'action' || !e.action) return false;
  if (NOTABLE.has(e.action)) return true;
  // High-intensity anything is worth surfacing: it is where the signal is.
  return e.intensity > 0.72;
}

export function EventFeed({
  entries,
  agentLabels,
  className,
}: {
  entries: readonly EventEnvelope[];
  agentLabels: Record<string, string>;
  className?: string;
}) {
  const items = useMemo<FeedItem[]>(() => {
    const seen = new Set<string>();
    const out: FeedItem[] = [];
    for (const entry of entries) {
      const payload = entry.event;
      if (payload.type !== 'agent_event' && payload.type !== 'resim_event') continue;
      const e = payload.event;
      if (!isNotable(e)) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({
        id: e.id,
        event: e,
        deltaMs: entry.deltaMs,
        pass: payload.type === 'agent_event' ? 'A' : 'B',
      });
    }
    return out.slice(-60).reverse();
  }, [entries]);

  return (
    <Panel className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <PanelHeader
        title="Reaction feed"
        meta="selected · synthetic fragments"
        event="agent_event"
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {items.length === 0 ? (
          <p className="micro py-4 text-center">no notable reactions yet…</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const label = agentLabels[item.event.agentId] ?? item.event.agentId;
              const color = item.event.action ? (ACTION_COLORS[item.event.action] ?? 'currentColor') : 'currentColor';
              return (
                <li
                  key={item.id}
                  className="animate-enter rounded border border-line-soft bg-surface2/40 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-line font-mono text-3xs text-muted"
                      aria-hidden
                    >
                      {initials(label)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{label}</span>
                    <span
                      className="shrink-0 font-mono text-3xs uppercase tracking-wider"
                      style={{ color }}
                    >
                      {item.event.action}
                    </span>
                    <span className="w-12 shrink-0 text-right tabular text-3xs text-subtle">
                      {formatDelta(item.deltaMs)}
                    </span>
                  </div>

                  {item.event.excerpt ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-fg/90">
                      {truncate(item.event.excerpt, 220)}
                    </p>
                  ) : null}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="micro">r{item.event.round}</span>
                    {item.pass === 'B' ? <Chip tone="accent">version B</Chip> : null}
                    {item.event.reasons.slice(0, 2).map((r) => (
                      <Chip key={r}>{r}</Chip>
                    ))}
                    <span className="micro ml-auto tabular">
                      intensity {item.event.intensity.toFixed(2)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-line-soft px-4 py-2 note">
        Template-composed synthetic fragments, not quotations from anyone.
      </p>
    </Panel>
  );
}
