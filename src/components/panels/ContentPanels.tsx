'use client';

import type { Audience, ContentAsset, ContentDNA } from '../../core/domain';
import { ARCHETYPE_LABELS } from '../../core/domain';
import { cn, truncate } from '../../lib/cn';
import { Chip, MonoStat, Panel, PanelHeader } from '../ui';

/** Station 1 — the content under examination, pinned for the rest of the run. */
export function ContentPanel({
  asset,
  note,
  className,
}: {
  asset: ContentAsset;
  note: string | null;
  className?: string;
}) {
  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Content"
        meta={`${asset.kind.replace(/_/g, ' ')} · hash ${asset.contentHash}`}
        event="ingest_resolved"
        right={asset.partial ? <Chip tone="caution">metadata only</Chip> : <Chip>full content</Chip>}
      />
      <div className="px-4 py-3.5">
        {asset.title ? (
          <h3 className="text-sm font-medium leading-snug">{asset.title}</h3>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
          {asset.body ? truncate(asset.body, 900) : '(no body text)'}
        </p>

        {note ? (
          <p className="mt-3 rounded border border-caution/40 bg-caution/5 px-2.5 py-2 text-xs leading-relaxed text-caution">
            {note}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip>{asset.importedBy}</Chip>
          <Chip>{asset.source.type === 'url' ? asset.source.platform : asset.source.type}</Chip>
          {asset.media.length > 0 ? <Chip>{asset.media.length} media</Chip> : null}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Station 1 — Content DNA.
 *
 * Strengths and risks are shown with equal weight. A panel that only displayed
 * strengths would make this a flattery tool rather than a rehearsal one.
 */
export function DnaPanel({ dna, className }: { dna: ContentDNA; className?: string }) {
  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Content DNA"
        meta={`confidence ${dna.confidence}`}
        event="dna_ready"
        right={<Chip tone={dna.confidence < 0.5 ? 'caution' : 'neutral'}>simulated reading</Chip>}
      />
      <div className="grid gap-px bg-line-soft sm:grid-cols-2">
        <DnaField label="Hook" value={dna.hook} span />
        <DnaField label="Promise" value={dna.promise} />
        <DnaField label="Value proposition" value={dna.valueProposition} />
        <DnaField label="Call to action" value={dna.cta} />
        <DnaField label="Topic" value={dna.topic} />
        <DnaField
          label="Emotion / tone"
          value={[...dna.emotion, ...dna.tone].join(' · ')}
        />
        {dna.visualStyle ? <DnaField label="Visual style" value={dna.visualStyle} span /> : null}

        <div className="bg-surface px-4 py-3">
          <span className="micro">Strengths</span>
          <ul className="mt-1.5 space-y-1">
            {dna.strengths.map((s, i) => (
              <li key={`s${i}`} className="text-xs leading-relaxed text-positive/90">
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface px-4 py-3">
          <span className="micro">Risks</span>
          {dna.risks.length === 0 ? (
            <p className="mt-1.5 text-xs text-subtle">None identified.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {dna.risks.map((r, i) => (
                <li key={`r${i}`} className="text-xs leading-relaxed text-negative/90">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        {dna.potentialFrictions.length > 0 ? (
          <div className="bg-surface px-4 py-3 sm:col-span-2">
            <span className="micro">Potential friction</span>
            <ol className="mt-1.5 space-y-1.5">
              {dna.potentialFrictions.map((f, i) => (
                <li key={`f${i}`} className="text-xs leading-relaxed">
                  <span className="font-mono text-3xs text-caution">{i + 1}</span>{' '}
                  <span className="text-fg">{f.label}</span>
                  <span className="text-muted"> — {f.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function DnaField({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={cn('bg-surface px-4 py-3', span ? 'sm:col-span-2' : '')}>
      <span className="micro">{label}</span>
      <p className="mt-1 text-xs leading-relaxed text-fg/90">{value || '—'}</p>
    </div>
  );
}

/**
 * Station 2 — the contextual audience.
 *
 * Segments first with their rationale (why THIS segment for THIS content), then
 * the population. The seed is shown, quietly, because the population's
 * reproducibility is a claim the product makes and should be able to show.
 */
export function AudiencePanel({ audience, className }: { audience: Audience; className?: string }) {
  const archetypeTally = new Map<string, number>();
  for (const a of audience.agents) {
    archetypeTally.set(a.archetypeId, (archetypeTally.get(a.archetypeId) ?? 0) + 1);
  }

  return (
    <Panel className={cn('overflow-hidden', className)}>
      <PanelHeader
        title="Contextual audience"
        meta={`${audience.size} synthetic agents · seed ${audience.ref.audienceSeed}`}
        event="audience_ready"
        right={<Chip tone="accent">population {audience.ref.populationHash}</Chip>}
      />
      <div className="grid gap-px bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-4 py-3">
          <span className="micro">Segments — derived from this content</span>
          <ul className="mt-2 space-y-2.5">
            {audience.segments.map((s) => (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{s.label}</span>
                  <span className="tabular text-3xs text-subtle">n={s.size}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.rationale}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.archetypeIds.map((id) => (
                    <Chip key={id}>{ARCHETYPE_LABELS[id]}</Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface px-4 py-3">
          <span className="micro">Archetype mix</span>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {[...archetypeTally.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([id, n]) => (
                <div key={id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-3xs text-muted">
                    {ARCHETYPE_LABELS[id as keyof typeof ARCHETYPE_LABELS] ?? id}
                  </span>
                  <span className="tabular text-3xs text-subtle">{n}</span>
                </div>
              ))}
          </div>
          <p className="mt-3 note">
            Synthetic agents, not people. Traits are derived from a seeded archetype library, so the
            same seed always rebuilds the same population — which is what makes the Version A/B
            re-test a controlled comparison.
          </p>
        </div>
      </div>
    </Panel>
  );
}

export function AudienceStats({ audience }: { audience: Audience }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MonoStat label="Agents" value={audience.size} />
      <MonoStat label="Segments" value={audience.segments.length} />
      <MonoStat label="Archetypes" value={new Set(audience.agents.map((a) => a.archetypeId)).size} />
      <MonoStat label="Population" value={audience.ref.populationHash} tone="muted" />
    </div>
  );
}
