import { clamp01 } from '../rng';
import type { ContentKind } from '../domain';

/**
 * Deterministic feature extraction.
 *
 * Deliberately model-free: the engine must work in demo mode, offline, with no
 * API key, and must produce identical features every time. These are crude
 * keyword-and-structure proxies, and they are wrong about fresh or unusual
 * formats — that limitation is stated in docs/simulation.md §8 and labelled in
 * the UI rather than hidden.
 */

export type ContentFeatures = {
  hookStrength: number;
  clarity: number;
  promisePosition: number;
  ctaClarity: number;
  proofPresence: number;
  emotionalCharge: number;
  lengthPenalty: number;
  topicTokens: string[];
  firstSentence: string;
  sentences: string[];
};

const CURIOSITY_MARKERS = [
  'most', 'why', 'how', 'what', 'nobody', 'everyone', 'stop', 'secret', 'mistake',
  'wrong', 'actually', 'truth', 'never', 'always', 'before you', 'here is', "here's",
];

const VALUE_MARKERS = [
  'so you can', 'so that', 'which means', 'you get', 'you can', 'helps you',
  'lets you', 'saves you', 'instead of', 'replaces', 'turns', 'so we',
];

/**
 * Imperative verbs that can open a call to action.
 *
 * Exported and shared with the deterministic analyser on purpose. There used to
 * be a second, shorter copy of this list in providers/deterministic/analysis.ts,
 * and the two drifted: this one was missing 'subscribe', so "Subscribe to the
 * newsletter" was not counted as an ask while the analyser counted it as one.
 * One list, one meaning.
 */
export const CTA_VERBS = [
  'get', 'try', 'start', 'book', 'download', 'grab', 'steal', 'read', 'see',
  'join', 'claim', 'use', 'install', 'copy', 'take', 'watch', 'reply', 'comment',
  'subscribe', 'follow', 'visit', 'register', 'sign up', 'share', 'send',
] as const;

/** @deprecated alias kept for readability at call sites; use CTA_VERBS. */
const IMPERATIVE_VERBS = CTA_VERBS;

const PROOF_MARKERS = [
  'tested', 'study', 'data', 'we measured', 'benchmark', 'survey', 'research',
  'results', 'report', 'case study', 'audit', 'analysis',
];

const SOCIAL_PROOF_MARKERS = [
  'customers', 'teams', 'companies', 'users', 'clients', 'people use',
  'thousands', 'hundreds', 'reviewers', 'industry', 'experts',
];

const AFFECT_HIGH = [
  'love', 'hate', 'terrible', 'amazing', 'brilliant', 'disaster', 'furious',
  'delighted', 'shocking', 'outrageous', 'painful', 'relief', 'proud', 'afraid',
  'waste', 'nightmare', 'obsessed', 'excited',
];

const AFFECT_MED = [
  'good', 'bad', 'great', 'hard', 'easy', 'better', 'worse', 'helpful', 'annoying',
  'useful', 'confusing', 'clear', 'vague', 'important', 'interesting', 'boring',
];

const JARGON = [
  'leverage', 'synergy', 'holistic', 'robust', 'scalable', 'paradigm',
  'ecosystem', 'optimize', 'streamline', 'best-in-class', 'cutting-edge',
  'next-generation', 'solutioning', 'ideate', 'actionable', 'bandwidth',
];

const WEAK_HOOK_MARKERS = [
  'excited to share', 'thrilled to announce', 'we are happy to', "we're proud",
  'stay tuned', 'coming soon', 'more details', 'big news', 'guess what',
  'we have been quiet', 'it has been a while', 'some news',
];

/**
 * Outcome-shaped language: a sentence that states a change in a quantity.
 *
 * This exists because real copy states benefits in WORDS far more often than in
 * digits ("cut the cycle from two weeks to two days"). An earlier version of
 * this module only looked for explicit value markers and numerals, so it could
 * not see the strongest sentence in a typical company post at all — which meant
 * the rewriter had nothing to move forward.
 */
const BENEFIT_MARKERS = [
  'cut', 'cuts', 'reduce', 'reduces', 'reduced', 'save', 'saves', 'saving',
  'faster', 'cheaper', 'slower', 'replaces', 'replaced', 'eliminates', 'removes',
  'instead of', 'in under', 'within', 'doubled', 'tripled', 'halved', 'lifted',
  'grew', 'shrank', 'down from', 'up from', 'no longer',
];

/** Quantity-shaped language, numerals and spelled-out numbers alike. */
const NUMBER_WORD =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/;

const QUANTITY_MARKERS = [
  'week', 'day', 'hour', 'minute', 'month', 'year', 'quarter', 'percent', 'percent',
];

export function hasQuantity(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (NUMBER_WORD.test(text)) return true;
  return QUANTITY_MARKERS.some((q) => new RegExp(`\\b${q}s?\\b`).test(text));
}

/** Count of spelled-out or numeric quantities, used for the proof signal. */
function countQuantities(text: string): number {
  const digits = (text.match(/\d+(?:\.\d+)?%?/g) ?? []).length;
  const words = (text.match(new RegExp(NUMBER_WORD.source, 'g')) ?? []).length;
  return digits + words;
}

function hasBenefit(text: string): boolean {
  return BENEFIT_MARKERS.some((m) => text.includes(m));
}

/** A sentence that reads like the content's value proposition. */
export function isPromiseSentence(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  if (VALUE_MARKERS.some((m) => lower.includes(m))) return true;
  if (hasBenefit(lower) && hasQuantity(lower)) return true;
  return false;
}

/**
 * CTA affordances: words that indicate an ask even when no imperative is used
 * ("the link in the comments has a walkthrough").
 */
const CTA_AFFORDANCES = [
  'link', 'comment', 'description', 'bio', 'below', 'sign up', 'signup',
  'subscribe', 'newsletter', 'website', 'register', 'book',
];

/** Sentences in the closing region, where a call to action would live. */
function tailSentences(sentences: readonly string[]): string[] {
  if (sentences.length === 0) return [];
  const window = Math.max(2, Math.ceil(sentences.length * 0.3));
  return sentences.slice(Math.max(0, sentences.length - window));
}

/**
 * Score the call to action.
 *
 * An earlier version counted imperative verbs ANYWHERE in the text, so narrative
 * prose such as "you watch where attention drops" was scored as a call to action.
 * That inflated ctaClarity on content with no ask at all. This version looks only
 * at the closing sentences and requires the imperative to LEAD the sentence,
 * which is what an actual ask looks like.
 */
export function scoreCta(sentences: readonly string[], fullText: string): number {
  const lower = fullText.toLowerCase();
  let best = 0.1;

  for (const sentence of tailSentences(sentences)) {
    const s = sentence.toLowerCase();
    const lead = s.split(/\s+/).slice(0, 3).join(' ');
    const leadsWithImperative = IMPERATIVE_VERBS.some((v) =>
      new RegExp(`\\b${v}\\b`).test(lead),
    );
    const hasAffordance = CTA_AFFORDANCES.some((a) => s.includes(a));

    if (leadsWithImperative) best = Math.max(best, 0.9);
    else if (hasAffordance) best = Math.max(best, 0.4);
  }

  if (/\b(no signup|free|no cost)\b/.test(lower)) best = Math.min(1, best + 0.05);
  return clamp01(best);
}

/**
 * How many distinct asks the closing region makes.
 * More than one dilutes all of them, which is a real and common problem.
 */
export function countCtaAsks(sentences: readonly string[]): number {
  let asks = 0;
  for (const sentence of tailSentences(sentences)) {
    const lead = sentence.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    if (IMPERATIVE_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(lead))) asks += 1;
  }
  return asks;
}

/** Target body length by kind, used to score lengthPenalty. */
const TARGET_LENGTH: Partial<Record<ContentKind, number>> = {
  social_post: 400,
  reel: 200,
  short: 200,
  ad: 300,
  email: 900,
  article: 6000,
  script: 1200,
  video: 500,
  landing_page: 900,
  product_announcement: 500,
  campaign: 600,
  brand_message: 300,
  launch_concept: 400,
  creative_concept: 400,
  marketing_idea: 400,
};

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countOccurrences(haystack: string, needles: readonly string[]): number {
  let n = 0;
  for (const needle of needles) {
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      n++;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

const TOPIC_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
  'those', 'you', 'your', 'we', 'our', 'us', 'i', 'my', 'me', 'they', 'their',
  'he', 'she', 'his', 'her', 'at', 'by', 'from', 'as', 'if', 'so', 'not', 'no',
  'do', 'does', 'did', 'can', 'will', 'just', 'than', 'then', 'there', 'here',
  'how', 'what', 'when', 'where', 'who', 'why', 'all', 'any', 'more', 'most',
  'about', 'into', 'over', 'after', 'before', 'up', 'out', 'only', 'also', 'very',
]);

export function extractFeatures(text: string, kind: ContentKind = 'social_post'): ContentFeatures {
  const lower = text.toLowerCase();
  const sentences = splitSentences(text);
  const firstSentence = sentences[0] ?? text.slice(0, 160);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  // ---- hookStrength -------------------------------------------------------
  // Rewards: brevity, a question, a concrete quantity, curiosity markers.
  // Penalises: announced-but-empty openings ("excited to share...").
  let hook = 0.35;
  if (firstSentence.length > 0 && firstSentence.length < 120) hook += 0.15;
  if (firstSentence.length > 240) hook -= 0.15;
  if (firstSentence.includes('?')) hook += 0.12;
  if (hasQuantity(firstSentence)) hook += 0.14;
  hook += Math.min(0.3, countOccurrences(firstSentence.toLowerCase(), CURIOSITY_MARKERS) * 0.12);
  // The weak-opening penalty applies to the OPENING only. Checking a 200-character
  // window would let a later "we have been quiet for a while" drag down a piece
  // whose actual first line is strong.
  const weakHits = countOccurrences(firstSentence.toLowerCase(), WEAK_HOOK_MARKERS);
  hook -= Math.min(0.45, weakHits * 0.2);
  const hookStrength = clamp01(hook);

  // ---- clarity ------------------------------------------------------------
  // Rewards: concrete quantities, an explicit value proposition, short
  // sentences. Penalises: jargon, and a high proportion of very long sentences.
  //
  // An earlier version was a near-constant 0.55 across every input, because it
  // awarded a flat bonus for "average sentence length <= 22" and nothing else
  // varied. A feature that does not vary cannot discriminate.
  const valueHits = countOccurrences(lower, VALUE_MARKERS);
  const jargonHits = countOccurrences(lower, JARGON);
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 30).length;
  const longRatio = sentences.length === 0 ? 0 : longSentences / sentences.length;
  const avgSentenceLen =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length
      : 0;

  // 12 words reads easily; 38 does not.
  const brevity = clamp01(1 - (avgSentenceLen - 12) / 26);
  const concreteness = clamp01(countQuantities(lower) * 0.25);
  const valueDensity = clamp01(valueHits / 2);
  const jargonDensity = clamp01(jargonHits / 3);

  const clarityScore = clamp01(
    0.3 + 0.18 * concreteness + 0.16 * valueDensity + 0.2 * brevity - 0.2 * jargonDensity - 0.1 * longRatio,
  );

  // ---- promisePosition ----------------------------------------------------
  // Which sentence carries the value proposition, as a fraction from the END.
  // 1 = the promise is in the opening; 0 = it is buried at the very end.
  // Monotonic by construction: moving the promise earlier raises this value.
  let promiseIdx = -1;
  for (let i = 0; i < sentences.length; i++) {
    if (isPromiseSentence(sentences[i] ?? '')) {
      promiseIdx = i;
      break;
    }
  }
  // An opening that already states a concrete quantity or an outcome IS the
  // value proposition, even if it does not use any of the recognised phrases.
  // Without this, "Campaign review takes fourteen days" was scored as burying
  // the lede, which is plainly wrong.
  const opening = (sentences[0] ?? '').toLowerCase();
  if (promiseIdx === -1 && sentences.length > 0 && (hasQuantity(opening) || hasBenefit(opening))) {
    promiseIdx = 0;
  }

  let promisePosition: number;
  if (promiseIdx === -1) {
    // No identifiable value proposition anywhere. Slightly below neutral.
    promisePosition = 0.4;
  } else if (sentences.length <= 1) {
    // A single sentence that IS the promise is the strongest possible position,
    // not a missing one. The earlier guard collapsed this case to 0.4, which
    // scored a one-line piece led by a concrete claim as if it had buried it.
    promisePosition = 1;
  } else {
    promisePosition = clamp01(1 - promiseIdx / (sentences.length - 1));
  }

  // ---- ctaClarity ---------------------------------------------------------
  // Rewards a single imperative ask in the closing region. Penalises several
  // competing asks, and does not credit narrative prose as a call to action.
  const ctaClarity = scoreCta(sentences, text);

  // ---- proofPresence ------------------------------------------------------
  // Concrete quantities are the cheapest form of evidence, so spelled-out
  // numbers count as well as digits ("fourteen days", not just "14 days").
  const quantityCount = countQuantities(lower);
  const proofHits = countOccurrences(lower, PROOF_MARKERS);
  const socialHits = countOccurrences(lower, SOCIAL_PROOF_MARKERS);
  const proofPresence = clamp01(
    0.1 + Math.min(0.4, quantityCount * 0.12) + Math.min(0.25, proofHits * 0.12) + Math.min(0.2, socialHits * 0.1),
  );

  // ---- emotionalCharge ----------------------------------------------------
  const highAffect = countOccurrences(lower, AFFECT_HIGH);
  const medAffect = countOccurrences(lower, AFFECT_MED);
  const exclamations = (text.match(/!/g) ?? []).length;
  const emotionalCharge = clamp01(0.15 + highAffect * 0.16 + medAffect * 0.07 + Math.min(0.15, exclamations * 0.05));

  // ---- lengthPenalty ------------------------------------------------------
  const target = TARGET_LENGTH[kind] ?? 400;
  const ratio = wordCount / Math.max(1, target / 5);
  const lengthPenalty = clamp01(ratio <= 1 ? ratio * 0.35 : 1 - 1 / (1 + (ratio - 1)));

  // ---- topicTokens --------------------------------------------------------
  const tokens = lower
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TOPIC_STOPWORDS.has(w) && !/^\d+$/.test(w));
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const topicTokens = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([w]) => w);

  return {
    hookStrength,
    clarity: clarityScore,
    promisePosition,
    ctaClarity,
    proofPresence,
    emotionalCharge,
    lengthPenalty,
    topicTokens,
    firstSentence,
    sentences,
  };
}
