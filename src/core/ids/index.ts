import { hash32 } from '../rng';
import type { ContentAsset, PersonaAgent, Segment, AudienceRef } from '../domain';

/**
 * Deterministic identity helpers.
 *
 * Every hash documents exactly which fields it includes, because
 * `populationHash` is a CONTRACT: the controlled re-simulation in the
 * comparison step asserts equality on it. Adding a field here invalidates every
 * previously recorded comparison, so treat a change as a coordination event.
 */

/** Hash of the content itself. Changes between Version A and Version B. */
export function computeContentHash(asset: Omit<ContentAsset, 'contentHash' | 'id'>): string {
  return hash32(
    'content',
    asset.kind,
    asset.title.trim().toLowerCase(),
    asset.body.trim(),
    asset.source.type,
  ).toString(16);
}

export function contentAssetId(hash: string, kind: string): string {
  return `asset_${kind}_${hash}`;
}

/**
 * Hash of the ordered persona list.
 * Includes identity-bearing fields only: id, archetype, segment and traits.
 * Deliberately EXCLUDES `bio`, which is cosmetic enrichment — a bio reword
 * must not invalidate a comparison.
 */
export function computePopulationHash(agents: readonly PersonaAgent[]): string {
  const parts: Array<string | number> = ['population', agents.length];
  for (const a of agents) {
    parts.push(
      a.id,
      a.archetypeId,
      a.segmentId,
      a.traits.skepticism,
      a.traits.priceSensitivity,
      a.traits.attentionBudget,
      a.traits.noveltySeeking,
      a.traits.socialPropensity,
      a.traits.domainKnowledge,
    );
  }
  return hash32(...parts).toString(16);
}

/**
 * Identity of an audience.
 *
 * Deliberately does NOT include the content hash: the audience is a population
 * held constant across a controlled comparison, so its identity must not change
 * when the content changes between Version A and Version B.
 */
export function computeAudienceId(
  seed: string,
  segments: readonly Segment[],
  size: number,
): string {
  return hash32(
    'audience',
    seed,
    size,
    ...segments.map((s) => `${s.id}:${s.archetypeIds.join('+')}:${s.size}`),
  ).toString(16);
}

export function makeAudienceRef(
  seed: string,
  segments: readonly Segment[],
  agents: readonly PersonaAgent[],
  controlMode: AudienceRef['controlMode'] = 'same_population',
): AudienceRef {
  return {
    audienceId: computeAudienceId(seed, segments, agents.length),
    audienceSeed: seed,
    populationHash: computePopulationHash(agents),
    controlMode,
  };
}

/** Deterministic event id. Depends on position, not on generation order. */
export function makeEventId(
  runId: string,
  agentId: string,
  round: number,
  stage: string,
  seq: number,
): string {
  return `ev_${hash32(runId, agentId, round, stage, seq).toString(16)}`;
}

export function makeRunId(seed: string, contentHash: string, label: string): string {
  return `run_${label.toLowerCase()}_${hash32(seed, contentHash, label).toString(16)}`;
}

/** Derive a stable audience seed from content when the caller supplies none. */
export function deriveAudienceSeed(contentHash: string): string {
  return `seed_${contentHash}`;
}
