import { z } from 'zod';
import { ArchetypeIdSchema } from './content';

export const TraitsSchema = z.object({
  skepticism: z.number().min(0).max(1),
  priceSensitivity: z.number().min(0).max(1),
  attentionBudget: z.number().min(0).max(1),
  noveltySeeking: z.number().min(0).max(1),
  socialPropensity: z.number().min(0).max(1),
  domainKnowledge: z.number().min(0).max(1),
});
export type Traits = z.infer<typeof TraitsSchema>;

export const PersonaAgentSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(80),
  archetypeId: ArchetypeIdSchema,
  segmentId: z.string().min(1),
  traits: TraitsSchema,
  interests: z.array(z.string().max(60)).max(8),
  priorBeliefs: z.array(z.string().max(200)).max(6),
  bio: z.string().max(2000),
  producedBy: z.string().min(1),
});
export type PersonaAgent = z.infer<typeof PersonaAgentSchema>;

export const SegmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(80),
  /** Why this segment is relevant to THIS content. Not a generic demographic. */
  rationale: z.string().max(400),
  archetypeIds: z.array(ArchetypeIdSchema).min(1),
  size: z.number().int().positive(),
});
export type Segment = z.infer<typeof SegmentSchema>;

/**
 * Audience identity. This is the foundation of the product's differentiator:
 * a controlled re-simulation must reuse the SAME population, and the pipeline
 * asserts `populationHash` equality rather than trusting it.
 */
export const AudienceRefSchema = z.object({
  audienceId: z.string().min(1),
  audienceSeed: z.string().min(1),
  populationHash: z.string().min(1),
  controlMode: z.enum(['same_population', 'regenerated']),
});
export type AudienceRef = z.infer<typeof AudienceRefSchema>;

export const AudienceSchema = z.object({
  ref: AudienceRefSchema,
  size: z.number().int().positive().max(200),
  segments: z.array(SegmentSchema).min(1),
  agents: z.array(PersonaAgentSchema).min(1),
});
export type Audience = z.infer<typeof AudienceSchema>;

export class AudienceMismatchError extends Error {
  readonly code = 'AUDIENCE_MISMATCH' as const;
  constructor(a: AudienceRef, b: AudienceRef) {
    super(
      `Audience mismatch: expected populationHash ${a.populationHash} but got ${b.populationHash}. ` +
        `A controlled comparison requires the same synthetic audience.`,
    );
    this.name = 'AudienceMismatchError';
  }
}

/**
 * Assert that two audience refs are the same population.
 * Throws loudly rather than silently regenerating a different audience.
 */
export function assertSamePopulation(a: AudienceRef, b: AudienceRef): void {
  if (
    a.populationHash !== b.populationHash ||
    a.audienceId !== b.audienceId ||
    a.audienceSeed !== b.audienceSeed
  ) {
    throw new AudienceMismatchError(a, b);
  }
}

export function samePopulation(a: AudienceRef, b: AudienceRef): boolean {
  return (
    a.populationHash === b.populationHash &&
    a.audienceId === b.audienceId &&
    a.audienceSeed === b.audienceSeed
  );
}
