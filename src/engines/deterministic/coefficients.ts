/**
 * Reaction-model coefficients.
 *
 * THESE ARE HAND-AUTHORED HYPOTHESES, NOT A CALIBRATED MODEL.
 *
 * They were chosen by reasoning about the decision journey, not fitted to any
 * observed outcome. There is no real-world benchmark, and docs/validation.md
 * reports the validation state as "not_established" for exactly this reason.
 *
 * Do NOT tune these until the demo looks good. A model tuned to flatter one
 * fixture is a rigged demo, and the homogeneity eval in evals/adversarial.json
 * exists specifically to catch a reaction model that has collapsed into
 * agreement. Change a coefficient only with a stated reason, and expect the
 * regression snapshot in evals/regression.json to move.
 */

export const ENGINE_VERSION = 'det-1.0.0';

/** Intercepts (logit bias) for each stage gate. */
export const INTERCEPTS = {
  /**
   * P(keep attention after the hook). Set so that attention is genuinely scarce
   * and the hook gate discriminates: an earlier value of -0.35 let ~96% of
   * agents through, which made "attention" a metric that could not move.
   */
  attention: -0.7,
  /** P(respond positively). Below 0: approval is not the default. */
  positive: -1.0,
  /** P(take any action at all, given a positive response). */
  engage: -1.1,
} as const;

/** Weights on the attention gate. */
export const ATTENTION_WEIGHTS = {
  hookPull: 3.1,
  attentionBudget: 1.9,
  interestFit: 1.2,
  /** Drag from content that is long relative to its kind. */
  lengthPenalty: -1.6,
  /** Familiar-looking openings ("excited to share...") depress attention. */
  weakHook: -1.4,
} as const;

/** Weights on the positive-response gate. */
export const POSITIVE_WEIGHTS = {
  clarity: 2.0,
  valueFit: 1.6,
  proof: 1.5,
  interestFit: 1.1,
  emotionalCharge: 0.9,
  skepticism: -1.6,
  /**
   * Friction drag. Deliberately the largest negative term, because identified
   * structural friction is the single biggest driver of a poor response — but
   * not so large that it dominates clarity and value entirely, which would make
   * the model insensitive to the things the rewriter can actually fix.
   */
  frictionDrag: -1.7,
  /** Attention budget also gates how far comprehension can go. */
  attentionBudget: 0.7,
} as const;

/** Weights on the engage gate. */
export const ENGAGE_WEIGHTS = {
  positive: 2.6,
  socialPropensity: 1.5,
  ctaClarity: 1.2,
  domainKnowledge: 0.5,
} as const;

/** Per-action weights, applied on top of the engage gate. Higher = likelier. */
export const ACTION_WEIGHTS = {
  /**
   * IGNORE is the residual: "I saw it, I understood it, I did nothing."
   * It must be reachable and common, otherwise the room drifts into
   * implausible enthusiasm and the metrics stop meaning anything.
   */
  IGNORE: 1.35,
  LIKE: 1.0,
  COMMENT: 0.55,
  SHARE: 0.45,
  SAVE: 0.5,
  FOLLOW: 0.4,
  CLICK: 0.6,
  BUY: 0.2,
  REJECT: 0.9,
} as const;

/** How strongly one round's segment-level response carries into the next. */
export const SOCIAL_REINFORCEMENT = {
  /** Maximum total trait nudge across all rounds. */
  maxNudge: 0.15,
  /** Fraction of the previous round's positive share applied per round. */
  rate: 0.35,
  /** Applies to these traits only. */
  traits: ['socialPropensity', 'noveltySeeking'] as const,
} as const;

/** Severity assigned to each DNA friction, used as frictionDrag. */
export const FRICTION_SEVERITY: Record<string, number> = {
  default: 0.22,
  late: 0.3,
  buried: 0.32,
  vague: 0.28,
  competing: 0.26,
  jargon: 0.24,
  proof: 0.25,
  length: 0.2,
};
