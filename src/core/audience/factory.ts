import {
  ARCHETYPE_LABELS,
  type ArchetypeId,
  type Audience,
  type ContentDNA,
  type PersonaAgent,
  type Segment,
  type Traits,
} from '../domain';
import { clamp01, rngFor } from '../rng';
import { makeAudienceRef } from '../ids';

/**
 * Deterministic audience construction.
 *
 * The split this file embodies is the project's central rule:
 *   - AI proposes WHICH segments are relevant to this content (with rationale)
 *   - deterministic code EXPANDS them into a reproducible population
 *
 * Because expansion is seeded, the same seed yields an identical
 * `populationHash`, which is what makes the controlled Version A/B comparison
 * in the comparison step mechanically true rather than a promise.
 */

/** Archetype trait priors. A LIBRARY of behavioural stances, not demographics. */
type TraitPrior = Traits;

const ARCHETYPE_PRIORS: Record<ArchetypeId, TraitPrior> = {
  skeptic: { skepticism: 0.85, priceSensitivity: 0.6, attentionBudget: 0.5, noveltySeeking: 0.3, socialPropensity: 0.3, domainKnowledge: 0.7 },
  power_user: { skepticism: 0.6, priceSensitivity: 0.4, attentionBudget: 0.8, noveltySeeking: 0.6, socialPropensity: 0.4, domainKnowledge: 0.9 },
  casual_scroller: { skepticism: 0.4, priceSensitivity: 0.5, attentionBudget: 0.2, noveltySeeking: 0.6, socialPropensity: 0.5, domainKnowledge: 0.3 },
  trend_follower: { skepticism: 0.3, priceSensitivity: 0.5, attentionBudget: 0.4, noveltySeeking: 0.9, socialPropensity: 0.8, domainKnowledge: 0.4 },
  creator: { skepticism: 0.5, priceSensitivity: 0.5, attentionBudget: 0.7, noveltySeeking: 0.7, socialPropensity: 0.8, domainKnowledge: 0.7 },
  early_adopter: { skepticism: 0.45, priceSensitivity: 0.35, attentionBudget: 0.7, noveltySeeking: 0.95, socialPropensity: 0.6, domainKnowledge: 0.7 },
  price_sensitive: { skepticism: 0.65, priceSensitivity: 0.95, attentionBudget: 0.5, noveltySeeking: 0.4, socialPropensity: 0.4, domainKnowledge: 0.5 },
  practical: { skepticism: 0.6, priceSensitivity: 0.6, attentionBudget: 0.6, noveltySeeking: 0.3, socialPropensity: 0.3, domainKnowledge: 0.6 },
  community_builder: { skepticism: 0.45, priceSensitivity: 0.5, attentionBudget: 0.7, noveltySeeking: 0.5, socialPropensity: 0.9, domainKnowledge: 0.6 },
  professional: { skepticism: 0.6, priceSensitivity: 0.45, attentionBudget: 0.5, noveltySeeking: 0.4, socialPropensity: 0.4, domainKnowledge: 0.8 },
  student: { skepticism: 0.5, priceSensitivity: 0.85, attentionBudget: 0.6, noveltySeeking: 0.7, socialPropensity: 0.7, domainKnowledge: 0.4 },
  entertainer: { skepticism: 0.35, priceSensitivity: 0.5, attentionBudget: 0.6, noveltySeeking: 0.8, socialPropensity: 0.85, domainKnowledge: 0.4 },
  researcher: { skepticism: 0.8, priceSensitivity: 0.4, attentionBudget: 0.75, noveltySeeking: 0.5, socialPropensity: 0.3, domainKnowledge: 0.95 },
  brand_loyalist: { skepticism: 0.25, priceSensitivity: 0.45, attentionBudget: 0.6, noveltySeeking: 0.4, socialPropensity: 0.6, domainKnowledge: 0.6 },
  curious_explorer: { skepticism: 0.4, priceSensitivity: 0.5, attentionBudget: 0.7, noveltySeeking: 0.85, socialPropensity: 0.5, domainKnowledge: 0.5 },
  busy_user: { skepticism: 0.55, priceSensitivity: 0.6, attentionBudget: 0.15, noveltySeeking: 0.3, socialPropensity: 0.25, domainKnowledge: 0.6 },
  value_seeker: { skepticism: 0.55, priceSensitivity: 0.75, attentionBudget: 0.6, noveltySeeking: 0.5, socialPropensity: 0.5, domainKnowledge: 0.6 },
  social_sharer: { skepticism: 0.35, priceSensitivity: 0.5, attentionBudget: 0.5, noveltySeeking: 0.6, socialPropensity: 0.95, domainKnowledge: 0.4 },
  silent_consumer: { skepticism: 0.5, priceSensitivity: 0.55, attentionBudget: 0.4, noveltySeeking: 0.4, socialPropensity: 0.1, domainKnowledge: 0.5 },
};

const TRAIT_KEYS: Array<keyof Traits> = [
  'skepticism',
  'priceSensitivity',
  'attentionBudget',
  'noveltySeeking',
  'socialPropensity',
  'domainKnowledge',
];

/**
 * Per-agent jitter. Without this, every member of an archetype would be an
 * identical clone and the population would produce degenerate, unanimous
 * results — which is exactly the failure mode the homogeneity eval guards.
 */
function deriveTraits(archetypeId: ArchetypeId, rng: () => number): Traits {
  const prior = ARCHETYPE_PRIORS[archetypeId];
  const out = {} as Traits;
  for (const key of TRAIT_KEYS) {
    const jitter = (rng() - 0.5) * 0.44; // +/- 0.22
    out[key] = Math.round(clamp01(prior[key] + jitter) * 1000) / 1000;
  }
  return out;
}

/** Distribute `size` across segments proportionally, deterministically. */
function allocateSizes(segments: readonly Segment[], size: number): number[] {
  const declared = segments.reduce((sum, s) => sum + s.size, 0);
  if (declared <= 0) {
    const base = Math.floor(size / segments.length);
    const sizes = segments.map(() => base);
    for (let i = 0; i < size - base * segments.length; i++) sizes[i] = (sizes[i] ?? 0) + 1;
    return sizes;
  }

  const raw = segments.map((s) => (s.size / declared) * size);
  const floored = raw.map((x) => Math.max(1, Math.floor(x)));
  let assigned = floored.reduce((a, b) => a + b, 0);

  // Hand out any remainder to the segments with the largest fractional part,
  // ties broken by index so the result is order-stable.
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  let cursor = 0;
  while (assigned < size) {
    const slot = order[cursor % order.length];
    if (slot) {
      floored[slot.i] = (floored[slot.i] ?? 0) + 1;
      assigned++;
    }
    cursor++;
  }
  while (assigned > size) {
    // Trim from the largest segment so no segment drops below 1.
    let largest = 0;
    for (let i = 1; i < floored.length; i++) {
      if ((floored[i] ?? 0) > (floored[i - 1] ?? 0)) largest = i;
    }
    if ((floored[largest] ?? 0) <= 1) break;
    floored[largest] = (floored[largest] as number) - 1;
    assigned--;
  }

  return floored;
}

/**
 * Archetype interest vocabularies.
 *
 * These must NOT be derived from the content's own topic tokens. An earlier
 * version built each agent's interests out of the content's keywords, which made
 * every agent overlap the topic by construction — interestFit then saturated at
 * ~0.89 for the entire population and contributed nothing to the model. The
 * point of a heterogeneous audience is that topical relevance VARIES.
 *
 * So these are domain vocabularies per stance, and only a couple of the
 * content's own tokens are mixed in afterwards.
 */
const ARCHETYPE_INTERESTS: Record<ArchetypeId, string[]> = {
  skeptic: ['evidence', 'claims', 'proof', 'marketing'],
  power_user: ['workflow', 'automation', 'tooling', 'efficiency'],
  casual_scroller: ['feed', 'trend', 'fun', 'short'],
  trend_follower: ['trend', 'launch', 'viral', 'social'],
  creator: ['hook', 'format', 'production', 'creative'],
  early_adopter: ['launch', 'beta', 'experiment', 'innovation'],
  price_sensitive: ['cost', 'pricing', 'budget', 'free'],
  practical: ['process', 'outcome', 'time', 'reliability'],
  community_builder: ['community', 'group', 'discussion', 'support'],
  professional: ['process', 'team', 'review', 'reporting'],
  student: ['learning', 'cost', 'guide', 'explanation'],
  entertainer: ['story', 'format', 'energy', 'audience'],
  researcher: ['evidence', 'data', 'method', 'analysis'],
  brand_loyalist: ['brand', 'product', 'update', 'trust'],
  curious_explorer: ['idea', 'question', 'discover', 'new'],
  busy_user: ['time', 'summary', 'priority', 'speed'],
  value_seeker: ['value', 'cost', 'outcome', 'benefit'],
  social_sharer: ['share', 'opinion', 'news', 'discussion'],
  silent_consumer: ['product', 'quality', 'price', 'compare'],
};

function interestsFor(
  archetypeId: ArchetypeId,
  topicTokens: readonly string[],
  rng: () => number,
): string[] {
  const baseline = ARCHETYPE_INTERESTS[archetypeId];
  // A couple of the content's own tokens, so some agents are topically closer
  // than others — which is the variation the model needs to discriminate.
  const topical = topicTokens.slice(0, 6).filter(() => rng() > 0.5).slice(0, 2);
  return [...baseline, ...topical].slice(0, 8);
}

function priorBeliefsFor(archetypeId: ArchetypeId, dna: ContentDNA, rng: () => number): string[] {
  const beliefs: string[] = [];
  const risk = dna.risks[0];
  const friction = dna.potentialFrictions[0]?.label;

  if (archetypeId === 'skeptic' || archetypeId === 'researcher') {
    beliefs.push('Claims without evidence are usually marketing.');
    if (friction) beliefs.push(`Watch for: ${friction}`);
  } else if (archetypeId === 'price_sensitive' || archetypeId === 'value_seeker') {
    beliefs.push('Nothing here is worth paying for unless the value is obvious.');
  } else if (archetypeId === 'brand_loyalist' || archetypeId === 'community_builder') {
    beliefs.push('I give things I already trust more room to make their point.');
  } else if (archetypeId === 'busy_user') {
    beliefs.push('If I do not understand it in five seconds I move on.');
  } else if (archetypeId === 'practical') {
    beliefs.push('Show me what changes in my week and I will consider it.');
  } else {
    beliefs.push('I will give this a few seconds before I decide.');
  }

  if (risk && rng() > 0.6) beliefs.push(`Seen this before: ${risk.slice(0, 90)}`);
  return beliefs.slice(0, 6);
}

export type BuildAudienceInput = {
  dna: ContentDNA;
  segments: Segment[];
  size: number;
  audienceSeed: string;
  /** Provider id recorded on each persona, for provenance. */
  producedBy: string;
  bios?: Record<string, string>;
  controlMode?: 'same_population' | 'regenerated';
};

export function buildAudience(input: BuildAudienceInput): Audience {
  const { dna, segments, size, audienceSeed } = input;
  const sizes = allocateSizes(segments, size);
  const agents: PersonaAgent[] = [];
  let globalIndex = 0;

  segments.forEach((segment, segIdx) => {
    const segmentSize = sizes[segIdx] ?? 0;
    for (let i = 0; i < segmentSize; i++) {
      const agentId = `ag_${segIdx}_${i}`;
      // Isolated per-agent rng, keyed on the SEED ONLY.
      //
      // Deliberately excludes the content hash: trait derivation must not depend
      // on which version of the content is under test, otherwise Version B would
      // produce a different population and the comparison would stop being
      // controlled. This is what the populationHash assertion protects.
      //
      // Keying per-agent also means an agent's personality does not depend on
      // how many agents were generated before it.
      const rng = rngFor(0, audienceSeed, agentId);

      const archetypeId =
        segment.archetypeIds[i % segment.archetypeIds.length] ?? segment.archetypeIds[0];
      if (!archetypeId) continue;

      agents.push({
        id: agentId,
        label: `${ARCHETYPE_LABELS[archetypeId]} #${String(globalIndex + 1).padStart(2, '0')}`,
        archetypeId,
        segmentId: segment.id,
        traits: deriveTraits(archetypeId, rng),
        interests: interestsFor(archetypeId, dna.audienceSignals.length > 0 ? dna.audienceSignals : [], rng),
        priorBeliefs: priorBeliefsFor(archetypeId, dna, rng),
        bio: input.bios?.[agentId] ?? '',
        producedBy: input.producedBy,
      });
      globalIndex++;
    }
  });

  const ref = makeAudienceRef(
    audienceSeed,
    segments,
    agents,
    input.controlMode ?? 'same_population',
  );

  return {
    ref,
    size: agents.length,
    segments,
    agents,
  };
}

/** Exposed for tests: the trait prior table, so diversity can be asserted. */
export const __traitPriors = ARCHETYPE_PRIORS;
