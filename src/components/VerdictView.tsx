'use client';

import { useState } from 'react';
import type { Comparison, MetricsBundle } from '../core/domain';
import { deriveVerdict, performanceScore, bandFor, type ContentVerdict } from '../core/summary';
import type { RunViewState } from '../lib/run-reducer';
import { cn } from '../lib/cn';
import { Chip, Panel } from './ui';

/**
 * The verdict screen — the default view.
 *
 * Everything here answers one of five questions a user actually has:
 *   1. Is this good?            → the score and the band
 *   2. Will people like it?     → per-segment reaction
 *   3. What do you think?       → the read
 *   4. What do I change?        → the improvements, with the rewritten text
 *   5. Will it spread?          → viral potential
 *
 * The event log, the room, the metric tables and the evidence chain all still
 * exist — behind "Show how we got this". They are the justification, not the
 * product. Twelve separate metrics is not more informative than one score; it
 * just moves the work onto the reader.
 *
 * HONESTY: the score is the simulation's estimate, computed from simulated
 * reactions by deterministic code. It is labelled as such wherever it appears,
 * and it is never described as a forecast of real-world performance.
 */

const BAND_TONE: Record<ContentVerdict['band'], string> = {
  Weak: 'text-negative',
  Mixed: 'text-caution',
  Solid: 'text-accent',
  Strong: 'text-positive',
};

export function VerdictView({
  state,
  onShowDetail,
}: {
  state: RunViewState;
  onShowDetail: () => void;
}) {
  const { metricsA, metricsB, dna, versionBDna, why, brief, audience, comparison } = state;

  if (!metricsA || !dna || !audience) {
    return (
      <Panel className="px-6 py-10 text-center">
        <p className="text-sm text-muted">Analysing…</p>
      </Panel>
    );
  }

  // Once the rewrite has been tested, the verdict describes the REWRITTEN
  // content. Showing Version A's score next to a "+34 after" delta was actively
  // misleading: the headline number must be the one the delta is about.
  const afterRun = state.pass === 'B' && metricsB !== null;
  const activeMetrics = afterRun && metricsB ? metricsB : metricsA;
  const activeDna = afterRun ? (versionBDna ?? dna) : dna;

  const verdict = deriveVerdict({
    metrics: activeMetrics,
    dna: activeDna,
    // Version A's explanation describes Version A's problems, so it is not
    // reused for the after-verdict.
    why: afterRun ? null : why,
    brief,
    audience,
  });

  const scoreBefore = afterRun ? performanceScore(metricsA) : null;

  return (
    <div className="flex flex-col gap-4">
      <ScoreCard
        verdict={verdict}
        scoreBefore={scoreBefore}
        comparison={comparison}
        isAfter={afterRun}
      />

      <Panel className="overflow-hidden">
        <Section title="Will they like it" meta="by audience segment">
          <ul className="divide-y divide-line-soft">
            {verdict.segments.map((s) => (
              <li key={s.segmentId} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn('tabular w-9 shrink-0 text-sm', BAND_TONE[s.band])}>
                  {Math.round(s.score)}
                </span>
                <span className="w-40 shrink-0 truncate text-xs text-fg">{s.label}</span>
                <span className="hidden h-1 flex-1 overflow-hidden rounded-full bg-line sm:block">
                  <span
                    className={cn(
                      'block h-full',
                      s.band === 'Strong' || s.band === 'Solid' ? 'bg-accent' : 'bg-negative',
                    )}
                    style={{ width: `${Math.max(2, s.score)}%` }}
                  />
                </span>
                <span className="min-w-0 flex-1 text-3xs text-muted sm:flex-none sm:text-right">
                  {s.note}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </Panel>

      <Panel className="overflow-hidden">
        <Section title="The read" meta="our opinion">
          <p className="px-4 py-3.5 text-sm leading-relaxed text-fg/90">{verdict.read}</p>
          <div className="grid gap-px border-t border-line-soft bg-line-soft sm:grid-cols-2">
            <div className="bg-surface px-4 py-3">
              <span className="micro">What is working</span>
              <ul className="mt-1.5 space-y-1">
                {verdict.likes.map((l, i) => (
                  <li key={i} className="text-xs leading-relaxed text-positive/90">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface px-4 py-3">
              <span className="micro">What is not</span>
              <ul className="mt-1.5 space-y-1">
                {verdict.concerns.map((c, i) => (
                  <li key={i} className="text-xs leading-relaxed text-negative/90">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      </Panel>

      <Panel className="overflow-hidden">
        <Section title="What to change" meta="in priority order">
          <ol className="divide-y divide-line-soft">
            {verdict.improvements.map((imp, i) => (
              <li key={i} className="px-4 py-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-3xs text-caution">{i + 1}</span>
                  <span className="text-sm font-medium">{imp.title}</span>
                  <Chip className="ml-auto shrink-0">moves {imp.moves}</Chip>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{imp.why}</p>
                {imp.example ? (
                  <div className="mt-2 rounded border border-line-soft bg-bg/50 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="micro">use this instead</span>
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard?.writeText(imp.example ?? '')}
                        className="focus-ring micro rounded border border-line px-1.5 py-0.5 hover:text-fg"
                      >
                        copy
                      </button>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-fg">{imp.example}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      </Panel>

      <Panel className="overflow-hidden">
        <Section title="Will it spread" meta="simulated amplification">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
            <div>
              <div className={cn('tabular text-3xl leading-none', BAND_TONE[verdict.band])}>
                {verdict.viralBand}
              </div>
              <div className="micro mt-1">viral potential</div>
            </div>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">{verdict.viralNote}</p>
          </div>
          <p className="border-t border-line-soft px-4 py-2 note">
            Amplification intent from the simulated audience. An estimate about synthetic agents,
            not a forecast of real reach.
          </p>
        </Section>
      </Panel>

      <button
        type="button"
        onClick={onShowDetail}
        className="focus-ring mx-auto rounded border border-line px-4 py-2 text-xs text-muted transition-colors hover:text-fg"
      >
        Show the working — room, evidence, event log
      </button>

      <p className="text-center note">
        {verdict.method}. Simulated estimate from {audience.size} synthetic agents across{' '}
        {audience.segments.length} segments. Not representative of any real population.
        Validation benchmark: being established.
      </p>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line-soft px-4 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {meta ? <span className="micro shrink-0">{meta}</span> : null}
        </div>
      </header>
      {children}
    </>
  );
}

/**
 * The score. Deliberately the largest thing on the screen: if a user reads only
 * one element, this is the one that has to carry the message.
 */
function ScoreCard({
  verdict,
  scoreBefore,
  comparison,
  isAfter,
}: {
  verdict: ContentVerdict;
  scoreBefore: number | null;
  comparison: Comparison | null;
  isAfter: boolean;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const delta = scoreBefore === null ? null : Math.round((verdict.score - scoreBefore) * 10) / 10;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-end gap-3">
          <span className={cn('tabular text-6xl leading-none', BAND_TONE[verdict.band])}>
            {Math.round(verdict.score)}
          </span>
          <div className="pb-1">
            <div className="tabular text-lg leading-none text-muted">/ 100</div>
            <div className={cn('mt-1 text-sm font-medium', BAND_TONE[verdict.band])}>
              {verdict.band}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {isAfter ? <p className="micro">your rewritten version</p> : null}
          <p className={cn('text-base leading-snug sm:text-lg', isAfter ? 'mt-1' : '')}>
            {verdict.headline}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMethod((v) => !v)}
              className="focus-ring micro rounded border border-line px-1.5 py-0.5 hover:text-fg"
              aria-expanded={showMethod}
            >
              simulated score
            </button>
            {delta !== null ? (
              <span className="micro">
                was {Math.round(scoreBefore ?? 0)},{' '}
                <span className={delta > 0 ? 'text-positive' : 'text-negative'}>
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>{' '}
                after your changes
              </span>
            ) : null}
          </div>
          {showMethod ? <p className="mt-2 note">{verdict.method}</p> : null}
        </div>
      </div>

      {comparison ? (
        <div className="border-t border-line-soft bg-bg/40 px-5 py-3 sm:px-6">
          <p className="note">
            Tested against the same {comparison.audienceRef.populationHash} synthetic audience, so
            the difference comes from your content rather than from a different set of people.
            Population hash verified.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
