import { z } from 'zod';
import { AudienceRefSchema } from './audience';

export const JourneyStageSchema = z.enum([
  'exposure',
  'attention',
  'interpretation',
  'response',
  'decision',
  'action',
]);
export type JourneyStage = z.infer<typeof JourneyStageSchema>;

export const JOURNEY_STAGES: JourneyStage[] = [
  'exposure',
  'attention',
  'interpretation',
  'response',
  'decision',
  'action',
];

export const STAGE_LABELS: Record<JourneyStage, string> = {
  exposure: 'Watching',
  attention: 'Watching',
  interpretation: 'Interpreting',
  response: 'Interpreting',
  decision: 'Deciding',
  action: 'Reacting',
};

export const ReactionActionSchema = z.enum([
  'STOP',
  'IGNORE',
  'LIKE',
  'COMMENT',
  'SHARE',
  'SAVE',
  'FOLLOW',
  'CLICK',
  'BUY',
  'REJECT',
]);
export type ReactionAction = z.infer<typeof ReactionActionSchema>;

export const REACTION_ACTIONS: ReactionAction[] = [
  'STOP',
  'IGNORE',
  'LIKE',
  'COMMENT',
  'SHARE',
  'SAVE',
  'FOLLOW',
  'CLICK',
  'BUY',
  'REJECT',
];

/** Actions that represent engagement rather than disengagement. */
export const ENGAGEMENT_ACTIONS: ReactionAction[] = [
  'LIKE',
  'COMMENT',
  'SHARE',
  'SAVE',
  'FOLLOW',
  'CLICK',
  'BUY',
];

/**
 * The universal interface between simulation engines and analytics.
 *
 * Shape deliberately mirrors OASIS's `trace(user_id, created_at, action, info)`
 * so a future OASIS adapter is a pure field mapping and nothing downstream
 * changes. `producedBy` is mandatory: every event is attributable to the engine
 * that emitted it, which is what makes the honesty labels automatable.
 */
export const AgentEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  agentId: z.string().min(1),
  segmentId: z.string().min(1),
  round: z.number().int().min(1),
  stage: JourneyStageSchema,
  action: ReactionActionSchema.nullable(),
  intensity: z.number().min(0).max(1),
  reasons: z.array(z.string().max(120)).max(6),
  excerpt: z.string().max(400).nullable(),
  evidenceRefs: z.array(z.string().max(200)).max(6),
  producedBy: z.enum(['deterministic', 'oasis']),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const EngineIdSchema = z.enum(['deterministic', 'oasis']);
export type EngineId = z.infer<typeof EngineIdSchema>;

export const ReproducibilitySchema = z.enum(['deterministic', 'sampled']);
export type Reproducibility = z.infer<typeof ReproducibilitySchema>;

export const SimulationRunSchema = z.object({
  id: z.string().min(1),
  label: z.enum(['A', 'B']),
  contentHash: z.string().min(1),
  audienceRef: AudienceRefSchema,
  engineId: EngineIdSchema,
  engineVersion: z.string().min(1),
  reproducibility: ReproducibilitySchema,
  status: z.enum(['pending', 'running', 'completed', 'failed', 'degraded']),
  rounds: z.number().int().min(1),
  seed: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type SimulationRun = z.infer<typeof SimulationRunSchema>;
