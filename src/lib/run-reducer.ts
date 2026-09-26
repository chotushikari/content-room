import {
  NOT_ESTABLISHED,
  type Audience,
  type Comparison,
  type ContentAsset,
  type ContentDNA,
  type CreativeBrief,
  type JourneyStage,
  type MetricsBundle,
  type ProviderUsage,
  type ReactionAction,
  type RunMode,
  type ValidationStatus,
  type WhyReport,
} from '../core/domain';
import type { EventEnvelope } from './event-log';

/**
 * The run reducer.
 *
 * PURE: (state, event) => state. Every panel in the interface is a projection of
 * this one object, and this object is a function of the event log alone. That is
 * what makes the UI event-driven rather than a set of components mutating their
 * own state in parallel — and it means the whole interface is testable by
 * replaying a recorded event array.
 */

export type AgentView = {
  agentId: string;
  segmentId: string;
  label: string;
  archetypeId: string;
  stage: JourneyStage;
  action: ReactionAction | null;
  intensity: number;
  /** Sequence number of the event that produced this state. */
  seq: number;
  updatedAt: number;
};

export type RunFailure = {
  stage: string;
  code: string;
  message: string;
  recovered: boolean;
};

export type RunViewState = {
  runId: string | null;
  /** Which pass the room is currently showing. */
  pass: 'A' | 'B';
  stage: string;
  stageLabel: string;

  asset: ContentAsset | null;
  ingestNote: string | null;
  dna: ContentDNA | null;
  audience: Audience | null;

  agents: Record<string, AgentView>;
  round: number;
  ofRounds: number;

  metricsA: MetricsBundle | null;
  metricsB: MetricsBundle | null;
  why: WhyReport | null;
  brief: CreativeBrief | null;
  versionB: ContentAsset | null;
  /** Version B's own DNA, so the "after" verdict describes the rewrite. */
  versionBDna: ContentDNA | null;
  comparison: Comparison | null;

  /** Provisional, from run_started: what is CONFIGURED. */
  provisionalMode: RunMode | null;
  /** Authoritative, from run_completed: what actually SERVED the run. */
  mode: RunMode | null;
  providers: ProviderUsage[];
  validation: ValidationStatus;

  failure: RunFailure | null;
  running: boolean;
  completed: boolean;
  resimulating: boolean;
  lastEventAt: number;
};

export const initialRunState: RunViewState = {
  runId: null,
  pass: 'A',
  stage: 'idle',
  stageLabel: 'Idle',
  asset: null,
  ingestNote: null,
  dna: null,
  audience: null,
  agents: {},
  round: 0,
  ofRounds: 0,
  metricsA: null,
  metricsB: null,
  why: null,
  brief: null,
  versionB: null,
  versionBDna: null,
  comparison: null,
  provisionalMode: null,
  mode: null,
  providers: [],
  validation: NOT_ESTABLISHED,
  failure: null,
  running: false,
  completed: false,
  resimulating: false,
  lastEventAt: 0,
};

export function runReducer(state: RunViewState, envelope: EventEnvelope): RunViewState {
  const { event } = envelope;
  const base: RunViewState = { ...state, lastEventAt: envelope.at };

  switch (event.type) {
    case 'heartbeat':
      // A heartbeat proves liveness but must not change any display state.
      return base;

    case 'run_started':
      return {
        ...base,
        runId: event.runId,
        pass: event.label,
        provisionalMode: event.mode,
        running: true,
        completed: false,
        failure: null,
        stage: 'starting',
        stageLabel: 'Starting',
        // A new run resets the agent field but preserves nothing stale.
        agents: event.label === 'A' ? {} : base.agents,
        resimulating: event.label === 'B',
      };

    case 'stage_changed':
      return { ...base, stage: event.stage, stageLabel: event.label };

    case 'ingest_resolved':
      return { ...base, asset: event.asset, ingestNote: event.note };

    case 'dna_ready':
      return {
        ...base,
        dna: event.dna,
        // In a re-simulation the DNA describes the ORIGINAL content, so keep A's.
        asset: event.label === 'A' ? base.asset : base.asset,
      };

    case 'audience_ready': {
      const agents: Record<string, AgentView> = {};
      for (const a of event.audience.agents) {
        agents[a.id] = {
          agentId: a.id,
          segmentId: a.segmentId,
          label: a.label,
          archetypeId: a.archetypeId,
          stage: 'exposure',
          action: null,
          intensity: 0,
          seq: envelope.seq,
          updatedAt: envelope.at,
        };
      }
      return { ...base, audience: event.audience, agents, pass: 'A' };
    }

    case 'round_started': {
      // Round-scoped actions are cleared when a round STARTS, not when it ends.
      // Clearing on completion left the action tally reading "no actions yet"
      // for the whole time the completed run was on screen, which is exactly
      // when a viewer is looking at it.
      const cleared: Record<string, AgentView> = {};
      for (const [id, view] of Object.entries(base.agents)) {
        cleared[id] = { ...view, action: null, intensity: 0 };
      }
      return { ...base, agents: cleared, round: event.round, ofRounds: event.ofRounds, pass: event.label };
    }

    case 'agent_event':
    case 'resim_event': {
      const e = event.event;
      const prev = base.agents[e.agentId];
      if (!prev) return base;
      return {
        ...base,
        agents: {
          ...base.agents,
          [e.agentId]: {
            ...prev,
            stage: e.stage,
            // Action is sticky for the round: an agent that acted keeps its
            // badge visible while later agents are still deciding.
            action: e.action ?? prev.action,
            intensity: e.intensity,
            seq: envelope.seq,
            updatedAt: envelope.at,
          },
        },
      };
    }

    case 'round_completed':
      return { ...base, round: event.round };

    case 'metrics_ready':
      return event.label === 'A'
        ? { ...base, metricsA: event.metrics }
        : { ...base, metricsB: event.metrics };

    case 'why_ready':
      return { ...base, why: event.why };

    case 'brief_ready':
      return { ...base, brief: event.brief };

    case 'versionb_ready':
      return { ...base, versionB: event.asset, versionBDna: event.dna };

    case 'comparison_ready':
      return { ...base, comparison: event.comparison, resimulating: false };

    case 'run_completed':
      return {
        ...base,
        mode: event.mode,
        providers: event.providers,
        validation: event.validation,
        running: false,
        resimulating: false,
        // Only pass A completes the full journey; pass B ends at the comparison.
        completed: base.pass === 'A' ? true : base.completed,
      };

    case 'run_failed':
      return {
        ...base,
        failure: {
          stage: event.stage,
          code: event.code,
          message: event.message,
          recovered: event.recovered,
        },
        running: false,
        resimulating: false,
      };

    default:
      return base;
  }
}

export function reduceAll(envelopes: readonly EventEnvelope[]): RunViewState {
  return envelopes.reduce(runReducer, initialRunState);
}

// ---------------------------------------------------------------------------
// Selectors. Panels read through these rather than reaching into the shape.
// ---------------------------------------------------------------------------

export function agentList(state: RunViewState): AgentView[] {
  return Object.values(state.agents);
}

export function stageCounts(state: RunViewState): Record<JourneyStage, number> {
  const counts: Record<JourneyStage, number> = {
    exposure: 0,
    attention: 0,
    interpretation: 0,
    response: 0,
    decision: 0,
    action: 0,
  };
  for (const a of Object.values(state.agents)) counts[a.stage] += 1;
  return counts;
}

export function actionCounts(state: RunViewState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of Object.values(state.agents)) {
    if (a.action) counts[a.action] = (counts[a.action] ?? 0) + 1;
  }
  return counts;
}

export function activeMetrics(state: RunViewState): MetricsBundle | null {
  return state.pass === 'B' ? state.metricsB : state.metricsA;
}

/** Which station the interface should reveal, derived purely from the log. */
export type Station =
  | 'content'
  | 'audience'
  | 'room'
  | 'intelligence'
  | 'strategy'
  | 'comparison';

export function unlockedStations(state: RunViewState): Station[] {
  const out: Station[] = [];
  if (state.asset) out.push('content');
  if (state.audience) out.push('audience');
  if (state.round > 0 || state.pass === 'B') out.push('room');
  if (state.metricsA) out.push('intelligence');
  if (state.brief) out.push('strategy');
  if (state.comparison) out.push('comparison');
  return out;
}

export function isUnlocked(state: RunViewState, station: Station): boolean {
  return unlockedStations(state).includes(station);
}
