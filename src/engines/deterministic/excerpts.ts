import type { ContentDNA, ContentFeatures, ReactionAction, Traits } from './types';

/**
 * Reaction excerpts.
 *
 * These are TEMPLATE-COMPOSED SYNTHETIC FRAGMENTS, not quotations. They are
 * illustrative machine-generated lines built from the content's DNA, the
 * agent's archetype and the action taken. They must never be presented as
 * things anyone said, and the UI labels them as synthetic reaction fragments.
 */

function trim(s: string, max: number): string {
  const clean = s.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function firstClause(s: string, max = 70): string {
  const cut = s.split(/[,.;:—–-]/)[0] ?? s;
  return trim(cut, max);
}

const STOP_LINES = [
  'Too slow to get to the point. Moving on.',
  'Read the first line, did not find a reason to keep going.',
  'I have seen this opening before.',
  'Nothing here tells me what I get.',
];

const IGNORE_LINES = [
  'Fine. Not for me right now.',
  'Understood it, but nothing I would act on.',
  'Noted and forgotten.',
  'I get the idea. Nothing happens next.',
];

const REJECT_LINES = [
  'Reads like a claim with nothing behind it.',
  'This asks me to take too much on trust.',
  'Same promise, no evidence again.',
];

const LIKE_LINES = [
  'Fair point, well put.',
  'This is a clear way of saying it.',
  'Good framing. I agree.',
];

const SAVE_LINES = [
  'Worth keeping to look at properly later.',
  'Saving this for when I have the same problem.',
  'I want the detail, not just the gist.',
];

const SHARE_LINES = [
  'Someone on my team needs to see this.',
  'This says something I have been failing to explain.',
  'Worth passing on.',
];

const COMMENT_LINES = [
  'The premise is right but the ordering is wrong.',
  'I would want the number, not the claim.',
  'This depends entirely on your starting point.',
];

const FOLLOW_LINES = [
  'If this is the standard, I want more of it.',
  'Consistent enough to be worth following.',
];

const CLICK_LINES = [
  'Curious enough to open the link.',
  'The offer is specific, so I will look.',
];

const BUY_LINES = [
  'The value is clear enough to justify the cost.',
  'Cheaper than the problem it solves.',
];

function linesFor(action: ReactionAction): string[] {
  switch (action) {
    case 'STOP':
      return STOP_LINES;
    case 'IGNORE':
      return IGNORE_LINES;
    case 'REJECT':
      return REJECT_LINES;
    case 'LIKE':
      return LIKE_LINES;
    case 'SAVE':
      return SAVE_LINES;
    case 'SHARE':
      return SHARE_LINES;
    case 'COMMENT':
      return COMMENT_LINES;
    case 'FOLLOW':
      return FOLLOW_LINES;
    case 'CLICK':
      return CLICK_LINES;
    case 'BUY':
      return BUY_LINES;
    default:
      return IGNORE_LINES;
  }
}

/**
 * Compose an excerpt. `pick` is injectable so the caller supplies a seeded rng
 * and the result stays reproducible.
 */
export function composeExcerpt(
  pick: <T>(items: readonly T[]) => T,
  action: ReactionAction,
  traits: Traits,
  dna: ContentDNA,
  features: ContentFeatures,
): string {
  const base = pick(linesFor(action));

  const addenda: string[] = [];
  if (traits.skepticism > 0.7) addenda.push('I want the evidence.');
  if (traits.attentionBudget < 0.25) addenda.push('I only skimmed it.');
  if (traits.priceSensitivity > 0.8) addenda.push('And the cost is the question.');
  if (dna.potentialFrictions.length > 0 && action !== 'SHARE') {
    const friction = pick(dna.potentialFrictions);
    if (friction) addenda.push(`Mainly: ${friction.label.toLowerCase()}.`);
  }
  if (features.promisePosition < 0.35 && (action === 'IGNORE' || action === 'STOP')) {
    addenda.push('The point arrives late.');
  }

  const chosen = addenda.length > 0 && addenda[0] ? ` ${addenda[0]}` : '';
  return trim(`${base}${chosen}`, 240);
}

export function reasonCodesFor(
  action: ReactionAction,
  traits: Traits,
  features: ContentFeatures,
  dna: ContentDNA,
): string[] {
  const reasons: string[] = [];
  switch (action) {
    case 'STOP':
      reasons.push('hook-failed', features.hookStrength < 0.4 ? 'weak-hook' : 'low-attention-budget');
      break;
    case 'IGNORE':
      reasons.push('no-action-trigger', features.ctaClarity < 0.5 ? 'cta-unclear' : 'low-engagement');
      break;
    case 'REJECT':
      reasons.push('trust-failed', traits.skepticism > 0.6 ? 'high-skepticism' : 'low-proof');
      break;
    case 'SHARE':
      reasons.push('social-value', 'positive-response');
      break;
    case 'SAVE':
      reasons.push('future-utility', 'high-domain-knowledge');
      break;
    case 'COMMENT':
      reasons.push('disagreement-or-agreement', 'high-emotional-charge');
      break;
    case 'FOLLOW':
      reasons.push('interest-match');
      break;
    case 'CLICK':
      reasons.push('cta-clarity', 'positive-response');
      break;
    case 'BUY':
      reasons.push('price-acceptable', 'value-clear');
      break;
    default:
      reasons.push('positive-response');
  }
  if (dna.potentialFrictions.length > 0) reasons.push('friction-present');
  return reasons.slice(0, 6);
}

/** Evidence paths into the DNA, so WHY can cite something concrete. */
export function evidenceRefsFor(dna: ContentDNA, features: ContentFeatures): string[] {
  const refs: string[] = [];
  if (features.promisePosition < 0.5) refs.push('dna.promise');
  if (features.ctaClarity < 0.6) refs.push('dna.cta');
  if (features.proofPresence < 0.4) refs.push('dna.risks');
  refs.push(...dna.potentialFrictions.slice(0, 2).map((f) => `dna.potentialFrictions:${firstClause(f.label, 40)}`));
  return refs.slice(0, 6);
}
