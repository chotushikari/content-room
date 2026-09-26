import { z } from 'zod';
import { ReactionActionSchema } from './simulation';

export const MetricIdSchema = z.enum([
  'attention',
  'ignoreRate',
  'clarity',
  'trust',
  'positiveResponse',
  'negativeResponse',
  'shareIntent',
  'saveIntent',
  'commentIntent',
  'followIntent',
  'clickIntent',
  'purchaseIntent',
]);
export type MetricId = z.infer<typeof MetricIdSchema>;

export const METRIC_IDS: MetricId[] = [
  'attention',
  'ignoreRate',
  'clarity',
  'trust',
  'positiveResponse',
  'negativeResponse',
  'shareIntent',
  'saveIntent',
  'commentIntent',
  'followIntent',
  'clickIntent',
  'purchaseIntent',
];

export const METRIC_LABELS: Record<MetricId, string> = {
  attention: 'Attention',
  ignoreRate: 'Ignore rate',
  clarity: 'Clarity',
  trust: 'Trust',
  positiveResponse: 'Positive response',
  negativeResponse: 'Negative response',
  shareIntent: 'Share intent',
  saveIntent: 'Save intent',
  commentIntent: 'Comment intent',
  followIntent: 'Follow intent',
  clickIntent: 'Click intent',
  purchaseIntent: 'Purchase intent',
};

/**
 * A metric. Note what the type makes impossible:
 *  - `n` is REQUIRED, so no number exists without a sample size.
 *  - `method` is REQUIRED, so every number states how it was derived.
 *  - `kind` is a LITERAL, so a metric cannot claim to be measured real-world
 *    data, and the UI can render its "simulated estimate" label automatically.
 */
export const MetricSchema = z.object({
  id: MetricIdSchema,
  label: z.string().min(1),
  value: z.number().min(0).max(100),
  scale: z.literal(100),
  n: z.number().int().positive(),
  method: z.string().min(1),
  kind: z.literal('simulated_estimate'),
});
export type Metric = z.infer<typeof MetricSchema>;

export const SegmentBreakdownSchema = z.object({
  segmentId: z.string().min(1),
  segmentLabel: z.string().min(1),
  metrics: z.array(MetricSchema),
});
export type SegmentBreakdown = z.infer<typeof SegmentBreakdownSchema>;

/**
 * Disagreement is reported per metric WITH its per-segment breakdown.
 * Never collapsed into a single "polarisation score" — that would hide which
 * segments disagree and about what, which is the useful information.
 */
export const DisagreementSchema = z.object({
  metricId: MetricIdSchema,
  spread: z.number().min(0).max(100),
  bySegment: z
    .array(
      z.object({
        segmentId: z.string().min(1),
        segmentLabel: z.string().min(1),
        value: z.number().min(0).max(100),
        n: z.number().int().positive(),
      }),
    )
    .min(2),
});
export type Disagreement = z.infer<typeof DisagreementSchema>;

export const EvidenceRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['event', 'dna_field', 'content_span']),
  ref: z.string().min(1),
  note: z.string().max(300),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const MetricsBundleSchema = z.object({
  runId: z.string().min(1),
  overall: z.array(MetricSchema).min(1),
  bySegment: z.array(SegmentBreakdownSchema),
  disagreements: z.array(DisagreementSchema),
  bookkeeping: z.object({
    events: z.number().int().nonnegative(),
    agents: z.number().int().positive(),
    rounds: z.number().int().positive(),
    actionCounts: z.record(ReactionActionSchema, z.number().int().nonnegative()),
  }),
});
export type MetricsBundle = z.infer<typeof MetricsBundleSchema>;
