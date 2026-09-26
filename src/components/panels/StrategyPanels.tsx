'use client';

import type { Comparison, CreativeBrief } from '../../core/domain';
import { cn } from '../../lib/cn';
import { Chip, Panel, PanelHeader } from '../ui';

/**
 * Station 5 — the Creative Director and Version B.
 *
 * Each of the three changes shows the evidence it rests on; the schema requires
 * it, so this panel cannot render an unsupported recommendation.
 */
export function BriefPanel({ brief, className }: { brief: CreativeBrief; className?: string }) {
  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Creative Director"
        meta={`${brief.changes.length} changes · version B ready`}
        event="brief_ready"
        right={<Chip tone="accent">strategy</Chip>}
      />

      <div className="grid gap-px bg-line-soft sm:grid-cols-3">
        <BriefField label="Strongest signal" value={brief.strongestSignal} />
        <BriefField label="Biggest risk" value={brief.biggestRisk} tone="negative" />
        <BriefField label="Highest-impact change" value={brief.highestImpactChange} tone="accent" />
      </div>

      <div className="border-t border-line-soft px-4 py-3.5">
        <span className="micro">Top 3 changes</span>
        <ol className="mt-2 space-y-3">
          {brief.top3Changes.map((c) => (
            <li key={c.rank}>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xs text-caution">{c.rank}</span>
                <span className="text-xs font-medium">{c.change}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.expectedEffect}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.evidence.map((e) => (
                  <Chip key={e.id}>{e.ref}</Chip>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-px border-t border-line-soft bg-line-soft sm:grid-cols-2">
        <CopyableAsset label="Recommended hook" value={brief.recommendedHook} />
        <CopyableAsset label="Recommended CTA" value={brief.recommendedCTA} />
      </div>

      <div className="border-t border-line-soft px-4 py-3">
        <span className="micro">Strategy</span>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{brief.strategy}</p>
      </div>

      <div className="border-t border-line-soft px-4 py-3">
        <span className="micro">Version A → B</span>
        <ul className="mt-2 space-y-2.5">
          {brief.changes.map((c, i) => (
            <li key={i} className="rounded border border-line-soft bg-surface2/30 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{c.field}</span>
              </div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                <div>
                  <span className="micro">before</span>
                  <p className="mt-0.5 text-3xs leading-relaxed text-negative/80">{c.before}</p>
                </div>
                <div>
                  <span className="micro">after</span>
                  <p className="mt-0.5 text-3xs leading-relaxed text-positive/90">{c.after}</p>
                </div>
              </div>
              <p className="mt-1.5 note">{c.reason}</p>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function BriefField({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'negative' | 'accent';
}) {
  const tones: Record<string, string> = {
    default: 'text-fg',
    negative: 'text-negative/90',
    accent: 'text-accent',
  };
  return (
    <div className="bg-surface px-4 py-3">
      <span className="micro">{label}</span>
      <p className={cn('mt-1 text-xs leading-relaxed', tones[tone])}>{value}</p>
    </div>
  );
}

function CopyableAsset({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="micro">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
          }}
          className="focus-ring micro rounded border border-line px-1.5 py-0.5 hover:text-fg"
        >
          copy
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg/90">{value}</p>
    </div>
  );
}

/**
 * Station 6 — did the room change?
 *
 * The control-mode statement sits ABOVE the table, not beneath it. Whether this
 * was a controlled comparison is a property of the result, not a footnote to it:
 * reading the numbers before knowing that would be reading them wrong.
 *
 * Rendered as tabular rows rather than a chart on purpose — the eye compares two
 * aligned numbers faster than it compares two bars, and the design language is
 * already numeric.
 */
export function ComparisonPanel({
  comparison,
  className,
}: {
  comparison: Comparison;
  className?: string;
}) {
  const anyUp = comparison.rows.some((r) => r.direction === 'up');
  const anyDown = comparison.rows.some((r) => r.direction === 'down');

  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Did the room change?"
        meta="same audience · new content"
        event="comparison_ready"
        right={
          <Chip tone={comparison.samePopulation ? 'positive' : 'negative'}>
            {comparison.samePopulation ? 'controlled' : 'not controlled'}
          </Chip>
        }
      />

      {/* Control-mode provenance, stated before the numbers. */}
      <div
        className={cn(
          'border-b px-4 py-2.5',
          comparison.samePopulation
            ? 'border-positive/30 bg-positive/5'
            : 'border-negative/40 bg-negative/5',
        )}
      >
        <ul className="space-y-0.5">
          {comparison.caveats.map((c, i) => (
            <li
              key={i}
              className={cn(
                'text-xs leading-relaxed',
                c.startsWith('WARNING') ? 'text-negative' : 'text-muted',
              )}
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* Column headers, monospaced so the digits align. */}
      <div className="flex items-center gap-3 border-b border-line-soft px-4 py-2">
        <span className="micro flex-1">Metric</span>
        <span className="micro w-14 text-right">Ver. A</span>
        <span className="micro w-14 text-right">Ver. B</span>
        <span className="micro w-14 text-right">Δ</span>
      </div>

      <div className="divide-y divide-line-soft">
        {comparison.rows.map((row) => (
          <div key={row.metricId} className="flex items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.label}</span>
            <span className="tabular w-14 text-right text-sm text-subtle">
              {row.a.value.toFixed(1)}
            </span>
            <span className="tabular w-14 text-right text-sm">{row.b.value.toFixed(1)}</span>
            <span
              className={cn(
                'tabular w-14 text-right text-sm',
                row.direction === 'up'
                  ? 'text-positive'
                  : row.direction === 'down'
                    ? 'text-negative'
                    : 'text-subtle',
              )}
            >
              {row.delta > 0 ? '+' : ''}
              {row.delta.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-line-soft px-4 py-3">
        <p className="note">
          {anyUp && anyDown
            ? 'Version B moved some metrics up and others down. Both directions are reported — a rewrite that improves everything is a sign the model has stopped discriminating.'
            : anyUp
              ? 'Every measured metric moved in the same direction for the same synthetic audience.'
              : 'No metric improved under the same synthetic audience.'}{' '}
          These are simulated changes, not real-world lift. Population hash{' '}
          {comparison.audienceRef.populationHash} was verified identical across both runs.
        </p>
      </div>
    </Panel>
  );
}
