import {
  ARCHETYPE_LABELS,
  type AgentEvent,
  type Audience,
  type JourneyStage,
  type PersonaAgent,
  type ReactionAction,
} from './domain';
import { clamp01 } from './rng';

/**
 * Per-agent profiles: who this synthetic person is, and why they reacted as they
 * did.
 *
 * PURE and deterministic, like the rest of the core. Everything here comes from
 * the persona the audience factory built and the events the engine emitted — no
 * model call, and nothing narrated after the fact.
 *
 * The point is accountability. A simulated audience that cannot be inspected
 * per member is just a number that appeared, and "the audience didn't like it" is
 * not a useful answer. This turns each agent into an inspectable individual with
 * a stated archetype, motivation, reaction and reasoning.
 *
 * HONESTY: `confidence` is the simulation's own resolution, not a measure of
 * real-world certainty, and callers must render it with the simulated label and
 * the population size — mirroring how every other number in this product is
 * presented.
 */

export type AgentProfile = {
  id: string;
  /** Display label, e.g. "Skeptic #07". */
  label: string;
  archetypeLabel: string;
  segmentId: string;
  segmentLabel: string;
  segmentIndex: number;
  /** Why this agent cares, in their own terms. */
  motivation: string[];
  /** Traits rendered as readable descriptors rather than raw numbers. */
  disposition: string[];
  state: JourneyStage;
  /** Plain-language reading of the outcome: "Interested but unconvinced". */
  reaction: string;
  action: ReactionAction | null;
  /** The agent's own fragment, as emitted by the engine. */
  reasoning: string | null;
  reasonCodes: string[];
  /** 0-1. The simulation's resolution for this agent's reaction. */
  confidence: number;
  intensity: number;
  round: number;
};

/** Turn a trait value into a word, so the panel reads rather than reports. */
function describe(value: number, low: string, mid: string, high: string): string {
  if (value >= 0.66) return high;
  if (value >= 0.36) return mid;
  return low;
}

function dispositionOf(agent: PersonaAgent): string[] {
  const t = agent.traits;
  return [
    describe(t.skepticism, 'Trusting', 'Balanced', 'Skeptical'),
    describe(t.attentionBudget, 'Skims', 'Reads some', 'Reads closely'),
    describe(t.priceSensitivity, 'Cost-tolerant', 'Cost-aware', 'Cost-driven'),
    describe(t.socialPropensity, 'Private', 'Selective', 'Shares readily'),
    describe(t.domainKnowledge, 'New to this', 'Familiar', 'Expert'),
    describe(t.noveltySeeking, 'Habitual', 'Open', 'Novelty-seeking'),
  ];
}

/**
 * The reaction phrase.
 *
 * Composed from the action and its intensity — so "REJECT" at low intensity reads
 * differently from a hard rejection, which is exactly the distinction the
 * intensity channel exists to carry.
 */
export function reactionPhrase(action: ReactionAction | null, intensity: number): string {
  if (!action) return 'Deciding';
  const strength = intensity >= 0.66 ? 'strongly' : intensity >= 0.33 ? '' : 'mildly';
  const join = (phrase: string) => (strength ? `${phrase} (${strength})` : phrase);

  switch (action) {
    case 'STOP':
      return join('Stopped at the opening');
    case 'IGNORE':
      return join('Read it and moved on');
    case 'REJECT':
      return join('Unconvinced');
    case 'LIKE':
      return join('Mildly positive');
    case 'COMMENT':
      return join('Wants to respond');
    case 'SHARE':
      return join('Would pass it on');
    case 'SAVE':
      return join('Keeping it for later');
    case 'FOLLOW':
      return join('Wants to see more');
    case 'CLICK':
      return join('Curious enough to look');
    case 'BUY':
      return join('Convinced enough to act');
    default:
      return 'Deciding';
  }
}

const STATE_LABELS: Record<JourneyStage, string> = {
  exposure: 'Watching',
  attention: 'Watching',
  interpretation: 'Interpreting',
  response: 'Reacting',
  decision: 'Deciding',
  action: 'Acted',
};

export function stateLabel(stage: JourneyStage): string {
  return STATE_LABELS[stage];
}

export type DeriveAgentProfilesInput = {
  events: readonly AgentEvent[];
  audience: Audience;
  segmentIndex: (segmentId: string) => number;
};

export function deriveAgentProfiles(input: DeriveAgentProfilesInput): AgentProfile[] {
  const { events, audience, segmentIndex } = input;

  const byAgent = new Map<string, AgentEvent[]>();
  for (const event of events) {
    const list = byAgent.get(event.agentId);
    if (list) list.push(event);
    else byAgent.set(event.agentId, [event]);
  }

  const segmentLabels = new Map(audience.segments.map((s) => [s.id, s.label]));

  return audience.agents.map((agent) => {
    const own = byAgent.get(agent.id) ?? [];

    // Terminal action: the last action-stage event that carried one.
    const actionEvents = own.filter((e) => e.stage === 'action' && e.action !== null);
    const terminal = actionEvents[actionEvents.length - 1];
    const action = terminal?.action ?? null;

    // Resolution: how decisively this agent's reaction settled. The decision
    // stage's intensity is the engagement probability the model produced, which
    // is the closest thing to "how sure was this agent" that the simulation has.
    const decisionIntensity = own
      .filter((e) => e.stage === 'decision')
      .reduce((max, e) => Math.max(max, e.intensity), 0);
    const actionIntensity = terminal?.intensity ?? 0;
    const confidence = clamp01(decisionIntensity * 0.7 + actionIntensity * 0.3);

    const deepest = own[own.length - 1];

    return {
      id: agent.id,
      label: agent.label,
      archetypeLabel: ARCHETYPE_LABELS[agent.archetypeId],
      segmentId: agent.segmentId,
      segmentLabel: segmentLabels.get(agent.segmentId) ?? agent.segmentId,
      segmentIndex: segmentIndex(agent.segmentId),
      motivation: [...agent.interests.slice(0, 4), ...agent.priorBeliefs.slice(0, 2)],
      disposition: dispositionOf(agent),
      state: deepest?.stage ?? 'exposure',
      reaction: reactionPhrase(action, actionIntensity),
      action,
      reasoning: terminal?.excerpt ?? null,
      reasonCodes: terminal?.reasons ?? [],
      confidence: Math.round(confidence * 100) / 100,
      intensity: actionIntensity,
      round: deepest?.round ?? 1,
    };
  });
}

/** Aggregate counts for the roster header. */
export function profileSummary(profiles: readonly AgentProfile[]): {
  total: number;
  engaged: number;
  ignored: number;
  rejected: number;
} {
  const ignored = profiles.filter((p) => p.action === 'IGNORE' || p.action === 'STOP').length;
  const rejected = profiles.filter((p) => p.action === 'REJECT').length;
  return {
    total: profiles.length,
    engaged: profiles.length - ignored - rejected,
    ignored,
    rejected,
  };
}
