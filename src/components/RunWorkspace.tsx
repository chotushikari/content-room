'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRunStream } from '../lib/use-run-stream';
import type { CreateRunRequest } from '../core/domain';
import { cn } from '../lib/cn';
import { ModeBadge, Panel } from './ui';
import { AppShell } from './shell/AppShell';
import { ConsoleBar, StageStepper, Tag, type StageState } from './world/parts';
import { SimulationWorld } from './world/SimulationWorld';
import { IntelligenceRail } from './world/IntelligenceRail';
import { StartPanel } from './StartPanel';
import { VerdictView } from './VerdictView';
import { AgentRoster } from './AgentInspector';
import { EventConsole, EventLedger } from './EventConsole';
import { EventFeed } from './EventFeed';
import { TheRoom } from './room/TheRoom';
import { AudiencePanel, ContentPanel, DnaPanel } from './panels/ContentPanels';
import { MetricsPanel, WhyPanel } from './panels/IntelligencePanels';
import { BriefPanel, ComparisonPanel } from './panels/StrategyPanels';

type View = 'world' | 'verdict' | 'agents' | 'detail';
type RunState = ReturnType<typeof useRunStream>['state'];

/**
 * The workspace: one simulation world, four ways in.
 *
 * The world is the default because the product's argument is spatial — this
 * content, inside this audience, reacting. Verdict is the summary for someone
 * who wants the answer; Agents is the roster; Detail keeps every raw panel for
 * anyone auditing the reasoning.
 *
 * All four are projections of one event-sourced state, so they cannot disagree.
 */

/** The five stages in the stepper, and the state that completes each. */
const STAGES: Array<{ n: string; label: string; done: (s: RunState) => boolean }> = [
  { n: '01', label: 'Content', done: (s) => s.asset !== null },
  { n: '02', label: 'Audience', done: (s) => s.audience !== null },
  { n: '03', label: 'Simulation', done: (s) => s.metricsA !== null },
  { n: '04', label: 'Intelligence', done: (s) => s.why !== null },
  { n: '05', label: 'Strategy', done: (s) => s.brief !== null },
];

export function RunWorkspace() {
  const { state, entries, error, start, resimulate, cancel, reset } = useRunStream();
  const [view, setView] = useState<View>('world');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  /**
   * Pick up whatever the landing page handed over.
   *
   * Passed through sessionStorage rather than the URL because pasted content is
   * routinely longer than a query string will carry. Cleared on read so a
   * refresh cannot silently re-run it.
   */
  useEffect(() => {
    let pending: unknown = null;
    try {
      const raw = window.sessionStorage.getItem('content-room:pending');
      if (raw) {
        pending = JSON.parse(raw);
        window.sessionStorage.removeItem('content-room:pending');
      }
    } catch {
      pending = null;
    }
    if (!pending || typeof pending !== 'object' || !('source' in pending)) return;
    const source = (pending as { source: CreateRunRequest['source'] }).source;
    void start({
      source,
      options: { audienceSize: 24, rounds: 3, engineId: 'deterministic', demoMode: false },
    });
    // One-shot handoff on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasRun = entries.length > 0;
  const busy = state.running || state.resimulating;

  const stages = useMemo(() => {
    const out: Array<{ n: string; label: string; state: StageState }> = [];
    let activeFound = false;
    for (const s of STAGES) {
      if (hasRun && s.done(state)) {
        out.push({ n: s.n, label: s.label, state: 'done' });
      } else if (!activeFound) {
        activeFound = true;
        out.push({ n: s.n, label: s.label, state: hasRun ? 'active' : 'next' });
      } else {
        out.push({ n: s.n, label: s.label, state: 'next' });
      }
    }
    return out;
  }, [state, hasRun]);

  const canResimulate =
    Boolean(state.runId && state.audience && state.dna && state.versionB && state.metricsA) &&
    !state.comparison;

  function analysePastedText(text: string) {
    void start({
      source: {
        type: 'manual',
        kind: state.asset?.kind ?? 'social_post',
        title: state.asset?.title ?? '',
        body: text,
      },
      options: {
        audienceSize: state.audience?.size ?? 24,
        rounds: state.ofRounds || 3,
        engineId: 'deterministic',
        demoMode: false,
      },
    });
  }

  function runResimulation() {
    if (!state.runId || !state.audience || !state.dna || !state.versionB || !state.metricsA) return;
    void resimulate(state.runId, {
      audience: state.audience,
      dna: state.dna,
      versionBAsset: state.versionB,
      metricsA: state.metricsA,
      rounds: state.ofRounds || 3,
    });
  }

  const agentLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of state.audience?.agents ?? []) map[a.id] = a.label;
    return map;
  }, [state.audience]);

  return (
    <AppShell
      tabs={
        hasRun ? (
          <nav className="flex items-center gap-0.5" aria-label="View">
            {(
              [
                ['world', 'World'],
                ['verdict', 'Verdict'],
                ['agents', 'Agents'],
                ['detail', 'Detail'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={view === id}
                className={cn(
                  'focus-ring rounded-sm px-2.5 py-1 text-[12.5px] transition-colors',
                  view === id ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : null
      }
      status={
        <div className="flex items-center gap-2">
          <ModeBadge
            mode={state.mode}
            provisional={state.provisionalMode}
            providers={state.providers}
            running={busy}
          />
          {hasRun ? (
            <button
              type="button"
              onClick={reset}
              className="focus-ring rounded-sm px-2 py-1 text-[12.5px] text-subtle hover:text-fg"
            >
              New run
            </button>
          ) : null}
          {busy ? (
            <button
              type="button"
              onClick={cancel}
              className="focus-ring rounded-sm px-2 py-1 text-[12.5px] text-subtle hover:text-negative"
            >
              Stop
            </button>
          ) : null}
        </div>
      }
    >
      {hasRun ? (
        <ConsoleBar
          left={
            <>
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-fg">
                Simulation<span className="text-subtle">_</span>world
              </span>
              <Tag tone={busy ? 'accent' : 'default'}>
                {busy ? 'auto-run' : state.pass === 'B' ? 're-test' : 'idle'}
              </Tag>
              <span className="hidden font-mono text-[10.5px] text-subtle sm:inline">
                {state.asset?.contentHash.slice(0, 12)}
              </span>
            </>
          }
          right={
            <span className="flex items-center gap-2">
              <span className="tabular text-[11.5px] text-subtle">
                {state.audience?.agents.length ?? 0} agents
              </span>
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase',
                  busy ? 'border-live/50 bg-live/10 text-live' : 'border-line bg-surface2/60 text-subtle',
                )}
              >
                <span
                  className={cn('size-1.5 rounded-full', busy ? 'bg-live animate-live' : 'bg-line-strong')}
                  aria-hidden
                />
                {busy ? 'room is live' : 'room at rest'}
              </span>
            </span>
          }
        />
      ) : null}

      {hasRun ? <StageStepper stages={stages} /> : null}

      <main className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6">
        {error ? (
          <Panel className="mb-4 border-negative/40 bg-negative/5 px-4 py-3">
            <p className="text-[12.5px] leading-relaxed text-negative">{error}</p>
          </Panel>
        ) : null}
        {state.failure ? (
          <Panel className="mb-4 border-caution/40 bg-caution/5 px-4 py-3">
            <p className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-caution">
              {state.failure.code} · {state.failure.stage}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-caution">{state.failure.message}</p>
          </Panel>
        ) : null}

        {!hasRun ? (
          <div className="mx-auto max-w-3xl py-6">
            <StartPanel
              onStart={(r) => void start(r)}
              running={busy}
              resimulating={state.resimulating}
            />
          </div>
        ) : null}

        {/* ------------------------------------------------------------ world */}
        {hasRun && view === 'world' ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-3">
              <SimulationWorld
                state={state}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
                onInspect={() => setView('detail')}
              />

              {canResimulate ? (
                <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-fg">Test the improved version</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                      The same {state.audience?.size ?? 0} synthetic agents, new content — so the
                      difference is the content rather than the audience.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={runResimulation}
                    disabled={state.resimulating}
                    className={cn(
                      'focus-ring shrink-0 rounded-sm border px-4 py-2 text-[13px] font-medium transition-colors',
                      state.resimulating
                        ? 'cursor-not-allowed border-line text-subtle'
                        : 'border-accent/60 bg-accent/15 text-fg hover:bg-accent/25',
                    )}
                  >
                    {state.resimulating ? 'Testing…' : 'Test it'}
                  </button>
                </Panel>
              ) : null}

              {state.comparison ? <ComparisonPanel comparison={state.comparison} /> : null}
            </div>

            <IntelligenceRail
              state={state}
              entries={entries}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              className="min-h-[520px] xl:sticky xl:top-[104px]"
            />
          </div>
        ) : null}

        {/* ---------------------------------------------------------- verdict */}
        {hasRun && view === 'verdict' ? (
          <div className="mx-auto max-w-3xl">
            <VerdictView state={state} onShowDetail={() => setView('detail')} />
            {canResimulate ? (
              <Panel className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-fg">Test the improved version</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    Same audience, new content.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runResimulation}
                  disabled={state.resimulating}
                  className="focus-ring shrink-0 rounded-sm border border-accent/60 bg-accent/15 px-4 py-2 text-[13px] font-medium text-fg transition-colors hover:bg-accent/25"
                >
                  {state.resimulating ? 'Testing…' : 'Test it'}
                </button>
              </Panel>
            ) : null}
            {state.comparison ? (
              <div className="mt-4">
                <ComparisonPanel comparison={state.comparison} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ----------------------------------------------------------- agents */}
        {hasRun && view === 'agents' ? (
          <div className="flex flex-col gap-4">
            <AgentRoster
              state={state}
              entries={entries}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
            />
            <TheRoom
              state={state}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              className="min-h-[380px] min-w-0"
            />
          </div>
        ) : null}

        {/* ----------------------------------------------------------- detail */}
        {hasRun && view === 'detail' ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              {state.asset ? (
                <ContentPanel
                  asset={state.asset}
                  note={state.ingestNote}
                  onUseContent={analysePastedText}
                />
              ) : null}
              {state.dna ? <DnaPanel dna={state.dna} /> : null}
              {state.audience ? <AudiencePanel audience={state.audience} /> : null}
              {state.metricsA ? <MetricsPanel metrics={state.metricsA} label="A" /> : null}
              {state.why ? <WhyPanel why={state.why} /> : null}
              {state.brief ? <BriefPanel brief={state.brief} /> : null}
              {state.pass === 'B' && state.metricsB ? (
                <MetricsPanel metrics={state.metricsB} label="B" />
              ) : null}
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
              <EventFeed
                entries={entries}
                agentLabels={agentLabels}
                className="min-h-[260px] max-h-[400px]"
              />
              <EventLedger entries={entries} />
              <EventConsole
                entries={entries}
                running={busy}
                className="min-h-[260px] max-h-[520px]"
              />
            </div>
          </div>
        ) : null}

        <footer className="mt-8 border-t border-line-soft pt-4">
          <p className="honest">
            Synthetic audience agents, not people. Every number is a simulated estimate and no
            result is representative of any real population. Validation benchmark: being
            established.
          </p>
        </footer>
      </main>
    </AppShell>
  );
}
