'use client';

import { useMemo, useState } from 'react';
import type { RunViewState } from '../lib/run-reducer';
import type { EventEnvelope } from '../lib/event-log';
import { deriveAgentProfiles, profileSummary, stateLabel, type AgentProfile } from '../core/agents';
import type { AgentEvent } from '../core/domain';
import { segmentColor, segmentIndexer } from './room/palette';
import { cn } from '../lib/cn';
import { Chip, Panel, PanelHeader } from './ui';

/**
 * Who is in the room, and why they reacted the way they did.
 *
 * A simulated audience that cannot be inspected member by member is just a number
 * that appeared. This view makes every agent accountable: their archetype, what
 * they care about, how they are disposed, where they got to in the journey, what
 * they did, and the reasoning fragment the engine produced for them.
 *
 * The confidence figure is deliberately presented the way the reference design
 * presents it — `0.71 (Simulated Estimate, n=24)` — because a bare decimal here
 * would read as a statistical probability when it is in fact the simulation's own
 * resolution. The label is not decoration; without it the number is misleading.
 *
 * Everything shown is derived by `src/core/agents.ts`, which is pure and
 * deterministic. No model writes any of this.
 */

export function AgentRoster({
  state,
  entries,
  selectedAgentId,
  onSelectAgent,
  className,
}: {
  state: RunViewState;
  /** The event log. Profiles are derived from it rather than from a second copy. */
  entries: readonly EventEnvelope[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<'all' | 'engaged' | 'ignored' | 'rejected'>('all');

  const profiles = useMemo(() => {
    if (!state.audience) return [];
    const index = segmentIndexer(state.audience.segments.map((s) => s.id));

    // Whichever pass the room is currently showing is the pass being inspected.
    const useResim = state.pass === 'B';
    const events: AgentEvent[] = [];
    for (const entry of entries) {
      const payload = entry.event;
      if (useResim && payload.type === 'resim_event') events.push(payload.event);
      else if (!useResim && payload.type === 'agent_event') events.push(payload.event);
    }

    return deriveAgentProfiles({ events, audience: state.audience, segmentIndex: index });
  }, [state.audience, state.pass, entries]);

  const summary = useMemo(() => profileSummary(profiles), [profiles]);

  const visible = useMemo(() => {
    if (filter === 'all') return profiles;
    if (filter === 'rejected') return profiles.filter((p) => p.action === 'REJECT');
    if (filter === 'ignored')
      return profiles.filter((p) => p.action === 'IGNORE' || p.action === 'STOP');
    return profiles.filter(
      (p) => p.action !== null && p.action !== 'IGNORE' && p.action !== 'STOP' && p.action !== 'REJECT',
    );
  }, [profiles, filter]);

  const selected = profiles.find((p) => p.id === selectedAgentId) ?? visible[0] ?? null;

  if (profiles.length === 0) {
    return (
      <Panel className={className}>
        <PanelHeader title="Synthetic agents" />
        <p className="px-4 py-6 text-center text-xs text-subtle">
          Agents appear once the audience has been constructed.
        </p>
      </Panel>
    );
  }

  return (
    <div className={cn('grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]', className)}>
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeader
          title="Synthetic agents"
          meta={`${summary.total} agents · ${summary.engaged} engaged · ${summary.ignored} moved on · ${summary.rejected} unconvinced`}
          event="agent_event"
          right={<Chip tone="accent">synthetic</Chip>}
        />

        <div className="flex flex-wrap gap-1 border-b border-line-soft px-4 py-2">
          {(
            [
              ['all', `All ${profiles.length}`],
              ['engaged', `Engaged ${summary.engaged}`],
              ['ignored', `Moved on ${summary.ignored}`],
              ['rejected', `Unconvinced ${summary.rejected}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'focus-ring rounded border px-2 py-0.5 font-mono text-3xs uppercase tracking-wider transition-colors',
                filter === key ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-subtle hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="scroll-thin min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
          {visible.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => onSelectAgent(profile.id)}
                className={cn(
                  'focus-ring flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors',
                  profile.id === selected?.id ? 'bg-accent/10' : 'hover:bg-surface2/50',
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: segmentColor(profile.segmentIndex) }}
                  aria-hidden
                />
                <span className="w-28 shrink-0 truncate text-xs text-fg">{profile.label}</span>
                <span className="hidden min-w-0 flex-1 truncate text-3xs text-subtle sm:block">
                  {profile.segmentLabel}
                </span>
                <span
                  className={cn(
                    'w-20 shrink-0 text-right font-mono text-3xs uppercase tracking-wider',
                    profile.action === 'REJECT'
                      ? 'text-negative'
                      : profile.action === 'IGNORE' || profile.action === 'STOP'
                        ? 'text-subtle'
                        : 'text-positive',
                  )}
                >
                  {profile.action ?? '—'}
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-subtle">No agents in this group.</li>
          ) : null}
        </ul>
      </Panel>

      {selected ? <AgentInspector profile={selected} populationSize={profiles.length} /> : null}
    </div>
  );
}

export function AgentInspector({
  profile,
  populationSize,
}: {
  profile: AgentProfile;
  populationSize: number;
}) {
  const negative = profile.action === 'REJECT' || profile.action === 'IGNORE' || profile.action === 'STOP';

  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: segmentColor(profile.segmentIndex) }}
          aria-hidden
        />
        <h2 className="truncate text-sm font-medium tracking-tight">{profile.label}</h2>
        <Chip tone="neutral" className="ml-auto shrink-0">
          synthetic agent
        </Chip>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Archetype">
          <p className="text-sm text-fg">{profile.archetypeLabel}</p>
          <p className="mt-0.5 text-3xs text-subtle">{profile.segmentLabel}</p>
        </Field>

        <Field label="Motivation">
          <p className="text-sm leading-snug text-fg">{profile.motivation.join(', ') || '—'}</p>
        </Field>

        <Field label="Disposition">
          <div className="flex flex-wrap gap-1">
            {profile.disposition.map((d) => (
              <Chip key={d}>{d}</Chip>
            ))}
          </div>
        </Field>

        <Field label="Current state">
          <p className="flex items-center gap-1.5 text-sm text-fg">
            <span
              className={cn(
                'inline-block size-2 rounded-full border',
                profile.state === 'decision' ? 'border-caution text-caution' : 'border-accent text-accent',
              )}
              aria-hidden
            />
            {stateLabel(profile.state).toUpperCase()}
          </p>
          <p className="mt-0.5 text-3xs text-subtle">round {profile.round}</p>
        </Field>

        <Field label="Reaction">
          <p className={cn('text-sm', negative ? 'text-negative' : 'text-positive')}>
            {profile.reaction}
          </p>
        </Field>

        <Field label="Action">
          <p className="font-mono text-sm uppercase tracking-wider text-fg">
            {profile.action ?? 'pending'}
          </p>
        </Field>

        {profile.reasoning ? (
          <Field label="Reasoning">
            <p className="text-sm leading-relaxed text-fg/90">{profile.reasoning}</p>
          </Field>
        ) : null}

        {profile.reasonCodes.length > 0 ? (
          <Field label="Signals">
            <div className="flex flex-wrap gap-1">
              {profile.reasonCodes.map((r) => (
                <Chip key={r}>{r}</Chip>
              ))}
            </div>
          </Field>
        ) : null}

        <Field label="Confidence">
          {/* The label is not decoration. A bare decimal here would read as a
              statistical probability, and this is the simulation's own resolution. */}
          <p className="text-sm text-fg">
            {profile.confidence.toFixed(2)}{' '}
            <span className="text-3xs text-subtle">
              (Simulated Estimate, n={populationSize})
            </span>
          </p>
        </Field>
      </div>

      <p className="border-t border-line-soft px-4 py-2 note">
        A synthetic agent, not a person. Traits and reasoning are generated from a seeded archetype
        library, so the same seed always rebuilds the same agent.
      </p>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="micro">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}
