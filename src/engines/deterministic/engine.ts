import {
  REACTION_ACTIONS,
  type AgentEvent,
  type ContentDNA,
  type JourneyStage,
  type PersonaAgent,
  type ReactionAction,
  type Traits,
} from '../../core/domain';
import { clamp01, pick as pickFrom, rngFor } from '../../core/rng';
import { extractFeatures, type ContentFeatures } from '../../core/features/extract';
import { makeEventId } from '../../core/ids';
import type { SimulationEngine, SimulationInput } from '../types';
import { ENGINE_VERSION } from './coefficients';
import {
  actionWeights,
  interestFit,
  pEngage,
  pKeepAttention,
  pPositive,
  reinforce,
} from './model';
import { composeExcerpt, evidenceRefsFor, reasonCodesFor } from './excerpts';

/**
 * Deterministic simulation engine — the product's DEFAULT engine.
 *
 * No model calls. No network. No clock. No Math.random(). This is what makes
 * the whole journey work with zero API keys, offline, with no database.
 *
 * Reproducibility is order-independent by construction: every sampled value is
 * derived from `(seed, agentId, round)` rather than from one sequential stream,
 * so the result for one agent never depends on how many agents were processed
 * before it. Verified by tests/engine-order-independence.test.ts.
 */

function journeyRun(agent: PersonaAgent, traits: Traits, round: number, seed: number) {
  const rng = rngFor(seed, agent.id, round, 'journey');
  return {
    /** Draw the next sample in this agent-round's isolated stream. */
    next: rng,
    pick: <T>(items: readonly T[]): T => pickFrom(rng, items),
  };
}

function sampleAction(
  rng: () => number,
  weights: ReadonlyArray<{ action: ReactionAction; weight: number }>,
): { action: ReactionAction; share: number } {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return { action: 'IGNORE', share: 0 };
  let roll = rng() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return { action: entry.action, share: entry.weight / total };
  }
  const last = weights[weights.length - 1];
  return { action: last?.action ?? 'IGNORE', share: 1 };
}

function traitsFor(agent: PersonaAgent, segmentShare: number, roundsElapsed: number): Traits {
  return reinforce(agent.traits, segmentShare, roundsElapsed);
}

async function* runDeterministic(input: SimulationInput): AsyncGenerator<AgentEvent> {
  const { runId, asset, dna, audience, rounds, seed, signal } = input;
  const text = asset.body.trim().length > 0 ? asset.body : asset.title;
  const features: ContentFeatures = extractFeatures(text, asset.kind);

  // Per-segment positive share from the previous round, for bounded social
  // reinforcement. Segment (not cluster) is used deliberately: cluster is a
  // view concept and must never leak into the simulation.
  let previousShare: Record<string, number> = {};

  for (let round = 1; round <= rounds; round++) {
    const roundActions = new Map<string, ReactionAction>();
    let seq = 0;

    const emit = (
      agent: PersonaAgent,
      stage: JourneyStage,
      action: ReactionAction | null,
      intensity: number,
      dnaForReasons: ContentDNA,
      traits: Traits,
    ): AgentEvent => ({
      id: makeEventId(runId, agent.id, round, stage, seq++),
      runId,
      agentId: agent.id,
      segmentId: agent.segmentId,
      round,
      stage,
      action,
      intensity: Math.round(clamp01(intensity) * 1000) / 1000,
      reasons: action ? reasonCodesFor(action, traits, features, dnaForReasons) : ['exposed'],
      excerpt: action ? composeExcerpt((items) => pickFrom(rngFor(seed, agent.id, round, 'excerpt'), items), action, traits, dnaForReasons, features) : null,
      evidenceRefs: action ? evidenceRefsFor(dnaForReasons, features) : [],
      producedBy: 'deterministic',
    });

    for (const agent of audience.agents) {
      if (signal?.aborted) return;

      const traits = traitsFor(agent, previousShare[agent.segmentId] ?? 0, round - 1);
      const j = journeyRun(agent, traits, round, seed);
      const interest = interestFit(features, traits, agent.interests);

      // --- exposure: always happens -----------------------------------------
      yield emit(agent, 'exposure', null, 0.5 + 0.5 * traits.attentionBudget, dna, traits);

      // --- attention: the hook gate -----------------------------------------
      const keep = pKeepAttention(features, traits, interest);
      if (j.next() > keep) {
        roundActions.set(agent.id, 'STOP');
        yield emit(agent, 'action', 'STOP', 1 - keep, dna, traits);
        continue;
      }
      yield emit(agent, 'attention', null, keep, dna, traits);

      // --- interpretation: did the message land -----------------------------
      const comprehension = clamp01(features.clarity * (1 - 0.35 * traits.domainKnowledge) * 0.75 + interest * 0.25);
      yield emit(agent, 'interpretation', null, comprehension, dna, traits);

      // --- response: how it felt --------------------------------------------
      const positive = pPositive(features, traits, dna, interest);
      yield emit(agent, 'response', null, positive, dna, traits);

      // --- decision: whether anything follows -------------------------------
      const engage = pEngage(features, traits, positive);
      yield emit(agent, 'decision', null, engage, dna, traits);

      // --- action -----------------------------------------------------------
      const weights = actionWeights(features, traits, positive, engage);
      const { action, share } = sampleAction(j.next, weights);
      roundActions.set(agent.id, action);
      // Intensity is the chosen action's share of the weight mass, so it means
      // "how strongly this action won" rather than a decorative number.
      yield emit(agent, 'action', action, share * 4, dna, traits);
    }

    // --- segment-level aggregation for the NEXT round's reinforcement -------
    const segmentCounts: Record<string, { positive: number; total: number }> = {};
    for (const agent of audience.agents) {
      const bucket = (segmentCounts[agent.segmentId] ??= { positive: 0, total: 0 });
      bucket.total += 1;
      const a = roundActions.get(agent.id);
      if (a && a !== 'IGNORE' && a !== 'STOP' && a !== 'REJECT') bucket.positive += 1;
    }
    previousShare = Object.fromEntries(
      Object.entries(segmentCounts).map(([k, v]) => [k, v.total === 0 ? 0 : v.positive / v.total]),
    );

    input.onRoundComplete?.(round, previousShare);
  }
}

export const deterministicEngine: SimulationEngine = {
  id: 'deterministic',
  version: ENGINE_VERSION,
  capabilities: () => ({
    streaming: true,
    reproducible: true,
    needsModel: false,
    maxPopulation: 200,
  }),
  run: runDeterministic,
};

export { REACTION_ACTIONS };
