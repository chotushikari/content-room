import type {
  Audience,
  ContentAsset,
  ContentDNA,
  CreativeBrief,
  MetricsBundle,
  Segment,
  WhyReport,
} from '../../core/domain';
import {
  CTA_VERBS,
  countCtaAsks,
  extractFeatures,
  isPromiseSentence,
  type ContentFeatures,
} from '../../core/features/extract';
import { computeContentHash, contentAssetId } from '../../core/ids';

/**
 * Heuristic analysis — the deterministic tier.
 *
 * This is NOT a set of canned fixtures. It reads the actual text and produces a
 * real Content DNA, segments, explanation and rewrite. That distinction is what
 * makes the product genuinely usable with zero API keys on ANY pasted content,
 * rather than only on the Velloe demo fixture.
 *
 * It is a keyword-and-structure analyser. It is crude, and it is wrong about
 * unusual formats. The UI labels every output as a simulated estimate, and
 * docs/validation.md records that predictive validity is unmeasured.
 */

const JARGON_REWRITES: Record<string, string> = {
  leverage: 'use',
  synergy: 'overlap',
  holistic: 'complete',
  robust: 'reliable',
  scalable: 'able to grow',
  paradigm: 'approach',
  ecosystem: 'set of tools',
  optimize: 'improve',
  streamline: 'simplify',
  'best-in-class': 'among the best',
  'cutting-edge': 'new',
  'next-generation': 'new',
  solutioning: 'solving',
  ideate: 'brainstorm',
  actionable: 'concrete',
  bandwidth: 'time',
};

const AFFECT_LEXICON = [
  'love', 'hate', 'terrible', 'amazing', 'brilliant', 'disaster', 'furious',
  'delighted', 'shocking', 'outrageous', 'painful', 'relief', 'proud', 'afraid',
  'waste', 'nightmare', 'obsessed', 'excited', 'clear', 'confusing', 'important',
];

/** CTA verbs are imported from the shared feature module — see CTA_VERBS there. */

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function detectCtaSentence(sentences: string[]): string | undefined {
  // Only the closing region counts, and only an ask that LEADS the sentence.
  // Scanning the whole text for imperative verbs credited narrative prose
  // ("you watch where attention drops") as a call to action.
  const window = Math.max(2, Math.ceil(sentences.length * 0.3));
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - window); i--) {
    const s = sentences[i];
    if (!s) continue;
    const lead = s.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    if (CTA_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(lead))) return s;
  }
  return undefined;
}

function detectPromiseSentence(sentences: string[], f: ContentFeatures): string | undefined {
  // Uses the SAME predicate as feature extraction, so the sentence the rewriter
  // moves forward is the sentence the metrics score. Two separate detectors
  // would drift, and the rewrite would stop addressing the measured problem.
  for (const s of sentences) {
    if (isPromiseSentence(s)) return s;
  }
  if (f.promisePosition > 0.6 && sentences[0]) return sentences[0];
  return undefined;
}

function plainLanguage(sentence: string): string {
  let out = sentence;
  for (const [jargon, plain] of Object.entries(JARGON_REWRITES)) {
    out = out.replace(new RegExp(`\\b${jargon}\\b`, 'gi'), plain);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Split a long sentence at a natural conjunction, keeping the words. */
function tighten(sentence: string, maxWords = 24): string {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  const text = sentence;
  const splitPoints = [' and ', ' but ', ' which ', ' while '];
  for (const point of splitPoints) {
    const idx = text.toLowerCase().indexOf(point);
    if (idx > 20 && idx < text.length - 20) {
      const head = text.slice(0, idx).trim();
      const tail = text.slice(idx + point.length).trim();
      return `${head}. ${tail.charAt(0).toUpperCase()}${tail.slice(1)}`;
    }
  }
  return sentence;
}

export function heuristicDNA(asset: ContentAsset): ContentDNA {
  const text = asset.body.trim().length > 0 ? asset.body : asset.title;
  const f = extractFeatures(text, asset.kind);
  const sentences = sentencesOf(text);
  const lower = text.toLowerCase();

  const hook = (sentences[0] ?? asset.title ?? text).slice(0, 280);
  const promiseSentence = detectPromiseSentence(sentences, f);
  const ctaSentence = detectCtaSentence(sentences);
  const topic = f.topicTokens.slice(0, 4).join(', ') || asset.kind.replace(/_/g, ' ');

  const emotions = AFFECT_LEXICON.filter((w) => lower.includes(w)).slice(0, 4);
  const tone: string[] = [];
  if (asset.kind === 'script') tone.push('conversational', 'spoken');
  else if (/\?/.test(text)) tone.push('inquisitive');
  if (f.emotionalCharge > 0.5) tone.push('emotive');
  if (f.proofPresence > 0.5) tone.push('evidence-led');
  if (/\b(you|your)\b/.test(lower)) tone.push('direct');
  if (tone.length === 0) tone.push('neutral', 'informational');

  const strengths: string[] = [];
  if (f.hookStrength > 0.6) strengths.push('The opening gives a reason to keep reading.');
  if (f.clarity > 0.6) strengths.push('The central point is stated plainly.');
  if (f.proofPresence > 0.45) strengths.push('There are concrete details rather than assertion alone.');
  if (f.emotionalCharge > 0.45) strengths.push('The tone carries some feeling, which aids recall.');
  if (f.ctaClarity > 0.7) strengths.push('The call to action is a single, specific ask.');
  if (strengths.length === 0) strengths.push('Short enough to read in full without effort.');

  const risks: string[] = [];
  if (f.promisePosition < 0.5) risks.push('The value proposition is not established early.');
  if (f.proofPresence < 0.4) risks.push('Claims are made without supporting detail.');
  if (f.ctaClarity < 0.6) risks.push('It is unclear what the reader is being asked to do.');
  if (f.hookStrength < 0.45) risks.push('The opening does not differentiate itself from similar content.');
  if (f.lengthPenalty > 0.6) risks.push('Length works against completion for this format.');
  if (risks.length === 0) risks.push('Nothing structural stands out as a barrier.');

  // Friction labels deliberately contain the severity keywords the reaction
  // model keys on (late / vague / competing / proof / jargon / length).
  const potentialFrictions: ContentDNA['potentialFrictions'] = [];
  if (f.promisePosition < 0.5) {
    potentialFrictions.push({
      label: 'Promise arrives late',
      detail: 'The reason to care appears after the opening, so low-attention readers leave first.',
      span: promiseSentence?.slice(0, 120),
    });
  }
  if (f.ctaClarity < 0.6) {
    potentialFrictions.push({
      label: 'CTA is vague',
      detail: 'The ask requires interpretation, so it converts intention into hesitation.',
      span: ctaSentence?.slice(0, 120),
    });
  }
  const competing = countCtaAsks(sentences);
  if (competing > 1) {
    potentialFrictions.push({
      label: 'Competing calls to action',
      detail: `${competing} separate asks appear in the closing lines, which dilutes all of them.`,
    });
  }
  if (f.proofPresence < 0.4) {
    potentialFrictions.push({
      label: 'Proof is missing',
      detail: 'Skeptical readers have nothing to check the claim against.',
    });
  }
  if (f.clarity < 0.5) {
    potentialFrictions.push({
      label: 'Jargon-heavy phrasing',
      detail: 'Abstractions make the reader do work that the content should have done.',
    });
  }
  if (f.lengthPenalty > 0.6) {
    potentialFrictions.push({
      label: 'Length works against it',
      detail: 'For this format, the piece is longer than the audience will sustain.',
    });
  }

  const confidence = Math.max(
    0.2,
    Math.min(
      0.78,
      0.3 +
        f.clarity * 0.2 +
        f.proofPresence * 0.15 +
        Math.min(0.15, sentences.length * 0.01) +
        (asset.partial ? -0.25 : 0) -
        (text.trim().length < 80 ? 0.2 : 0),
    ),
  );

  return {
    hook,
    topic,
    promise: (promiseSentence ?? sentences[Math.min(1, sentences.length - 1)] ?? hook).slice(0, 380),
    valueProposition: promiseSentence
      ? `What the reader gains: ${promiseSentence.slice(0, 240)}`
      : `The piece is about ${topic}, but states no explicit gain for the reader.`,
    emotion: emotions.length > 0 ? emotions : ['neutral'],
    tone: tone.slice(0, 6),
    cta: (ctaSentence ?? 'No explicit call to action detected.').slice(0, 280),
    visualStyle:
      asset.media.length > 0
        ? `${asset.media.length} media asset${asset.media.length === 1 ? '' : 's'} attached; visual treatment not analysed.`
        : '',
    audienceSignals: f.topicTokens.slice(0, 6),
    strengths: strengths.slice(0, 8),
    risks: risks.slice(0, 8),
    potentialFrictions: potentialFrictions.slice(0, 8),
    confidence: Math.round(confidence * 100) / 100,
  };
}

const KIND_SEGMENT_BIAS: Partial<Record<ContentAsset['kind'], string[]>> = {
  ad: ['price_sensitive', 'practical', 'skeptic'],
  product_announcement: ['early_adopter', 'power_user', 'skeptic'],
  landing_page: ['practical', 'value_seeker', 'busy_user'],
  email: ['brand_loyalist', 'busy_user', 'practical'],
  article: ['researcher', 'professional', 'curious_explorer'],
  script: ['entertainer', 'casual_scroller', 'creator'],
  video: ['casual_scroller', 'creator', 'trend_follower'],
  social_post: ['casual_scroller', 'social_sharer', 'skeptic'],
};

/**
 * Content-derived segments. Never a fixed demographic list, and always with a
 * rationale tied to THIS content.
 */
export function heuristicSegments(
  asset: ContentAsset,
  dna: ContentDNA,
  audienceSize: number,
): Segment[] {
  const f = extractFeatures(asset.body || asset.title, asset.kind);
  const topic = dna.topic || 'the topic';
  const bias = KIND_SEGMENT_BIAS[asset.kind] ?? ['practical', 'skeptic', 'casual_scroller'];

  const segments: Segment[] = [
    {
      id: 'seg_core',
      label: 'Core audience',
      rationale: `Already interested in ${topic} and will read past the opening if the promise is clear.`,
      archetypeIds: [bias[0] as Segment['archetypeIds'][number] ?? 'practical', 'value_seeker'],
      size: Math.max(1, Math.round(audienceSize * 0.4)),
    },
    {
      id: 'seg_skeptical',
      label: 'Skeptical readers',
      rationale:
        f.proofPresence < 0.5
          ? `Asked to accept claims about ${topic} with no supporting detail, so they will discount it.`
          : `Will check the claims about ${topic} against what they already believe.`,
      archetypeIds: ['skeptic', 'researcher'],
      size: Math.max(1, Math.round(audienceSize * 0.3)),
    },
    {
      id: 'seg_low_attention',
      label: 'Low-attention scrollers',
      rationale:
        f.promisePosition < 0.5
          ? `Will see the opening only, and the value proposition for ${topic} is not in it.`
          : `Decide within seconds and will not return to a piece they have left.`,
      archetypeIds: ['casual_scroller', 'busy_user'],
      size: Math.max(1, Math.round(audienceSize * 0.2)),
    },
    {
      id: 'seg_social',
      label: 'Amplifiers',
      rationale: `Value social currency in ${topic} and will share only what they can defend in a group chat.`,
      archetypeIds: ['social_sharer', 'community_builder'],
      size: Math.max(1, Math.round(audienceSize * 0.1)),
    },
  ];

  const declared = segments.reduce((sum, s) => sum + s.size, 0);
  if (declared !== audienceSize) {
    const delta = audienceSize - declared;
    const core = segments[0];
    if (core) core.size = Math.max(1, core.size + delta);
  }

  return segments;
}

export function heuristicWhy(
  metrics: MetricsBundle,
  dna: ContentDNA,
  audience: Audience,
): WhyReport {
  const weakest = [...metrics.overall].sort((a, b) => a.value - b.value)[0];
  const strongest = [...metrics.overall].sort((a, b) => b.value - a.value)[0];
  const topDisagreement = metrics.disagreements[0];
  const topFriction = dna.potentialFrictions[0];

  const evidence: WhyReport['biggestSignal']['evidence'] = [
    {
      id: 'ev_metric_weakest',
      kind: 'dna_field',
      ref: `metrics.${weakest?.id ?? 'attention'}`,
      note: `${weakest?.label ?? 'Attention'} is the lowest simulated metric at ${weakest?.value ?? 0} (n=${weakest?.n ?? metrics.bookkeeping.agents}).`,
    },
  ];
  if (topDisagreement) {
    const lo = topDisagreement.bySegment[topDisagreement.bySegment.length - 1];
    const hi = topDisagreement.bySegment[0];
    evidence.push({
      id: 'ev_split',
      kind: 'dna_field',
      ref: `disagreement.${topDisagreement.metricId}`,
      note: `${topDisagreement.metricId} ranges from ${lo?.value ?? 0} (${lo?.segmentLabel ?? '—'}) to ${hi?.value ?? 0} (${hi?.segmentLabel ?? '—'}).`,
    });
  }
  if (topFriction) {
    evidence.push({
      id: 'ev_friction',
      kind: 'dna_field',
      ref: 'dna.potentialFrictions[0]',
      note: `Identified friction: ${topFriction.label} — ${topFriction.detail.slice(0, 140)}`,
    });
  }

  const headline = topFriction
    ? `The biggest signal is ${topFriction.label.toLowerCase()}, which lands hardest on the ${topDisagreement?.bySegment[topDisagreement.bySegment.length - 1]?.segmentLabel ?? 'least engaged'} segment.`
    : `${strongest?.label ?? 'Response'} is running higher than ${weakest?.label ?? 'attention'}, so the reaction is real but narrow.`;

  const detail = [
    `${metrics.bookkeeping.agents} synthetic agents over ${metrics.bookkeeping.rounds} rounds produced ${metrics.bookkeeping.events} reaction events.`,
    strongest ? `${strongest.label} leads at ${strongest.value}; ${weakest?.label} trails at ${weakest?.value}.` : '',
    topFriction
      ? `That pattern is consistent with the ${topFriction.label.toLowerCase()} identified in the content DNA: ${topFriction.detail}`
      : 'No single structural friction dominates, so the response is being driven by audience fit rather than a defect in the content.',
    metrics.bookkeeping.actionCounts.REJECT > 0
      ? `${metrics.bookkeeping.actionCounts.REJECT} agents actively rejected the content rather than ignoring it, which indicates a trust problem rather than a relevance problem.`
      : 'No agents actively rejected the content, which suggests the issue is attention and clarity rather than trust.',
  ]
    .filter(Boolean)
    .join(' ');

  const topFrictions = dna.potentialFrictions.slice(0, 4).map((fr, i) => ({
    rank: i + 1,
    label: fr.label,
    detail: fr.detail,
    evidence: [
      {
        id: `ev_fr_${i}`,
        kind: 'dna_field' as const,
        ref: `dna.potentialFrictions[${i}]`,
        note: fr.span ? `Grounded in: "${fr.span}"` : 'Identified from the content structure.',
      },
    ],
  }));

  return {
    biggestSignal: { headline: headline.slice(0, 280), detail: detail.slice(0, 1100), evidence },
    audienceSplit: metrics.disagreements.slice(0, 3),
    topFrictions,
    ungroundedClaims: [],
  };
}

/**
 * Deterministic rewrite: move the promise to the front, keep one ask, plain
 * language, shorter sentences. Preserves every numeral and named entity from
 * the original, because fabricating evidence in Version B would be the most
 * serious failure this product could have.
 */
export function heuristicRewrite(asset: ContentAsset): {
  versionB: ContentAsset;
  changes: CreativeBrief['changes'];
  hook: string;
  cta: string;
} {
  const text = asset.body.trim().length > 0 ? asset.body : asset.title;
  const f = extractFeatures(text, asset.kind);
  const sentences = sentencesOf(text);

  const promiseIdx = sentences.findIndex((s) => isPromiseSentence(s));
  const ctaIdx = (() => {
    for (let i = sentences.length - 1; i >= 0; i--) {
      const s = sentences[i];
      if (s && CTA_VERBS.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(s))) return i;
    }
    return -1;
  })();

  const promiseSentence = promiseIdx >= 0 ? sentences[promiseIdx] : undefined;
  const ctaSentence = ctaIdx >= 0 ? sentences[ctaIdx] : undefined;

  const newHook = plainLanguage(
    (promiseSentence ?? sentences[0] ?? asset.title ?? text).replace(/\s+/g, ' ').trim(),
  ).slice(0, 300);

  // A single, specific ask. If the promise sentence and the CTA sentence are the
  // same sentence, reusing it for both would duplicate it in the rewrite, so we
  // fall back to a neutral single ask instead.
  const newCta = (() => {
    if (ctaIdx === promiseIdx) return 'Read the full breakdown at the link below.';
    if (ctaSentence) {
      const plain = plainLanguage(ctaSentence);
      const verbs = CTA_VERBS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(plain));
      if (verbs.length <= 1) return plain.slice(0, 280);
      const first = verbs[0];
      if (first) {
        // Keep only the first clause containing an imperative verb.
        const parts = plain.split(/(?<=[.!?])\s+/);
        const keep = parts.find((p) => new RegExp(`\\b${first}\\b`, 'i').test(p));
        if (keep) return keep.slice(0, 280);
      }
      return plain.slice(0, 280);
    }
    return 'Read the full breakdown at the link below.';
  })();

  const bodyParts: string[] = [newHook];
  sentences.forEach((s, i) => {
    if (i === promiseIdx) return; // moved to the hook
    if (i === ctaIdx) return; // handled as the single CTA
    if (i === 0 && promiseIdx < 0) return; // avoid repeating the opening
    bodyParts.push(plainLanguage(tighten(s)));
  });
  bodyParts.push(newCta);

  const newBody = bodyParts.filter((p) => p.trim().length > 0).join('\n\n').slice(0, 19_000);

  const versionBBase = {
    kind: asset.kind,
    source: asset.source,
    title: asset.title,
    body: newBody,
    media: asset.media,
    meta: { ...asset.meta, rewrittenBy: 'deterministic-heuristic' },
    partial: asset.partial,
    importedBy: `${asset.importedBy}+rewrite`,
  };
  const hash = computeContentHash(versionBBase);
  const versionB: ContentAsset = {
    ...versionBBase,
    id: contentAssetId(hash, asset.kind),
    contentHash: hash,
  };

  const changes: CreativeBrief['changes'] = [];
  if (promiseSentence && f.promisePosition < 0.6) {
    changes.push({
      field: 'Opening / hook',
      before: (sentences[0] ?? '').slice(0, 400),
      after: newHook,
      reason: 'Moves the value proposition into the first line so low-attention readers see a reason to stay.',
    });
  } else {
    changes.push({
      field: 'Opening / hook',
      before: (sentences[0] ?? '').slice(0, 400),
      after: newHook,
      reason: 'Leads with the single strongest claim the content already makes, rather than preamble.',
    });
  }
  changes.push({
    field: 'Call to action',
    before: (ctaSentence ?? 'No explicit call to action detected.').slice(0, 400),
    after: newCta,
    reason: 'Reduces multiple or implied asks to one unambiguous action.',
  });
  if (Object.keys(JARGON_REWRITES).some((j) => new RegExp(`\\b${j}\\b`, 'i').test(text))) {
    changes.push({
      field: 'Language',
      before: 'Abstract or jargon-heavy phrasing',
      after: 'Plain-language equivalents',
      reason: 'Reduces the interpretive work the reader has to do, which raises comprehension.',
    });
  } else {
    changes.push({
      field: 'Sentence structure',
      before: 'Long, multi-clause sentences',
      after: 'Shorter sentences preserving the original wording',
      reason: 'Improves comprehension for readers with a low attention budget.',
    });
  }

  return { versionB, changes, hook: newHook, cta: newCta };
}
