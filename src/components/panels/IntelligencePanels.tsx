'use client';

import { useState } from 'react';
import type { MetricsBundle, WhyReport } from '../../core/domain';
import { cn } from '../../lib/cn';
import { Chip, Panel, PanelHeader, ValidationNote } from '../ui';

/**
 * Station 4 — what happened.
 *
 * Every value is shown with its sample size and an on-demand derivation. The
 * `n` and `method` are one interaction away rather than always on screen: density
 * without a wall of caveats in front of the numbers, but the provenance is always
 * reachable. A metric whose derivation cannot be inspected is just a number.
 */
export function MetricsPanel({
  metrics,
  label,
  className,
}: {
  metrics: MetricsBundle;
  label: 'A' | 'B';
  className?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const strongest = [...metrics.overall].sort((a, b) => b.value - a.value)[0]?.id;
  const weakest = [...metrics.overall].sort((a, b) => a.value - b.value)[0]?.id;

  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title={`What happened — Version ${label}`}
        meta={`${metrics.bookkeeping.agents} agents · ${metrics.bookkeeping.rounds} rounds · ${metrics.bookkeeping.events} events`}
        event="metrics_ready"
        right={<Chip>simulated</Chip>}
      />

      <div className="divide-y divide-line-soft">
        {metrics.overall.map((m) => {
          const isOpen = expanded === m.id;
          const highlight = m.id === strongest ? 'text-positive' : m.id === weakest ? 'text-negative' : '';
          return (
            <div key={m.id}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : m.id)}
                className="focus-ring flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface2/50"
                aria-expanded={isOpen}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{m.label}</span>
                <span className="tabular text-3xs text-subtle">n={m.n}</span>
                {/* A single bar, so the eye can rank the metrics instantly. */}
                <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-line sm:block">
                  <span
                    className={cn('block h-full', highlight === '' ? 'bg-accent' : highlight === 'text-positive' ? 'bg-positive' : 'bg-negative')}
                    style={{ width: `${Math.max(1, m.value)}%` }}
                  />
                </span>
                <span className={cn('tabular w-12 text-right text-sm', highlight)}>
                  {m.value.toFixed(1)}
                </span>
              </button>
              {isOpen ? (
                <div className="animate-enter bg-bg/40 px-4 pb-3">
                  <p className="note">
                    method: {m.method}
                  </p>
                  <p className="mt-1 note">
                    scale 0–100 · sample n={m.n} · {m.kind}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {metrics.disagreements.length > 0 ? (
        <div className="border-t border-line-soft px-4 py-3">
          <span className="micro">Where the audience split</span>
          <ul className="mt-2 space-y-2">
            {metrics.disagreements.slice(0, 3).map((d) => (
              <li key={d.metricId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">{d.metricId}</span>
                  <span className="tabular text-3xs text-subtle">spread {d.spread}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.bySegment.map((s) => (
                    <span key={s.segmentId} className="flex items-baseline gap-1">
                      <span className="truncate text-3xs text-subtle">{s.segmentLabel}</span>
                      <span className="tabular text-3xs text-fg">{s.value}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-line-soft px-4 py-2.5">
        <ValidationNote validation={{ state: 'not_established', note: 'Validation benchmark: being established.' }} />
      </div>
    </Panel>
  );
}

/**
 * Station 4 — why.
 *
 * Every claim opens onto its evidence. That is the feature: an explanation you
 * cannot audit is only another opinion, and the schema makes an evidence-free
 * claim unconstructable.
 */
export function WhyPanel({ why, className }: { why: WhyReport; className?: string }) {
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Why"
        meta="evidence-linked"
        event="why_ready"
        right={<Chip tone="accent">explanation</Chip>}
      />

      <div className="px-4 py-3.5">
        <span className="micro">Biggest signal</span>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          {why.biggestSignal.headline}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{why.biggestSignal.detail}</p>

        <ul className="mt-3 space-y-1">
          {why.biggestSignal.evidence.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpenEvidence(openEvidence === e.id ? null : e.id)}
                className="focus-ring flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-surface2/60"
                aria-expanded={openEvidence === e.id}
              >
                <span className="micro shrink-0">evidence</span>
                <span className="truncate font-mono text-3xs text-accent">{e.ref}</span>
              </button>
              {openEvidence === e.id ? (
                <p className="animate-enter px-1 pb-1 text-3xs leading-relaxed text-muted">{e.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {why.audienceSplit.length > 0 ? (
        <div className="border-t border-line-soft px-4 py-3">
          <span className="micro">Audience split</span>
          <ul className="mt-2 space-y-2">
            {why.audienceSplit.map((d) => (
              <li key={d.metricId}>
                <span className="text-3xs text-subtle">{d.metricId}</span>
                <div className="mt-1 space-y-1">
                  {d.bySegment.map((s) => (
                    <div key={s.segmentId} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 truncate text-3xs text-muted">{s.segmentLabel}</span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="block h-full bg-accent" style={{ width: `${Math.max(1, s.value)}%` }} />
                      </span>
                      <span className="tabular w-8 text-right text-3xs">{s.value}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-line-soft px-4 py-3">
        <span className="micro">Top friction</span>
        {why.topFrictions.length === 0 ? (
          <p className="mt-1.5 text-xs text-subtle">No dominant structural friction identified.</p>
        ) : (
          <ol className="mt-2 space-y-2.5">
            {why.topFrictions.map((f) => (
              <li key={f.rank}>
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-3xs text-caution">{f.rank}</span>
                  <span className="text-xs font-medium">{f.label}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{f.detail}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {f.evidence.map((e) => (
                    <Chip key={e.id}>{e.ref}</Chip>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {why.ungroundedClaims.length > 0 ? (
        <div className="border-t border-line-soft px-4 py-3">
          <span className="micro">Claims that could not be grounded</span>
          <ul className="mt-1.5 space-y-1">
            {why.ungroundedClaims.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed text-caution">
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 note">
            Reported rather than invented. These are not used to justify any recommendation.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
