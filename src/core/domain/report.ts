import { z } from 'zod';
import { MetricIdSchema, MetricSchema, EvidenceRefSchema, DisagreementSchema, MetricsBundleSchema } from './analytics';
import { ContentAssetSchema, ContentDNASchema } from './content';
import { AudienceRefSchema, AudienceSchema, PersonaAgentSchema } from './audience';
import { AgentEventSchema, EngineIdSchema, SimulationRunSchema } from './simulation';

/**
 * The explanation. `evidence` has min(1) on the biggest signal and on every
 * friction, so a claim with no evidence behind it CANNOT BE CONSTRUCTED.
 * That is how "recommendations must be connected to simulation evidence"
 * becomes mechanically enforced instead of aspirational.
 */
export const WhyReportSchema = z.object({
  biggestSignal: z.object({
    headline: z.string().max(300),
    detail: z.string().max(1200),
    evidence: z.array(EvidenceRefSchema).min(1),
  }),
  audienceSplit: z.array(DisagreementSchema).max(4),
  topFrictions: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(5),
        label: z.string().max(160),
        detail: z.string().max(500),
        evidence: z.array(EvidenceRefSchema).min(1),
      }),
    )
    .max(5),
  ungroundedClaims: z.array(z.string().max(300)).max(5),
});
export type WhyReport = z.infer<typeof WhyReportSchema>;

export const CreativeBriefSchema = z.object({
  strongestSignal: z.string().max(400),
  biggestRisk: z.string().max(400),
  highestImpactChange: z.string().max(400),
  top3Changes: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(3),
        change: z.string().max(300),
        expectedEffect: z.string().max(300),
        evidence: z.array(EvidenceRefSchema).min(1),
      }),
    )
    .length(3),
  recommendedHook: z.string().max(400),
  recommendedCTA: z.string().max(300),
  strategy: z.string().max(1500),
  versionB: ContentAssetSchema,
  changes: z
    .array(
      z.object({
        field: z.string().max(80),
        before: z.string().max(800),
        after: z.string().max(800),
        reason: z.string().max(300),
      }),
    )
    .min(1),
});
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

/**
 * Before/after. `caveats` has min(1): a comparison that carries no caveat
 * cannot be constructed, so the "Simulated change" labelling cannot be
 * forgotten under deadline pressure.
 */
export const ComparisonSchema = z.object({
  runA: z.string().min(1),
  runB: z.string().min(1),
  audienceRef: AudienceRefSchema,
  samePopulation: z.boolean(),
  reproducibility: z.enum(['deterministic', 'sampled']),
  rows: z
    .array(
      z.object({
        metricId: MetricIdSchema,
        label: z.string().min(1),
        a: MetricSchema,
        b: MetricSchema,
        delta: z.number(),
        direction: z.enum(['up', 'down', 'flat']),
      }),
    )
    .min(1),
  caveats: z.array(z.string()).min(1),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const ValidationStatusSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('not_established'),
    note: z.string(),
  }),
  z.object({
    state: z.literal('calibrated'),
    benchmarks: z.array(
      z.object({
        metric: z.string(),
        observed: z.number(),
        simulated: z.number(),
        error: z.number(),
        method: z.enum(['mae', 'rmse', 'correlation', 'brier', 'jsd']),
        n: z.number().int().positive(),
      }),
    ),
    calibratedAt: z.string(),
  }),
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/**
 * The truthful current state. Typed as the narrow literal so callers can read
 * `.note` directly while the whole value stays assignable to ValidationStatus.
 *
 * There is no benchmark: no simulation result in this product has ever been
 * compared against an observed real-world outcome, and no code path exists that
 * would let a fabricated number be presented as one.
 */
export const NOT_ESTABLISHED = {
  state: 'not_established',
  note: 'Validation benchmark: being established.',
} as const satisfies ValidationStatus;

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'URL_BLOCKED',
  'IMPORT_FAILED',
  'MODEL_UNAVAILABLE',
  'MODEL_OUTPUT_INVALID',
  'ENGINE_UNAVAILABLE',
  'AUDIENCE_MISMATCH',
  'STORE_UNAVAILABLE',
  'ABORTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ProviderIdSchema = z.enum([
  'google',
  'groq',
  'openrouter',
  'openai-compatible',
  'ollama',
  'fixtures',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const RunModeSchema = z.enum(['live', 'degraded', 'demo']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const ProviderUsageSchema = z.object({
  task: z.string().min(1),
  providerId: ProviderIdSchema,
  modelId: z.string(),
  degraded: z.boolean(),
  latencyMs: z.number().nonnegative(),
});
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;

export const RunRecordSchema = z.object({
  run: SimulationRunSchema,
  asset: ContentAssetSchema,
  dna: ContentDNASchema,
  audience: AudienceSchema,
  events: z.array(AgentEventSchema),
  metrics: MetricsBundleSchema,
  why: WhyReportSchema.nullable(),
  brief: CreativeBriefSchema.nullable(),
  versionBRun: SimulationRunSchema.nullable(),
  versionBEvents: z.array(AgentEventSchema).nullable(),
  versionBMetrics: MetricsBundleSchema.nullable(),
  comparison: ComparisonSchema.nullable(),
  providers: z.array(ProviderUsageSchema),
  mode: RunModeSchema,
  validation: ValidationStatusSchema,
  versionBAsset: ContentAssetSchema.nullable(),
  versionBAudience: z.array(PersonaAgentSchema).nullable(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

/**
 * The streaming protocol. One HTTP response carries the whole run.
 * `heartbeat` is mandatory: Vercel sends HTTP/2 PING frames but an idle
 * HTTP/1.1 connection can be closed by an intermediary.
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run_started'),
    runId: z.string(),
    /**
     * PROVISIONAL. This is the mode implied by which providers are CONFIGURED
     * (i.e. which API keys are present), not by what actually served the run.
     * The authoritative mode arrives with `run_completed`, derived from real
     * provider usage, so a degraded run cannot be presented as live.
     */
    mode: RunModeSchema,
    engineId: EngineIdSchema,
    label: z.enum(['A', 'B']),
  }),
  z.object({ type: z.literal('stage_changed'), stage: z.string(), label: z.string() }),
  z.object({ type: z.literal('ingest_resolved'), asset: ContentAssetSchema, note: z.string().nullable() }),
  z.object({ type: z.literal('dna_ready'), dna: ContentDNASchema, label: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('audience_ready'), audience: AudienceSchema }),
  z.object({
    type: z.literal('round_started'),
    round: z.number().int(),
    ofRounds: z.number().int(),
    label: z.enum(['A', 'B']),
  }),
  z.object({ type: z.literal('agent_event'), event: AgentEventSchema }),
  z.object({ type: z.literal('round_completed'), round: z.number().int(), label: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('metrics_ready'), metrics: MetricsBundleSchema, label: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('why_ready'), why: WhyReportSchema }),
  z.object({ type: z.literal('brief_ready'), brief: CreativeBriefSchema }),
  z.object({ type: z.literal('versionb_ready'), asset: ContentAssetSchema }),
  z.object({ type: z.literal('resim_event'), event: AgentEventSchema }),
  z.object({ type: z.literal('comparison_ready'), comparison: ComparisonSchema }),
  z.object({ type: z.literal('heartbeat'), at: z.string() }),
  /**
   * Authoritative terminal state: what ACTUALLY served this run.
   * Carries no run data — the client already holds every event it received, so
   * re-sending the full record here would duplicate the whole log on the wire.
   * The complete record is available from GET /api/runs/:id.
   */
  z.object({
    type: z.literal('run_completed'),
    mode: RunModeSchema,
    providers: z.array(ProviderUsageSchema),
    validation: ValidationStatusSchema,
  }),
  z.object({
    type: z.literal('run_failed'),
    stage: z.string(),
    code: ErrorCodeSchema,
    message: z.string(),
    recovered: z.boolean(),
  }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

export const CreateRunRequestSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('url'), url: z.string().max(2048) }),
    z.object({
      type: z.literal('manual'),
      kind: z.string().max(60),
      title: z.string().max(300),
      body: z.string().min(1).max(20_000),
    }),
    z.object({ type: z.literal('fixture'), fixtureId: z.string().min(1) }),
  ]),
  options: z
    .object({
      audienceSize: z.number().int().min(6).max(60).default(24),
      rounds: z.number().int().min(1).max(6).default(3),
      audienceSeed: z.string().max(64).optional(),
      engineId: z.enum(['deterministic', 'oasis']).default('deterministic'),
      demoMode: z.boolean().default(false),
    })
    .default({ audienceSize: 24, rounds: 3, engineId: 'deterministic', demoMode: false }),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const ResimulateRequestSchema = z.object({
  runId: z.string().min(1),
  /**
   * Stateless fallback context.
   *
   * Vercel serverless instances do not share memory, so the record written by
   * run A may not exist when the re-simulation is requested — a cold start, a
   * second instance, or simply a pause between the two steps is enough to lose
   * it. Verified in production: back-to-back requests happened to reuse the
   * instance, which is exactly the kind of luck a live demo must not depend on.
   *
   * The client already holds all of this from the event stream, so it sends it
   * back and the server can run the comparison without the original record. The
   * population hash is still re-derived and asserted, so the controlled-
   * comparison guarantee does not depend on trusting this payload.
   */
  context: z
    .object({
      audience: AudienceSchema,
      dna: ContentDNASchema,
      versionBAsset: ContentAssetSchema,
      metricsA: MetricsBundleSchema,
      rounds: z.number().int().min(1).max(6),
    })
    .optional(),
});
export type ResimulateRequest = z.infer<typeof ResimulateRequestSchema>;
