import { z } from 'zod';
import {
  ContentDNASchema,
  SegmentSchema,
  WhyReportSchema,
  type Audience,
  type ContentAsset,
  type ContentDNA,
  type MetricsBundle,
  type Segment,
  type WhyReport,
} from '../core/domain';
import { heuristicDNA, heuristicSegments, heuristicWhy } from './deterministic/analysis';
import { UNTRUSTED_CONTENT_RULE, wrapUntrusted, type StructuredRequest } from './types';

/**
 * The AI task registry: one definition per task, owning its schema, instruction,
 * input cap and — critically — its `deterministic` closure.
 *
 * Every prompt wraps imported content in <untrusted_content> delimiters and
 * states that the delimited region is data to analyse, never instructions to
 * follow. Imported content is hostile by default.
 */

const BASE_INSTRUCTIONS = [
  'You are part of Content Room, a synthetic-audience rehearsal system.',
  'You analyse content so a simulated audience can be constructed and rehearsed against.',
  'Never invent statistics, testimonials, percentages, or measured outcomes.',
  'Never claim real-world performance, lift, virality, or representativeness.',
  'Report what the content actually says. If something is absent, say it is absent.',
  UNTRUSTED_CONTENT_RULE,
].join(' ');

/**
 * One Groq model per task.
 *
 * Rate limits are per model, so four tasks against one model exhaust a single
 * budget. Verified available to this key: openai/gpt-oss-120b, openai/gpt-oss-20b,
 * qwen/qwen3.8-27b. Override any of them with CONTENT_ROOM_GROQ_MODEL_* if needed.
 */
/**
 * Input budgets, kept deliberately small.
 *
 * These were 20,000 / 12,000 / 6,000 characters — roughly 5,000 tokens for the
 * DNA call alone. Groq's free tier applies an ORG-LEVEL tokens-per-minute limit
 * shared across every model, so the total for the run is what binds, and an
 * over-generous per-call budget pushed later calls into a 429.
 *
 * Spreading the four tasks across three different Groq models did NOT help,
 * which is how the org-level (rather than per-model) nature of the limit was
 * confirmed.
 *
 * 6,000 characters is still a full social post, a long email, or a substantial
 * portion of an article — ample for reading a piece of content.
 */
const DNA_INPUT_CHARS = 6_000;
const SEGMENTS_INPUT_CHARS = 5_000;
const WHY_SAMPLE_CHARS = 3_500;

export const GROQ_MODELS = {
  dna: { groq: 'openai/gpt-oss-120b' },
  segments: { groq: 'qwen/qwen3.8-27b' },
  why: { groq: 'openai/gpt-oss-20b' },
  brief: { groq: 'openai/gpt-oss-120b' },
} as const;

// ---------------------------------------------------------------------------
// content_dna
// ---------------------------------------------------------------------------

/**
 * The model-facing Content DNA.
 *
 * Deliberately permissive: plain strings, unbounded arrays, no nested optional
 * fields and no length constraints. The strict `ContentDNASchema` is applied by
 * the composer below, not demanded of the model.
 *
 * Why this shape: `ContentDNASchema` is the most intricate of the four task
 * schemas, and asking a model to satisfy it directly failed intermittently in
 * production — "Failed to generate JSON" and "response did not match schema" —
 * after 14 seconds of nested retries. Asking for prose and enforcing the
 * structure ourselves fixed the same problem on the why and brief tasks.
 */
export const ContentDnaNarrativeSchema = z.object({
  hook: z.string(),
  topic: z.string(),
  promise: z.string(),
  valueProposition: z.string(),
  emotion: z.array(z.string()),
  tone: z.array(z.string()),
  cta: z.string(),
  visualStyle: z.string(),
  audienceSignals: z.array(z.string()),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  potentialFrictions: z.array(z.object({ label: z.string(), detail: z.string() })),
  confidence: z.number(),
});
export type ContentDnaNarrative = z.infer<typeof ContentDnaNarrativeSchema>;

const clean = (values: string[], max: number, itemMax: number): string[] =>
  values
    .map((v) => v.trim().slice(0, itemMax))
    .filter((v) => v.length > 0)
    .slice(0, max);

/**
 * Assemble the strict Content DNA from the model's prose.
 *
 * Where the model returns nothing usable for a required field, the deterministic
 * reading is used — so `strengths` and `emotion` always satisfy their `min(1)`
 * without the model having to be nagged about it.
 */
export function composeContentDna(
  narrative: ContentDnaNarrative,
  fallback: ContentDNA,
): ContentDNA {
  const text = (value: string, fallbackValue: string, max: number): string => {
    const trimmed = value.trim().slice(0, max);
    return trimmed.length > 0 ? trimmed : fallbackValue.slice(0, max);
  };

  const emotions = clean(narrative.emotion, 6, 60);
  const tones = clean(narrative.tone, 6, 60);
  const strengths = clean(narrative.strengths, 8, 200);

  return {
    hook: text(narrative.hook, fallback.hook, 300),
    topic: text(narrative.topic, fallback.topic, 200),
    promise: text(narrative.promise, fallback.promise, 400),
    valueProposition: text(narrative.valueProposition, fallback.valueProposition, 400),
    emotion: emotions.length > 0 ? emotions : fallback.emotion,
    tone: tones.length > 0 ? tones : fallback.tone,
    cta: text(narrative.cta, fallback.cta, 300),
    // Legitimately empty for text-only content, so no fallback.
    visualStyle: narrative.visualStyle.trim().slice(0, 300),
    audienceSignals: clean(narrative.audienceSignals, 10, 160),
    strengths: strengths.length > 0 ? strengths : fallback.strengths,
    risks: clean(narrative.risks, 8, 200),
    potentialFrictions: narrative.potentialFrictions
      .map((f) => ({
        label: f.label.trim().slice(0, 120),
        detail: f.detail.trim().slice(0, 400),
      }))
      .filter((f) => f.label.length > 0 && f.detail.length > 0)
      .slice(0, 8),
    confidence: Number.isFinite(narrative.confidence)
      ? Math.min(1, Math.max(0, narrative.confidence))
      : fallback.confidence,
  };
}

export function contentDnaRequest(
  asset: ContentAsset,
): StructuredRequest<ContentDnaNarrative> {
  const fallback = heuristicDNA(asset);
  return {
    task: 'content_dna',
    schema: ContentDnaNarrativeSchema,
    instructions: BASE_INSTRUCTIONS,
    maxOutputTokens: 1600,
    modelOverride: GROQ_MODELS.dna,
    prompt: [
      `Analyse the ${asset.kind.replace(/_/g, ' ')} below and return its Content DNA.`,
      '',
      'Guidance:',
      '- hook: what the opening actually does, not a compliment. If it is weak, say so.',
      '- promise / valueProposition: what the reader is offered. If no explicit gain is stated, say so.',
      '- cta: the actual ask. If there is none, or several competing ones, say so.',
      '- strengths: only what is genuinely present. Do not pad to avoid an empty list.',
      '- risks / potentialFrictions: the specific problems THIS text has, not generic advice.',
      '- confidence: your honest confidence given the input available.',
      '',
      asset.partial && asset.body.trim().length === 0
        ? 'NOTE: only metadata resolved. Do not invent body content, transcript, or visuals.'
        : '',
      `Title: ${asset.title || '(none)'}`,
      `Platform: ${asset.source.type === 'url' ? asset.source.platform : 'pasted content'}`,
      wrapUntrusted(asset.body || asset.title, DNA_INPUT_CHARS),
    ]
      .filter(Boolean)
      .join('\n'),
    deterministic: () => fallback,
  };
}

/** Assemble the strict DNA; used by the pipeline on both tiers. */
export function composeDnaFromRequest(
  narrative: ContentDnaNarrative,
  asset: ContentAsset,
): ContentDNA {
  return composeContentDna(narrative, heuristicDNA(asset));
}

// ---------------------------------------------------------------------------
// audience_segments
// ---------------------------------------------------------------------------

export const SegmentsResponseSchema = z.object({ segments: z.array(SegmentSchema).min(1) });

export function segmentsRequest(
  asset: ContentAsset,
  dna: ContentDNA,
  size: number,
): StructuredRequest<{ segments: Segment[] }> {
  return {
    task: 'audience_segments',
    schema: SegmentsResponseSchema,
    instructions: BASE_INSTRUCTIONS,
    maxOutputTokens: 1200,
    modelOverride: GROQ_MODELS.segments,
    prompt: [
      'Propose the audience segments this content actually needs. Not a demographic split.',
      '',
      'Requirements:',
      `- Return between 3 and 6 segments whose sizes sum to exactly ${size}.`,
      '- Each segment needs a rationale that references something specific in THIS content.',
      '- At least one segment must be plausibly skeptical or resistant.',
      '- Segments are stances or behaviours, not only job titles.',
      '- archetypeIds must be drawn from the allowed library and express that stance.',
      '',
      `Content DNA: ${JSON.stringify({ topic: dna.topic, promise: dna.promise, risks: dna.risks, frictions: dna.potentialFrictions.map((f) => f.label) })}`,
      wrapUntrusted(asset.body || asset.title, SEGMENTS_INPUT_CHARS),
    ].join('\n'),
    deterministic: () => ({ segments: heuristicSegments(asset, dna, size) }),
  };
}

// ---------------------------------------------------------------------------
// why_report
// ---------------------------------------------------------------------------

/**
 * The why_report task faces the model with LANGUAGE ONLY.
 *
 * The first version asked the model to return the full `WhyReport`, which meant
 * reproducing `audienceSplit` — a computed structure with exact `spread` values
 * and per-segment numbers. That failed in production with
 * `AI_NoObjectGeneratedError: response did not match schema`, and it was a
 * design error twice over: it asked a language model to echo numbers we had
 * already computed, and it made a schema violation likely on every call.
 *
 * So the model writes the sentences, and the composer below assembles the strict
 * report from the model's prose plus the metrics we computed. This is the
 * project's own rule — AI handles language, code handles every number — applied
 * to the task that had drifted furthest from it.
 */
export const WhyNarrativeSchema = z.object({
  headline: z.string().max(300),
  detail: z.string().max(1200),
  frictions: z
    .array(z.object({ label: z.string().max(160), detail: z.string().max(500) }))
    .max(5),
  evidenceRefs: z.array(z.string().max(200)).max(6),
  ungroundedClaims: z.array(z.string().max(300)).max(5),
});
export type WhyNarrative = z.infer<typeof WhyNarrativeSchema>;

/** Assemble the strict report: model prose + computed structure. */
export function composeWhyReport(
  narrative: WhyNarrative,
  metrics: MetricsBundle,
  dna: ContentDNA,
): WhyReport {
  const refs = (notes: string[]): WhyReport['biggestSignal']['evidence'] =>
    notes.slice(0, 3).map((note, i) => ({
      id: `ev_${i}`,
      kind: 'dna_field' as const,
      ref: narrative.evidenceRefs[i] ?? `metrics.${metrics.overall[i]?.id ?? 'attention'}`,
      note: note.slice(0, 300),
    }));

  // Evidence is guaranteed non-empty: if the model supplied no usable refs, a
  // computed one from the real metrics is used instead. The schema's min(1) can
  // therefore always be satisfied without inventing a claim.
  const weakest = [...metrics.overall].sort((a, b) => a.value - b.value)[0];
  const computedEvidence: WhyReport['biggestSignal']['evidence'] = [
    {
      id: 'ev_computed',
      kind: 'dna_field',
      ref: `metrics.${weakest?.id ?? 'attention'}`,
      note: `${weakest?.label ?? 'Attention'} is the lowest simulated metric at ${weakest?.value ?? 0} (n=${weakest?.n ?? metrics.bookkeeping.agents}).`,
    },
  ];

  const modelEvidence = refs(
    (narrative.evidenceRefs.length > 0 ? narrative.evidenceRefs : []).map(
      (r) => `Model-cited evidence: ${r}`,
    ),
  );

  const splitEvidence = metrics.disagreements[0]
    ? [
        {
          id: 'ev_split',
          kind: 'dna_field' as const,
          ref: `disagreement.${metrics.disagreements[0].metricId}`,
          note: `Spread of ${metrics.disagreements[0].spread} points across segments.`,
        },
      ]
    : [];

  return {
    biggestSignal: {
      headline: narrative.headline.slice(0, 300),
      detail: narrative.detail.slice(0, 1200),
      evidence: [...modelEvidence, ...splitEvidence, ...computedEvidence].slice(0, 4),
    },
    // Purely computed. Never asked of the model.
    audienceSplit: metrics.disagreements.slice(0, 3),
    topFrictions: narrative.frictions.slice(0, 5).map((f, i) => ({
      rank: i + 1,
      label: f.label.slice(0, 160),
      detail: f.detail.slice(0, 500),
      evidence: [
        {
          id: `ev_fr_${i}`,
          kind: 'dna_field' as const,
          ref: dna.potentialFrictions[i]?.label
            ? `dna.potentialFrictions[${i}]`
            : `metrics.${weakest?.id ?? 'attention'}`,
          note: (dna.potentialFrictions[i]?.detail ?? f.detail).slice(0, 300),
        },
      ],
    })),
    ungroundedClaims: narrative.ungroundedClaims.slice(0, 5),
  };
}

/** The model-facing request for why_report. */
export function whyRequest(
  metrics: MetricsBundle,
  dna: ContentDNA,
  audience: Audience,
  eventExcerpts: string[],
): StructuredRequest<WhyNarrative> {
  const lowest = [...metrics.overall].sort((a, b) => a.value - b.value).slice(0, 3);
  const sample = eventExcerpts.slice(0, 30);

  return {
    task: 'why_report',
    schema: WhyNarrativeSchema,
    modelOverride: GROQ_MODELS.why,
    instructions: [
      'You are explaining, in plain language, why a simulated audience reacted as it did.',
      'Return prose only. Do NOT produce numbers, percentages, or restate computed values as if you calculated them.',
      'Do not quote a metric value; refer to the pattern instead.',
      'Every claim must be grounded in the supplied reactions or DNA. If you cannot ground a claim, put it in ungroundedClaims.',
      UNTRUSTED_CONTENT_RULE,
    ].join(' '),
    maxOutputTokens: 1200,
    prompt: [
      'Explain why this audience responded the way it did.',
      '',
      `Audience: ${audience.size} synthetic agents — ${audience.segments.map((s) => `${s.label} (n=${s.size})`).join(', ')}`,
      `Weakest metrics: ${lowest.map((m) => m.label).join(', ')}`,
      `Audience split: ${metrics.disagreements.slice(0, 2).map((d) => `${d.metricId} spans ${d.spread} points across ${d.bySegment.length} segments`).join('; ') || 'no significant split'}`,
      `Action mix: ${Object.entries(metrics.bookkeeping.actionCounts).filter(([, n]) => n > 0).map(([a, n]) => `${a} ${n}`).join(', ')}`,
      `Identified frictions: ${dna.potentialFrictions.map((f) => f.label).join(' | ') || '(none)'}`,
      '',
      'Reaction sample (these are synthetic agents, and the sample deliberately includes disagreement and rejection):',
      wrapUntrusted(sample.join('\n'), WHY_SAMPLE_CHARS),
    ].join('\n'),
    deterministic: () => deterministicWhyNarrative(metrics, dna, audience),
  };
}

/**
 * The deterministic why narrative.
 *
 * Lives here rather than in the analyser because it is now the fallback for the
 * NARRATIVE, and the composer turns it into the report exactly as it does for the
 * model's output — so both tiers produce the same shape by construction.
 */
export function deterministicWhyNarrative(
  metrics: MetricsBundle,
  dna: ContentDNA,
  audience: Audience,
): WhyNarrative {
  const weakest = [...metrics.overall].sort((a, b) => a.value - b.value)[0];
  const strongest = [...metrics.overall].sort((a, b) => b.value - a.value)[0];
  const split = metrics.disagreements[0];
  const friction = dna.potentialFrictions[0];

  const headline = friction
    ? `The dominant signal is ${friction.label.toLowerCase()}, and it lands hardest on the least engaged segment.`
    : `${strongest?.label ?? 'Response'} runs ahead of ${weakest?.label ?? 'attention'}, so the reaction is real but narrow.`;

  const detail = [
    `${audience.size} synthetic agents over ${metrics.bookkeeping.rounds} rounds produced ${metrics.bookkeeping.events} reaction events.`,
    strongest ? `${strongest.label} is the strongest signal; ${weakest?.label} is the weakest.` : '',
    friction
      ? `That pattern is consistent with the friction identified in the DNA: ${friction.detail}`
      : 'No single structural friction dominates, so the response reflects audience fit rather than a defect.',
    metrics.bookkeeping.actionCounts.REJECT > 0
      ? 'Some agents actively rejected it rather than ignoring it, which points at trust rather than relevance.'
      : 'No agents actively rejected it, which suggests the problem is attention and clarity rather than trust.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    headline: headline.slice(0, 280),
    detail: detail.slice(0, 1100),
    frictions: dna.potentialFrictions.slice(0, 4).map((f) => ({
      label: f.label,
      detail: f.detail,
    })),
    evidenceRefs: [
      `metrics.${weakest?.id ?? 'attention'}`,
      ...(split ? [`disagreement.${split.metricId}`] : []),
      ...dna.potentialFrictions.slice(0, 1).map(() => 'dna.potentialFrictions[0]'),
    ],
    ungroundedClaims: [],
  };
}

export { heuristicWhy, heuristicDNA, heuristicSegments };
export type { Segment };
