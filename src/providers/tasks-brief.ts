import { z } from 'zod';
import {
  EvidenceRefSchema,
  type Audience,
  type ContentDNA,
  type MetricsBundle,
  type WhyReport,
} from '../core/domain';
import { UNTRUSTED_CONTENT_RULE, type StructuredRequest } from './types';
import { GROQ_MODELS } from './tasks';

/**
 * The Creative Director's NARRATIVE.
 *
 * Note the deliberate split: the model writes the reasoning and the strategy,
 * while `versionB` and the A->B change list are produced DETERMINISTICALLY by
 * the rewriter (providers/deterministic/analysis.ts). Two reasons:
 *
 *  1. A diff authored by a model drifts from the actual text it claims to
 *     describe. A computed diff cannot.
 *  2. The deterministic rewrite preserves every numeral and named entity by
 *     construction — it moves and tightens sentences rather than generating new
 *     ones — so Version B cannot quietly fabricate evidence.
 *
 * If a model-written rewrite is added later, it must pass a fact-preservation
 * check against the original and fall back to the deterministic rewrite when it
 * drops or alters a number.
 */

export const BriefNarrativeSchema = z.object({
  strongestSignal: z.string().max(400),
  biggestRisk: z.string().max(400),
  highestImpactChange: z.string().max(400),
  top3Changes: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(6),
        change: z.string().max(300),
        expectedEffect: z.string().max(300),
        /**
         * Plain strings, not EvidenceRef objects.
         *
         * Asking the model for the full object — with `id`, `kind` and `ref` — was
         * the same mistake as the why_report schema: it made a schema violation
         * likely on every call for no benefit, since we can construct the object
         * ourselves. The composer below turns these into evidence refs.
         */
        evidenceRefs: z.array(z.string().max(200)).max(4),
      }),
    )
    .min(1)
    .max(6),
  recommendedHook: z.string().max(400),
  recommendedCTA: z.string().max(300),
  strategy: z.string().max(1500),
});
export type BriefNarrative = z.infer<typeof BriefNarrativeSchema>;

/**
 * Normalise the model's narrative into the strict shape the UI consumes.
 *
 * Two guarantees are enforced here rather than hoped for:
 *  - `top3Changes` is EXACTLY three, by trimming or padding from the
 *    deterministic narrative. The earlier `.length(3)` schema rejected the whole
 *    response when the model returned two or four, which took the run's mode to
 *    "degraded" over a formatting detail.
 *  - every change carries at least one evidence reference, because the UI's
 *    promise is that a recommendation is never unsupported.
 */
export function composeBriefNarrative(
  narrative: BriefNarrative,
  fallback: BriefNarrative,
): BriefNarrative {
  const changes = [...narrative.top3Changes].sort((a, b) => a.rank - b.rank).slice(0, 3);
  while (changes.length < 3) {
    const next = fallback.top3Changes[changes.length];
    if (!next) break;
    changes.push({ ...next, rank: changes.length + 1 });
  }

  return {
    ...narrative,
    top3Changes: changes.map((c, i) => ({
      ...c,
      rank: i + 1,
      evidenceRefs:
        c.evidenceRefs.length > 0 ? c.evidenceRefs : [`changes[${i}]`],
    })),
  };
}

export function deterministicNarrative(
  metrics: MetricsBundle,
  dna: ContentDNA,
  why: WhyReport,
  rewrite: { hook: string; cta: string; changes: Array<{ field: string; reason: string }> },
): BriefNarrative {
  const weakest = [...metrics.overall].sort((a, b) => a.value - b.value)[0];
  const strongest = [...metrics.overall].sort((a, b) => b.value - a.value)[0];
  const biggestDisagreement = metrics.disagreements[0];

  const signal = why.biggestSignal.headline;
  const risk =
    dna.risks[0] ??
    `The weakest simulated metric is ${weakest?.label ?? 'attention'} at ${weakest?.value ?? 0}.`;

  const evidence = (ref: string, note: string) => [{ ref, note }];

  return {
    strongestSignal: signal.slice(0, 380),
    biggestRisk: (biggestDisagreement
      ? `${risk} It is unevenly distributed: ${biggestDisagreement.metricId} spans ${biggestDisagreement.spread} points across segments.`
      : risk
    ).slice(0, 380),
    highestImpactChange: (rewrite.changes[0]?.reason ?? 'Lead with the value proposition.').slice(0, 380),
    top3Changes: rewrite.changes.slice(0, 3).map((c, i) => ({
      rank: i + 1,
      change: c.field,
      expectedEffect: c.reason.slice(0, 280),
      evidenceRefs: evidence(`changes[${i}]`, c.reason.slice(0, 200)).map((e) => e.ref),
    })),
    recommendedHook: rewrite.hook.slice(0, 380),
    recommendedCTA: rewrite.cta.slice(0, 280),
    strategy: [
      `Strongest simulated signal: ${strongest?.label ?? 'response'} at ${strongest?.value ?? 0}. Weakest: ${weakest?.label ?? 'attention'} at ${weakest?.value ?? 0}.`,
      `The content already makes its case; the ordering is what costs it attention. Moving the value proposition into the opening addresses the lowest metric directly.`,
      `Reducing the call to action to a single explicit ask addresses the second-lowest.`,
      `Re-run the same synthetic audience to see whether the room changed. This is a simulated estimate, not a forecast of real-world performance.`,
    ]
      .join(' ')
      .slice(0, 1400),
  };
}

export function briefNarrativeRequest(
  metrics: MetricsBundle,
  dna: ContentDNA,
  why: WhyReport,
  audience: Audience,
  rewrite: { hook: string; cta: string; changes: Array<{ field: string; reason: string }> },
): StructuredRequest<BriefNarrative> {
  const fallback = deterministicNarrative(metrics, dna, why, rewrite);

  return {
    task: 'creative_brief',
    schema: BriefNarrativeSchema,
    maxOutputTokens: 1600,
    modelOverride: GROQ_MODELS.brief,
    instructions: [
      'You are the Creative Director in Content Room, a synthetic-audience rehearsal system.',
      'Recommend changes grounded ONLY in the supplied simulation evidence.',
      'Never claim real-world performance, lift, virality, conversions, or statistical significance.',
      'Never state an expected percentage change. Effects are described qualitatively.',
      'Every top3Changes entry must cite evidence that resolves to the supplied metrics or DNA fields.',
      'Return exactly 3 changes.',
      UNTRUSTED_CONTENT_RULE,
    ].join(' '),
    prompt: [
      'Write the strategy for improving this content, for a simulated audience rehearsal.',
      '',
      `Audience: ${audience.size} synthetic agents across ${audience.segments.length} segments.`,
      `Weakest metric: ${JSON.stringify([...metrics.overall].sort((a, b) => a.value - b.value).slice(0, 3))}`,
      `Disagreement: ${JSON.stringify(metrics.disagreements.slice(0, 2).map((d) => ({ metric: d.metricId, spread: d.spread, bySegment: d.bySegment })))}`,
      `Explanation: ${why.biggestSignal.headline}`,
      `DNA risks: ${JSON.stringify(dna.risks)}`,
      `DNA frictions: ${JSON.stringify(dna.potentialFrictions.map((f) => f.label))}`,
      '',
      'The rewrite has already been produced. Describe it rather than inventing a different one:',
      `  revised hook: ${JSON.stringify(rewrite.hook.slice(0, 300))}`,
      `  revised CTA: ${JSON.stringify(rewrite.cta.slice(0, 200))}`,
      `  changes: ${JSON.stringify(rewrite.changes.map((c) => ({ field: c.field, reason: c.reason })))}`,
    ].join('\n'),
    deterministic: () => fallback,
  };
}
