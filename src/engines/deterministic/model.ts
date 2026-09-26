import { clamp01, sigmoid } from '../../core/rng';
import type { ContentDNA, ContentFeatures, ReactionAction, Traits } from './types';
import {
  ACTION_WEIGHTS,
  ATTENTION_WEIGHTS,
  ENGAGE_WEIGHTS,
  FRICTION_SEVERITY,
  INTERCEPTS,
  POSITIVE_WEIGHTS,
  SOCIAL_REINFORCEMENT,
} from './coefficients';

/**
 * The reaction model. Pure scoring functions — no IO, no randomness.
 * The engine samples using these scores with a seeded, order-independent rng.
 */

export function hookPull(features: ContentFeatures, traits: Traits): number {
  return features.hookStrength * (0.5 + 0.5 * traits.noveltySeeking);
}

export function clarityGain(features: ContentFeatures, traits: Traits): number {
  // Domain experts need less hand-holding; total clarity matters more to novices.
  return features.clarity * (1 - 0.4 * traits.domainKnowledge);
}

export function trustGate(features: ContentFeatures, traits: Traits): number {
  return (1 - traits.skepticism) * (0.4 + 0.6 * features.proofPresence);
}

/**
 * How well the content's subject matches what this agent actually cares about.
 *
 * Normalised by the agent's OWN interest count so that a broadly-interested agent
 * does not automatically score higher. An earlier version divided by a constant
 * and credited substring overlap at half weight, which saturated the whole
 * population at ~0.89 and removed interestFit's ability to differentiate anyone.
 */
export function interestFit(
  features: ContentFeatures,
  traits: Traits,
  interests: readonly string[],
): number {
  if (features.topicTokens.length === 0 || interests.length === 0) return 0.3;
  const tokens = features.topicTokens;
  const interestSet = new Set(interests.map((i) => i.toLowerCase()));

  // Measured as the fraction of THIS agent's interests that the content
  // addresses. Accumulating over the content's tokens instead would let a long
  // piece match everything and saturate the whole population at ~0.9, which is
  // what an earlier version did.
  let matched = 0;
  for (const interest of interestSet) {
    const hit = tokens.some((token) => {
      if (token === interest) return true;
      // Partial overlap only for reasonably long words, so "new" does not match
      // "newsletter".
      if (interest.length < 5 || token.length < 5) return false;
      return token.includes(interest) || interest.includes(token);
    });
    if (hit) matched += 1;
  }

  const coverage = matched / interestSet.size;
  // ~62% coverage saturates. Fewer than that and the agent lands mid-scale,
  // which is where the model needs room to move.
  return clamp01(coverage * 1.6);
}

export function frictionDrag(dna: ContentDNA): number {
  if (dna.potentialFrictions.length === 0) return 0;
  let total = 0;
  for (const f of dna.potentialFrictions) {
    const key = Object.keys(FRICTION_SEVERITY).find((k) =>
      f.label.toLowerCase().includes(k),
    );
    total += FRICTION_SEVERITY[key ?? 'default'] ?? FRICTION_SEVERITY.default ?? 0.22;
  }
  // Diminishing returns beyond a few frictions.
  return Math.min(0.85, total * (1 - 0.08 * Math.max(0, dna.potentialFrictions.length - 3)));
}

export function pKeepAttention(
  features: ContentFeatures,
  traits: Traits,
  interest: number,
): number {
  const logit =
    INTERCEPTS.attention +
    ATTENTION_WEIGHTS.hookPull * hookPull(features, traits) +
    ATTENTION_WEIGHTS.attentionBudget * traits.attentionBudget +
    ATTENTION_WEIGHTS.interestFit * interest +
    ATTENTION_WEIGHTS.lengthPenalty * features.lengthPenalty +
    ATTENTION_WEIGHTS.weakHook * (1 - features.hookStrength);
  return clamp01(sigmoid(logit));
}

export function pPositive(
  features: ContentFeatures,
  traits: Traits,
  dna: ContentDNA,
  interest: number,
): number {
  const logit =
    INTERCEPTS.positive +
    POSITIVE_WEIGHTS.clarity * clarityGain(features, traits) +
    POSITIVE_WEIGHTS.valueFit * features.promisePosition +
    POSITIVE_WEIGHTS.proof * trustGate(features, traits) +
    POSITIVE_WEIGHTS.interestFit * interest +
    POSITIVE_WEIGHTS.emotionalCharge * features.emotionalCharge +
    POSITIVE_WEIGHTS.skepticism * traits.skepticism +
    POSITIVE_WEIGHTS.frictionDrag * frictionDrag(dna) +
    POSITIVE_WEIGHTS.attentionBudget * traits.attentionBudget;
  return clamp01(sigmoid(logit));
}

export function pEngage(
  features: ContentFeatures,
  traits: Traits,
  positive: number,
): number {
  const logit =
    INTERCEPTS.engage +
    ENGAGE_WEIGHTS.positive * positive +
    ENGAGE_WEIGHTS.socialPropensity * traits.socialPropensity +
    ENGAGE_WEIGHTS.ctaClarity * features.ctaClarity +
    ENGAGE_WEIGHTS.domainKnowledge * traits.domainKnowledge;
  return clamp01(sigmoid(logit));
}

/**
 * Per-action weight given the agent's state. Returns a map of action -> weight,
 * from which the engine samples. Kept as a pure function so `evals/` can vary
 * coefficients and observe sensitivity rather than trusting a black box.
 */
export function actionWeights(
  features: ContentFeatures,
  traits: Traits,
  positive: number,
  engage: number,
): Array<{ action: ReactionAction; weight: number }> {
  const neg = 1 - positive;
  const entries: Array<{ action: ReactionAction; weight: number }> = [
    // The disengagement residual. Scaled by (1 - engage) so a room with plenty
    // of engagement still leaves most agents doing nothing, which is what a
    // real audience does.
    { action: 'IGNORE', weight: ACTION_WEIGHTS.IGNORE * (1 - engage) },
    { action: 'LIKE', weight: ACTION_WEIGHTS.LIKE * positive },
    { action: 'COMMENT', weight: ACTION_WEIGHTS.COMMENT * positive * (0.4 + 0.6 * traits.socialPropensity) * (0.5 + features.emotionalCharge) },
    { action: 'SHARE', weight: ACTION_WEIGHTS.SHARE * positive * traits.socialPropensity * engage },
    { action: 'SAVE', weight: ACTION_WEIGHTS.SAVE * positive * traits.domainKnowledge * (1 - traits.priceSensitivity) },
    { action: 'FOLLOW', weight: ACTION_WEIGHTS.FOLLOW * positive * engage },
    { action: 'CLICK', weight: ACTION_WEIGHTS.CLICK * positive * features.ctaClarity },
    // Purchase requires both a positive response and low price sensitivity.
    { action: 'BUY', weight: ACTION_WEIGHTS.BUY * positive * (1 - traits.priceSensitivity) * engage },
    { action: 'REJECT', weight: ACTION_WEIGHTS.REJECT * neg * traits.skepticism * (0.5 + features.emotionalCharge) },
  ];
  return entries.map((e) => ({ action: e.action, weight: Math.max(0, e.weight) }));
}

/**
 * Bounded social reinforcement from the previous round's segment-level response.
 * Bounded deliberately: monotone escalation would produce implausible unanimity,
 * and disagreement is a product feature, not a failure.
 */
export function reinforce(
  traits: Traits,
  segmentPositiveShare: number,
  roundsElapsed: number,
): Traits {
  if (roundsElapsed <= 0) return traits;
  const nudge = Math.min(
    SOCIAL_REINFORCEMENT.maxNudge,
    segmentPositiveShare * SOCIAL_REINFORCEMENT.rate,
  );
  const out = { ...traits };
  for (const key of SOCIAL_REINFORCEMENT.traits) {
    out[key] = clamp01(out[key] + nudge);
  }
  return out;
}
