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

// ---------------------------------------------------------------------------
// content_dna
// ---------------------------------------------------------------------------

export function contentDnaRequest(asset: ContentAsset): StructuredRequest<ContentDNA> {
  return {
    task: 'content_dna',
    schema: ContentDNASchema,
    instructions: BASE_INSTRUCTIONS,
    maxOutputTokens: 1600,
    prompt: [
      `Analyse the ${asset.kind.replace(/_/g, ' ')} below and return its Content DNA.`,
      '',
      'Guidance:',
      '- hook: what the opening actually does, not a compliment. If the opening is weak, say so.',
      '- promise / valueProposition: what the reader is offered. If no explicit gain is stated, say so.',
      '- cta: the actual ask. If there is none or several competing ones, say so.',
      '- strengths: only what is genuinely present. Do not pad to avoid an empty list.',
      '- risks / potentialFrictions: the specific problems THIS text has, not generic advice.',
      '- confidence: your honest confidence given the input available.',
      '',
      asset.partial && asset.body.trim().length === 0
        ? 'NOTE: only metadata resolved. Do not invent body content, transcript, or visuals.'
        : '',
      `Title: ${asset.title || '(none)'}`,
      `Platform: ${asset.source.type === 'url' ? asset.source.platform : 'pasted content'}`,
      wrapUntrusted(asset.body || asset.title, 20_000),
    ]
      .filter(Boolean)
      .join('\n'),
    deterministic: () => heuristicDNA(asset),
  };
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
      wrapUntrusted(asset.body || asset.title, 12_000),
    ].join('\n'),
    deterministic: () => ({ segments: heuristicSegments(asset, dna, size) }),
  };
}

// ---------------------------------------------------------------------------
// why_report
// ---------------------------------------------------------------------------

/**
 * The model receives COMPUTED metrics and a bounded, stratified event sample —
 * never the whole run, and never the responsibility for producing a number.
 *
 * The sample is stratified deliberately: including REJECTs and disagreement
 * outliers stops the explanation being written from the loud majority alone.
 */
export function whyRequest(
  metrics: MetricsBundle,
  dna: ContentDNA,
  audience: Audience,
  eventExcerpts: string[],
): StructuredRequest<WhyReport> {
  const lowest = [...metrics.overall].sort((a, b) => a.value - b.value).slice(0, 3);
  const sample = eventExcerpts.slice(0, 40);

  return {
    task: 'why_report',
    schema: WhyReportSchema,
    instructions: BASE_INSTRUCTIONS,
    maxOutputTokens: 1800,
    prompt: [
      'Explain WHY the simulated audience responded the way it did.',
      '',
      'The numbers below are already computed. Do NOT produce or restate new numbers.',
      'Every claim must cite at least one evidence reference resolvable to the supplied',
      'metrics, DNA fields, or reaction events. If you cannot ground a claim, put it in',
      'ungroundedClaims instead of inventing support.',
      '',
      `Audience: ${audience.size} synthetic agents, ${audience.segments.map((s) => `${s.label} (n=${s.size})`).join(', ')}`,
      `Metrics (0-100, simulated): ${JSON.stringify(lowest)}`,
      `Disagreement (top): ${JSON.stringify(metrics.disagreements.slice(0, 2).map((d) => ({ metric: d.metricId, spread: d.spread, bySegment: d.bySegment })))}`,
      `Action counts: ${JSON.stringify(metrics.bookkeeping.actionCounts)}`,
      `Content DNA frictions: ${JSON.stringify(dna.potentialFrictions.map((f) => f.label))}`,
      `Content DNA risks: ${JSON.stringify(dna.risks)}`,
      '',
      'Stratified reaction sample (includes disagreement and rejection):',
      wrapUntrusted(sample.join('\n'), 8_000),
    ].join('\n'),
    deterministic: () => heuristicWhy(metrics, dna, audience),
  };
}

export { heuristicWhy, heuristicDNA, heuristicSegments };
export type { Segment };
