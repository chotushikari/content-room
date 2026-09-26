'use client';

import { useMemo, useState } from 'react';
import { useRunStream } from '../lib/use-run-stream';
import { cn } from '../lib/cn';
import { ModeBadge, Panel } from './ui';
import { StageRail } from './StageRail';
import { StartPanel } from './StartPanel';
import { EventConsole, EventLedger } from './EventConsole';
import { EventFeed } from './EventFeed';
import { TheRoom } from './room/TheRoom';
import { AudiencePanel, ContentPanel, DnaPanel } from './panels/ContentPanels';
import { MetricsPanel, WhyPanel } from './panels/IntelligencePanels';
import { BriefPanel, ComparisonPanel } from './panels/StrategyPanels';
import { VerdictView } from './VerdictView';
import { AgentRoster } from './AgentInspector';

/**
 * The workspace.
 *
 * Two views over one event-sourced state:
 *
 *  - **Verdict** (default): one score, one paragraph of opinion, one list of
 *    changes, and whether it will spread. This is the product.
 *  - **Detail**: the room, the per-metric tables, the evidence chain, the raw
 *    event console. This is the justification, and it is one click away rather
 *    than in the user's face.
 *
 * Both are projections of the same reducer state, so switching between them
 * cannot produce different answers.
 */
export function RunWorkspace() {
  const { state, entries, error, start, resimulate, cancel, reset } = useRunStream();
  const [view, setView] = useState<'verdict' | 'agents' | 'detail'>('verdict');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const agentLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of state.audience?.agents ?? []) map[a.id] = a.label;
    return map;
  }, [state.audience]);

  const hasRun = entries.length > 0;
  const busy = state.running || state.resimulating;

  const canResimulate =
    Boolean(state.runId && state.audience && state.dna && state.versionB && state.metricsA) &&
    !state.comparison;

  /**
   * Re-run with pasted text.
   *
   * Offered because a social link usually yields a headline and nothing else —
   * the paste path is the primary route for the content this product is most
   * useful for, not an error fallback.
   */
  function analysePastedText(text: string) {
    const kind = state.asset?.kind ?? 'social_post';
    void start({
      source: { type: 'manual', kind, title: state.asset?.title ?? '', body: text },
      options: { audienceSize: state.audience?.size ?? 24, rounds: state.ofRounds || 3, engineId: 'deterministic', demoMode: false },
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

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Content Room
          </span>
          <span className="hidden text-2xs text-subtle sm:inline">rehearse before you publish</span>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge
            mode={state.mode}
            provisional={state.provisionalMode}
            providers={state.providers}
            running={busy}
          />
          {hasRun ? (
            <nav className="flex items-center gap-1" aria-label="View">
              {(
                [
                  ['verdict', 'Verdict'],
                  ['agents', 'Agents'],
                  ['detail', 'Working'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-current={view === id}
                  className={
                    view === id
                      ? 'focus-ring rounded border border-accent/60 bg-accent/10 px-2 py-1 font-mono text-3xs uppercase tracking-wider text-accent'
                      : 'focus-ring rounded border border-line px-2 py-1 font-mono text-3xs uppercase tracking-wider text-subtle hover:text-fg'
                  }
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : null}
          {hasRun ? (
            <button
              type="button"
              onClick={reset}
              className="focus-ring rounded border border-line px-2 py-1 font-mono text-3xs uppercase tracking-wider text-subtle hover:text-fg"
            >
              new run
            </button>
          ) : null}
          {busy ? (
            <button
              type="button"
              onClick={cancel}
              className="focus-ring rounded border border-line px-2 py-1 font-mono text-3xs uppercase tracking-wider text-subtle hover:text-negative"
            >
              stop
            </button>
          ) : null}
        </div>
      </header>

      {hasRun ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StageRail state={state} />
          <span className="micro shrink-0">
            {state.stageLabel}
            {state.ofRounds > 0 ? ` · round ${state.round}/${state.ofRounds}` : ''}
            {state.pass === 'B' ? ' · version B' : ''}
          </span>
        </div>
      ) : null}

      {error ? (
        <Panel className="mt-4 border-negative/40 bg-negative/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-negative">{error}</p>
        </Panel>
      ) : null}
      {state.failure ? (
        <Panel className="mt-4 border-caution/40 bg-caution/5 px-4 py-3">
          <p className="micro">
            {state.failure.code} at {state.failure.stage}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-caution">{state.failure.message}</p>
        </Panel>
      ) : null}

      {/* ------------------------------------------------------------- start */}
      {!hasRun ? (
        <div className="mt-6">
          <StartPanel
            onStart={(request) => void start(request)}
            running={state.running}
            resimulating={state.resimulating}
          />
          <p className="mx-auto mt-4 max-w-2xl text-center note">
            A synthetic audience rehearsal system. Not a prediction of real-world performance, and
            not a substitute for audience research.
          </p>
        </div>
      ) : null}

      {/* ----------------------------------------------------------- verdict */}
      {hasRun && view === 'verdict' ? (
        <div className="mt-5">
          <VerdictView state={state} onShowDetail={() => setView('detail')} />

          {state.asset && (state.asset.partial || state.asset.body.trim().length < 200) ? (
            <div className="mt-4">
              <ContentPanel
                asset={state.asset}
                note={state.ingestNote}
                onUseContent={analysePastedText}
              />
            </div>
          ) : null}

          {canResimulate ? (
            <Panel className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">Test the improved version</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Run the rewritten content past the exact same {state.audience?.size ?? 0} simulated
                  people, so the difference is the content and not the audience.
                </p>
              </div>
              <button
                type="button"
                onClick={runResimulation}
                disabled={state.resimulating}
                className={cn(
                  'focus-ring shrink-0 rounded border px-4 py-2 text-sm font-medium transition-colors',
                  state.resimulating
                    ? 'cursor-not-allowed border-line text-subtle'
                    : 'border-accent/60 bg-accent/15 text-fg hover:bg-accent/25',
                )}
              >
                {state.resimulating ? 'Testing…' : 'Test it'}
              </button>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------ agents */}
      {hasRun && view === 'agents' ? (
        <div className="mt-5 flex flex-col gap-4">
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
            className="min-h-[360px] min-w-0"
          />
        </div>
      ) : null}

      {/* ------------------------------------------------------------ detail */}
      {hasRun && view === 'detail' ? (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <TheRoom
              state={state}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              className="min-h-[420px] min-w-0"
            />
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
              <EventFeed
                entries={entries}
                agentLabels={agentLabels}
                className="min-h-[280px] max-h-[420px]"
              />
              <EventLedger entries={entries} />
            </div>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
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
              {state.comparison ? <ComparisonPanel comparison={state.comparison} /> : null}
              {state.pass === 'B' && state.metricsB ? (
                <MetricsPanel metrics={state.metricsB} label="B" />
              ) : null}
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
              <EventConsole
                entries={entries}
                running={busy}
                className="min-h-[280px] max-h-[560px] xl:sticky xl:top-4"
              />
            </div>
          </div>
        </div>
      ) : null}

      <footer className="mt-8 border-t border-line-soft pt-4">
        <p className="note">
          Synthetic audience agents, not people. Every number is a simulated estimate and no result
          is representative of any real population. Validation benchmark: being established.
        </p>
      </footer>
    </main>
  );
}
