import {
  METRIC_LABELS,
  METRIC_IDS,
  type AgentEvent,
  type Audience,
  type Disagreement,
  type Metric,
  type MetricId,
  type MetricsBundle,
  type PersonaAgent,
  type ReactionAction,
  type SegmentBreakdown,
  ENGAGEMENT_ACTIONS,
  REACTION_ACTIONS,
} from '../domain';

/**
 * Deterministic aggregation. PURE: no IO, no model, no clock, no randomness.
 *
 * Same events in => byte-identical bundle out, always. This is what makes the
 * numbers auditable, and it is why no metric in this product originates from a
 * language model.
 *
 * Each metric declares its formula and its human-readable `method` in ONE
 * place, generated from the same definition object, so the stated method cannot
 * drift away from the actual computation.
 */

/** Per-agent outcome, derived once and reused by every metric. */
type AgentOutcome = {
  agentId: string;
  segmentId: string;
  reachedAttention: boolean;
  reachedInterpretation: boolean;
  reachedDecision: boolean;
  interpretationIntensity: number;
  responseIntensity: number;
  action: ReactionAction | null;
};

export type AggregateInput = {
  runId: string;
  events: readonly AgentEvent[];
  audience: Pick<Audience, 'agents' | 'segments'>;
  rounds: number;
};

function deriveOutcomes(input: AggregateInput): AgentOutcome[] {
  const byAgent = new Map<string, AgentEvent[]>();
  for (const e of input.events) {
    const list = byAgent.get(e.agentId);
    if (list) list.push(e);
    else byAgent.set(e.agentId, [e]);
  }

  return input.audience.agents.map((agent: PersonaAgent) => {
    const evs = byAgent.get(agent.id) ?? [];
    const stageMax = (stage: AgentEvent['stage']) =>
      evs
        .filter((e) => e.stage === stage)
        .reduce((m, e) => Math.max(m, e.intensity), 0);

    const reached = (stage: AgentEvent['stage']) => evs.some((e) => e.stage === stage);

    // Terminal action: the last action-stage event, if the agent ever acted.
    const actionEvents = evs.filter((e) => e.stage === 'action' && e.action !== null);
    const lastAction = actionEvents.length > 0 ? actionEvents[actionEvents.length - 1] : undefined;

    return {
      agentId: agent.id,
      segmentId: agent.segmentId,
      reachedAttention: reached('attention'),
      reachedInterpretation: reached('interpretation'),
      reachedDecision: reached('decision'),
      interpretationIntensity: stageMax('interpretation'),
      responseIntensity: stageMax('response'),
      action: lastAction?.action ?? null,
    };
  });
}

type MetricContext = {
  outcomes: readonly AgentOutcome[];
  n: number;
};

type MetricDef = {
  id: MetricId;
  /** The formula. Returns 0..100. */
  compute: (ctx: MetricContext) => number;
  /** Human-readable derivation, shown to the user on demand. */
  method: string;
};

const pct = (num: number, den: number) => (den === 0 ? 0 : (num / den) * 100);
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * The metric registry. Adding a metric means adding it here AND to
 * MetricIdSchema in docs/api-contracts.md first.
 *
 * Note what is absent by design: no predicted reach, no expected conversions,
 * no virality score, no engagement rate as a forecast. The set is response and
 * intent only.
 */
export const METRIC_DEFS: readonly MetricDef[] = [
  {
    id: 'attention',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.reachedInterpretation).length, n),
    method: 'agents that reached the interpretation stage ÷ n',
  },
  {
    id: 'ignoreRate',
    compute: ({ outcomes, n }) =>
      pct(outcomes.filter((o) => o.action === 'IGNORE' || o.action === 'STOP').length, n),
    method: 'agents whose terminal action was IGNORE or STOP ÷ n',
  },
  {
    id: 'clarity',
    compute: ({ outcomes }) => mean(outcomes.map((o) => o.interpretationIntensity)) * 100,
    method: 'mean interpretation-stage comprehension intensity across agents',
  },
  {
    id: 'trust',
    compute: ({ outcomes }) => mean(outcomes.map((o) => o.responseIntensity)) * 100,
    method: 'mean response-stage positive-feeling intensity across agents',
  },
  {
    id: 'positiveResponse',
    compute: ({ outcomes, n }) =>
      pct(outcomes.filter((o) => o.action !== null && ENGAGEMENT_ACTIONS.includes(o.action)).length, n),
    method: 'agents whose terminal action was an engagement action ÷ n',
  },
  {
    id: 'negativeResponse',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'REJECT').length, n),
    method: 'agents whose terminal action was REJECT ÷ n',
  },
  {
    id: 'shareIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'SHARE').length, n),
    method: 'agents with action ∈ {SHARE} ÷ n',
  },
  {
    id: 'saveIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'SAVE').length, n),
    method: 'agents with action ∈ {SAVE} ÷ n',
  },
  {
    id: 'commentIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'COMMENT').length, n),
    method: 'agents with action ∈ {COMMENT} ÷ n',
  },
  {
    id: 'followIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'FOLLOW').length, n),
    method: 'agents with action ∈ {FOLLOW} ÷ n',
  },
  {
    id: 'clickIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'CLICK').length, n),
    method: 'agents with action ∈ {CLICK} ÷ n',
  },
  {
    id: 'purchaseIntent',
    compute: ({ outcomes, n }) => pct(outcomes.filter((o) => o.action === 'BUY').length, n),
    method: 'agents with action ∈ {BUY} ÷ n',
  },
];

function buildMetric(def: MetricDef, ctx: MetricContext): Metric {
  const raw = def.compute(ctx);
  const value = Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
  return {
    id: def.id,
    label: METRIC_LABELS[def.id],
    value,
    scale: 100,
    // n is REQUIRED and always positive: a metric without a sample size is
    // not representable.
    n: Math.max(1, ctx.n),
    method: def.method,
    kind: 'simulated_estimate',
  };
}

function computeMetrics(outcomes: readonly AgentOutcome[]): Metric[] {
  const ctx: MetricContext = { outcomes, n: outcomes.length };
  return METRIC_DEFS.map((def) => buildMetric(def, ctx));
}

export function aggregate(input: AggregateInput): MetricsBundle {
  const outcomes = deriveOutcomes(input);
  const overall = computeMetrics(outcomes);

  const bySegment: SegmentBreakdown[] = input.audience.segments.map((segment) => {
    const segOutcomes = outcomes.filter((o) => o.segmentId === segment.id);
    return {
      segmentId: segment.id,
      segmentLabel: segment.label,
      metrics: computeMetrics(segOutcomes),
    };
  });

  // Disagreement is reported PER METRIC with its per-segment breakdown, never
  // collapsed into a single polarisation score — that would hide which segments
  // disagree and about what, which is the actually useful information.
  const disagreements: Disagreement[] = [];
  for (const metricId of METRIC_IDS) {
    const parts = bySegment
      .map((sb) => {
        const m = sb.metrics.find((x) => x.id === metricId);
        if (!m) return null;
        return {
          segmentId: sb.segmentId,
          segmentLabel: sb.segmentLabel,
          value: m.value,
          n: m.n,
          count: outcomes.filter((o) => o.segmentId === sb.segmentId).length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.count > 0);

    if (parts.length < 2) continue;

    const values = parts.map((p) => p.value);
    const spread = Math.round((Math.max(...values) - Math.min(...values)) * 10) / 10;
    disagreements.push({
      metricId,
      spread,
      bySegment: parts.map(({ segmentId, segmentLabel, value, n }) => ({
        segmentId,
        segmentLabel,
        value,
        n,
      })),
    });
  }
  disagreements.sort((a, b) => b.spread - a.spread);

  const actionCounts = Object.fromEntries(REACTION_ACTIONS.map((a) => [a, 0])) as Record<
    ReactionAction,
    number
  >;
  for (const o of outcomes) {
    if (o.action) actionCounts[o.action] += 1;
  }

  return {
    runId: input.runId,
    overall,
    bySegment,
    disagreements,
    bookkeeping: {
      events: input.events.length,
      agents: outcomes.length,
      rounds: input.rounds,
      actionCounts,
    },
  };
}
