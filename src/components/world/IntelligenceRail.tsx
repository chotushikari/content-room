'use client';

import { useMemo, useState } from 'react';
import type { RunViewState } from '../../lib/run-reducer';
import { deriveAgentProfiles, profileSummary, stateLabel, type AgentProfile } from '../../core/agents';
import type { AgentEvent } from '../../core/domain';
import { segmentColor, segmentIndexer, reactionColorFor } from '../room/palette';
import type { EventEnvelope } from '../../lib/event-log';
import { cn } from '../../lib/cn';
import { MetricBar, Tag } from './parts';

/**
 * The intelligence rail.
 *
 * Four tabs over one run: the signal, its evidence, the agents behind it, and
 * the disagreement. The INSPECT tab is the default because it answers the two
 * questions a user actually has — what is wrong, and which of these people is
 * saying so.
 *
 * The recommendation is offered as COPY, not as an automatic edit. "Apply
 * suggestion" that silently rewrote someone's content would be a worse product
 * than one that hands over the wording and lets them decide.
 */

type Tab = 'inspect' | 'evidence' | 'agents' | 'signals';

export function IntelligenceRail({
  state,
  entries,
  selectedAgentId,
  onSelectAgent,
  className,
}: {
  state: RunViewState;
  entries: readonly EventEnvelope[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>('inspect');
  const [copied, setCopied] = useState(false);

  const metrics = state.metricsA;
  const finding = state.why?.topFrictions[0] ?? null;
  const disagreement = metrics?.disagreements[0] ?? null;
  const brief = state.brief;

  const profiles = useMemo(() => {
    if (!state.audience) return [];
    const index = segmentIndexer(state.audience.segments.map((s) => s.id));
    const useResim = state.pass === 'B';
    const events: AgentEvent[] = [];
    for (const entry of entries) {
      const p = entry.event;
      if (useResim && p.type === 'resim_event') events.push(p.event);
      else if (!useResim && p.type === 'agent_event') events.push(p.event);
    }
    return deriveAgentProfiles({ events, audience: state.audience, segmentIndex: index });
  }, [state.audience, state.pass, entries]);

  const summary = useMemo(() => profileSummary(profiles), [profiles]);
  const selected =
    profiles.find((p) => p.id === selectedAgentId) ??
    profiles.find((p) => p.action === 'REJECT') ??
    profiles[0] ??
    null;

  const rejected = profiles.filter((p) => p.action === 'REJECT').length;
  const value = (id: string) => metrics?.overall.find((m) => m.id === id)?.value ?? 0;

  async function copyFix() {
    const text = brief?.recommendedHook;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded border border-line-soft bg-surface/50',
        className,
      )}
    >
      <header className="flex items-center gap-1 border-b border-line-soft px-2 py-1.5">
        <span className="px-1.5 font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
          Intelligence
        </span>
        <div className="ml-auto flex">
          {(['inspect', 'evidence', 'agents', 'signals'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                'focus-ring rounded-sm px-2 py-1 font-mono text-[10px] tracking-[0.09em] uppercase transition-colors',
                tab === t
                  ? 'border-b border-accent text-accent'
                  : 'text-subtle hover:text-fg',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tab === 'inspect' ? (
          <>
            {/* ---------------------------------------------------- signal */}
            {finding ? (
              <section className="rounded border border-negative/40 bg-negative/5 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-negative" aria-hidden>
                    ◉
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-negative">
                    Signal
                  </span>
                </div>
                <h3 className="mt-1.5 text-[14px] font-semibold text-fg">{finding.label}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  {/* The rejection count is only stated when it is non-zero. An
                      earlier version printed "0 agents flagged this" directly
                      above a sentence about rejections, because the count is of
                      REJECT actions while the friction may be about something
                      else entirely. */}
                  {rejected > 0
                    ? `${rejected} agent${rejected === 1 ? '' : 's'} rejected the content outright. `
                    : ''}
                  {finding.detail}
                </p>

                {disagreement ? (
                  <div className="mt-3 space-y-2">
                    {disagreement.bySegment.slice(0, 3).map((seg, i) => (
                      <div key={seg.segmentId}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] text-muted">{seg.segmentLabel}</span>
                          <span className="tabular text-[12.5px] text-fg">{Math.round(seg.value)}%</span>
                        </div>
                        <span className="mt-1 flex h-1.5 gap-[2px]" aria-hidden>
                          {Array.from({ length: 28 }, (_, k) => (
                            <span
                              key={k}
                              className="flex-1 rounded-[1px]"
                              style={{
                                background:
                                  (k / 28) * 100 < seg.value
                                    ? segmentColor(i)
                                    : 'color-mix(in oklab, var(--color-line) 55%, transparent)',
                              }}
                            />
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="rounded border border-line-soft bg-surface/40 p-3">
                <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                  Signal
                </span>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  No single friction dominates. The response reflects audience fit rather than a
                  defect in the content.
                </p>
              </section>
            )}

            {/* --------------------------------------------- selected agent */}
            {selected ? (
              <section className="rounded border border-line-soft bg-surface/40 p-3">
                <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                  Selected agent
                </span>
                <AgentCard profile={selected} onSelect={onSelectAgent} />
              </section>
            ) : null}

            {/* ------------------------------------------- recommendation */}
            <section className="rounded border border-line-soft bg-surface/40 p-3">
              <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                Recommendation
              </span>
              {brief ? (
                <>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg/90">
                    {brief.highestImpactChange}
                  </p>
                  <p className="mt-1.5 note">
                    Re-run the same synthetic audience to see the simulated change. This is not a
                    forecast of real-world performance.
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyFix()}
                    disabled={!brief.recommendedHook}
                    className="focus-ring mt-2.5 w-full rounded-sm border border-accent/60 bg-accent/15 px-3 py-2 text-[12.5px] font-medium text-fg transition-colors hover:bg-accent/25 disabled:opacity-40"
                  >
                    {copied ? 'Copied ✓' : 'Copy the suggested opening'}
                  </button>
                </>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-muted">
                  The Creative Director runs after the room has been read.
                </p>
              )}
            </section>
          </>
        ) : null}

        {tab === 'evidence' ? (
          <>
            {state.why ? (
              <>
                <section className="rounded border border-line-soft bg-surface/40 p-3">
                  <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                    Why
                  </span>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg">
                    {state.why.biggestSignal.headline}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                    {state.why.biggestSignal.detail}
                  </p>
                </section>
                <section className="rounded border border-line-soft bg-surface/40 p-3">
                  <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                    Evidence
                  </span>
                  <ul className="mt-2 space-y-2">
                    {state.why.biggestSignal.evidence.map((e) => (
                      <li key={e.id}>
                        <span className="block font-mono text-[10.5px] text-accent">{e.ref}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                          {e.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : (
              <p className="text-[12.5px] text-subtle">No explanation yet.</p>
            )}

            <section className="rounded border border-line-soft bg-surface/40 p-3">
              <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                Every metric carries its own derivation
              </span>
              <ul className="mt-2 space-y-1.5">
                {(metrics?.overall ?? []).slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] text-muted">{m.label}</span>
                    <span className="tabular text-[12px] text-fg">
                      {m.value}
                      <span className="ml-1.5 text-subtle">n={m.n}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 note">Simulated estimates. None of these is a measured value.</p>
            </section>
          </>
        ) : null}

        {tab === 'agents' ? (
          <>
            <section className="rounded border border-line-soft bg-surface/40 p-2">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                  {summary.total} agents
                </span>
                <span className="flex gap-1.5">
                  <Tag tone="positive">{summary.engaged} engaged</Tag>
                  <Tag tone="negative">{summary.rejected} rejected</Tag>
                </span>
              </div>
              <ul className="scroll-thin max-h-[300px] divide-y divide-line-soft overflow-y-auto">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelectAgent(p.id)}
                      className={cn(
                        'focus-ring flex w-full items-center gap-2 px-1.5 py-1.5 text-left transition-colors',
                        p.id === selected?.id ? 'bg-accent/10' : 'hover:bg-surface2/60',
                      )}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: segmentColor(p.segmentIndex) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{p.label}</span>
                      <span
                        className="shrink-0 font-mono text-[10px] tracking-[0.06em] uppercase"
                        style={{ color: reactionColorFor(p.action) }}
                      >
                        {p.action ?? '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {selected ? (
              <section className="rounded border border-line-soft bg-surface/40 p-3">
                <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                  Selected
                </span>
                <AgentCard profile={selected} onSelect={onSelectAgent} />
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'signals' ? (
          <section className="space-y-3">
            <div className="rounded border border-line-soft bg-surface/40 p-3">
              <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                Where the audience split
              </span>
              <div className="mt-2 space-y-3">
                {(metrics?.disagreements ?? []).slice(0, 3).map((d) => (
                  <div key={d.metricId}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] capitalize text-muted">
                        {d.metricId.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <span className="tabular text-[12px] text-subtle">spread {d.spread}</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {d.bySegment.map((s, i) => (
                        <MetricBar
                          key={s.segmentId}
                          label={s.segmentLabel}
                          value={s.value}
                          tone={segmentColor(i)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {(metrics?.disagreements ?? []).length === 0 ? (
                  <p className="text-[12.5px] text-subtle">No significant split in this run.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded border border-line-soft bg-surface/40 p-3">
              <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">
                What the room did
              </span>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(metrics?.bookkeeping.actionCounts ?? {})
                  .filter(([, n]) => n > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, n]) => (
                    <li key={action} className="flex items-center gap-2">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: reactionColorFor(action) }}
                        aria-hidden
                      />
                      <span className="flex-1 font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted">
                        {action}
                      </span>
                      <span className="tabular text-[12px] text-fg">{n}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 note">
                Attention {Math.round(value('attention'))}% · Trust {Math.round(value('trust'))}% ·
                Reach {agents0(state)} agents
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function agents0(state: RunViewState): number {
  return state.audience?.agents.length ?? 0;
}

/** The compact agent read-out used in the rail. */
function AgentCard({
  profile,
  onSelect,
}: {
  profile: AgentProfile;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      className="focus-ring mt-2 w-full rounded border border-line-soft bg-bg/40 p-2.5 text-left transition-colors hover:border-line"
    >
      <div className="flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-medium"
          style={{ background: segmentColor(profile.segmentIndex, 0.3), color: segmentColor(profile.segmentIndex) }}
          aria-hidden
        >
          {profile.label.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-fg">
            {profile.label}
          </span>
          <span className="block truncate text-[11px] text-subtle">
            {profile.archetypeLabel} · {profile.segmentLabel}
          </span>
        </span>
        <Tag tone={profile.action === 'REJECT' ? 'negative' : 'default'}>
          {stateLabel(profile.state)}
        </Tag>
      </div>

      {profile.reasoning ? (
        <p className="mt-2 border-l border-line pl-2 text-[12px] leading-relaxed italic text-fg/85">
          “{profile.reasoning}”
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-3 border-t border-line-soft pt-2">
        <span className="tabular text-[11px] text-subtle">
          action <span className="text-fg">{profile.action ?? '—'}</span>
        </span>
        {/* The label is not decoration: a bare decimal here would read as a
            statistical probability rather than the simulation's resolution. */}
        <span className="tabular text-[11px] text-subtle">
          confidence <span className="text-fg">{profile.confidence.toFixed(2)}</span>
          <span className="ml-1">(simulated estimate)</span>
        </span>
      </div>
    </button>
  );
}
