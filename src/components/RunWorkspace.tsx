'use client';

import { useMemo } from 'react';
import { useRunStream } from '../lib/use-run-stream';
import { isUnlocked } from '../lib/run-reducer';
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
import type { ContentKind } from '../core/domain';

/**
 * The run workspace.
 *
 * Every panel here is a projection of a single event-sourced state object. The
 * order in which panels appear is decided by which events have arrived, not by a
 * step counter — so the interface cannot show a result before the event that
 * produced it, and the console beside it always shows why anything is on screen.
 */
export function RunWorkspace() {
  const { state, entries, error, start, resimulate, cancel, reset } = useRunStream();

  const agentLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of state.audience?.agents ?? []) map[a.id] = a.label;
    return map;
  }, [state.audience]);

  const hasRun = entries.length > 0;
  const showRoom = isUnlocked(state, 'room');

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Content Room
          </span>
          <span className="hidden text-2xs text-subtle sm:inline">
            rehearse before you publish
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge
            mode={state.mode}
            provisional={state.provisionalMode}
            providers={state.providers}
            running={state.running || state.resimulating}
          />
          {hasRun ? (
            <button
              type="button"
              onClick={reset}
              className="focus-ring rounded border border-line px-2 py-1 font-mono text-3xs uppercase tracking-wider text-subtle hover:text-fg"
            >
              new run
            </button>
          ) : null}
          {state.running || state.resimulating ? (
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

      {/* --------------------------------------------------------- error bar */}
      {error ? (
        <Panel className="mt-4 border-negative/40 bg-negative/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-negative">{error}</p>
        </Panel>
      ) : null}
      {state.failure ? (
        <Panel className="mt-4 border-caution/40 bg-caution/5 px-4 py-3">
          <p className="micro">run_failed · {state.failure.code} at {state.failure.stage}</p>
          <p className="mt-1 text-xs leading-relaxed text-caution">{state.failure.message}</p>
        </Panel>
      ) : null}

      {/* ------------------------------------------------------------ start */}
      {!hasRun ? (
        <div className="mt-6">
          <StartPanel
            onStart={(request) => void start(request)}
            running={state.running}
            resimulating={state.resimulating}
          />
          <p className="mx-auto mt-4 max-w-3xl text-center note">
            A synthetic audience rehearsal system. Not a prediction of real-world performance, and
            not a substitute for audience research.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- room */}
      {showRoom ? (
        <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TheRoom state={state} className="min-h-[420px] min-w-0" />
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <EventFeed entries={entries} agentLabels={agentLabels} className="min-h-[280px] max-h-[420px]" />
            <EventLedger entries={entries} />
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------- panels + console rail */}
      {hasRun ? (
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {state.asset ? (
              <ContentPanel asset={state.asset} note={state.ingestNote} />
            ) : null}
            {state.dna ? <DnaPanel dna={state.dna} /> : null}
            {state.audience ? <AudiencePanel audience={state.audience} /> : null}
            {state.metricsA ? <MetricsPanel metrics={state.metricsA} label="A" /> : null}
            {state.why ? <WhyPanel why={state.why} /> : null}
            {state.brief ? <BriefPanel brief={state.brief} /> : null}

            {/* The re-test is a deliberate action, so it is a deliberate click. */}
            {state.brief && !state.comparison ? (
              <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Same audience, new content</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Re-run the identical synthetic population against Version B. The population hash
                    is asserted, not assumed — if the audience changed, the comparison is refused.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void resimulate(state.runId ?? '')}
                  disabled={state.resimulating || !state.runId}
                  className={cn(
                    'focus-ring shrink-0 rounded border px-3.5 py-2 text-sm font-medium transition-colors',
                    state.resimulating
                      ? 'cursor-not-allowed border-line text-subtle'
                      : 'border-accent/60 bg-accent/15 text-fg hover:bg-accent/25',
                  )}
                >
                  {state.resimulating ? 'Re-simulating…' : 'Re-simulate'}
                </button>
              </Panel>
            ) : null}

            {state.comparison ? <ComparisonPanel comparison={state.comparison} /> : null}

            {state.pass === 'B' && state.metricsB ? (
              <MetricsPanel metrics={state.metricsB} label="B" />
            ) : null}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <EventConsole
              entries={entries}
              running={state.running || state.resimulating}
              className="min-h-[280px] max-h-[560px] xl:sticky xl:top-4"
            />
          </div>
        </div>
      ) : null}

      <footer className="mt-8 border-t border-line-soft pt-4">
        <p className="note">
          Synthetic audience agents, not people. Every metric is a simulated estimate and no result
          is representative of any real population. Validation benchmark: being established.
        </p>
      </footer>
    </main>
  );
}

/** Re-exported for the page, so the kind list stays in one place. */
export type { ContentKind };
