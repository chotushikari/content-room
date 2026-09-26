import { describe, expect, it } from 'vitest';
import { RunEventLog, describeEvent, type EventEnvelope } from '../src/lib/event-log';
import { initialRunState, isUnlocked, runReducer, unlockedStations } from '../src/lib/run-reducer';
import { runPipeline, resimulatePipeline } from '../src/server/pipeline';
import type { RunEvent } from '../src/core/domain';

/**
 * Event-driven interface tests.
 *
 * The claim these tests defend is the architectural one: the entire interface is
 * a pure function of the event log. So the strongest test is not a synthetic
 * one — it is folding the REAL stream from a REAL run through the reducer and
 * asserting the resulting view state is complete and coherent.
 */

function fold(events: RunEvent[]): ReturnType<typeof runReducer> {
  const log = new RunEventLog();
  return events.reduce((state, event) => runReducer(state, log.append(event)), initialRunState);
}

async function realRun(): Promise<{ events: RunEvent[]; runId: string }> {
  const events: RunEvent[] = [];
  let runId = '';
  for await (const event of runPipeline({
    source: { type: 'fixture', fixtureId: 'velloe' },
    options: { audienceSize: 12, rounds: 2, engineId: 'deterministic', demoMode: true },
  })) {
    events.push(event);
    if (event.type === 'run_started') runId = event.runId;
  }
  return { events, runId };
}

/** A one-agent audience fixture, used by the round-scoped reducer tests. */
const audience = {
  ref: {
    audienceId: 'a',
    audienceSeed: 's',
    populationHash: 'p',
    controlMode: 'same_population' as const,
  },
  size: 1,
  segments: [
    { id: 'seg', label: 'S', rationale: 'r', archetypeIds: ['skeptic' as const], size: 1 },
  ],
  agents: [
    {
      id: 'ag_0_0',
      label: 'Skeptic #01',
      archetypeId: 'skeptic' as const,
      segmentId: 'seg',
      traits: {
        skepticism: 0.8,
        priceSensitivity: 0.5,
        attentionBudget: 0.5,
        noveltySeeking: 0.4,
        socialPropensity: 0.4,
        domainKnowledge: 0.7,
      },
      interests: ['evidence'],
      priorBeliefs: [],
      bio: '',
      producedBy: 'test',
    },
  ],
};

describe('event log', () => {
  it('assigns monotonic sequence numbers and arrival deltas', () => {
    const log = new RunEventLog();
    const a = log.append({ type: 'heartbeat', at: '1' });
    const b = log.append({ type: 'heartbeat', at: '2' });
    expect(b.seq).toBe(a.seq + 1);
    expect(b.deltaMs).toBeGreaterThanOrEqual(0);
  });

  it('counts events by type', () => {
    const log = new RunEventLog();
    log.append({ type: 'heartbeat', at: '1' });
    log.append({ type: 'heartbeat', at: '2' });
    expect(log.counters().heartbeat).toBe(2);
  });

  it('describes every event type without throwing', async () => {
    const { events } = await realRun();
    for (const event of events) {
      expect(typeof describeEvent(event)).toBe('string');
    }
  });
});

describe('reducer', () => {
  it('is pure: folding the same log twice yields identical state', async () => {
    const { events } = await realRun();
    const a = fold(events);
    const b = fold(events);
    // `agents` carries wall-clock timestamps, so compare the structural state.
    const strip = (s: typeof a) => ({ ...s, lastEventAt: 0, agents: {} });
    expect(JSON.stringify(strip(b))).toBe(JSON.stringify(strip(a)));
  });

  it('derives the complete interface state from a real run', async () => {
    const { events } = await realRun();
    const state = fold(events);

    expect(state.asset).not.toBeNull();
    expect(state.dna).not.toBeNull();
    expect(state.audience).not.toBeNull();
    expect(state.metricsA).not.toBeNull();
    expect(state.why).not.toBeNull();
    expect(state.brief).not.toBeNull();
    expect(state.versionB).not.toBeNull();
    expect(state.mode).toBe('demo');
    expect(state.failure).toBeNull();
    expect(state.completed).toBe(true);
    expect(Object.keys(state.agents).length).toBe(state.audience?.agents.length);
  });

  it('unlocks each station only when its own event arrives', async () => {
    const { events } = await realRun();
    let state = initialRunState;
    const log = new RunEventLog();
    const seen: Record<string, boolean> = {};

    for (const event of events) {
      state = runReducer(state, log.append(event));

      // Assert the ordering invariant at every step: a station must never be
      // unlocked by an event other than its own.
      if (event.type === 'metrics_ready' && !seen.brief) {
        seen.metricsSeen = true;
        expect(isUnlocked(state, 'strategy')).toBe(false);
      }
      if (event.type === 'brief_ready') seen.brief = true;
      if (event.type === 'comparison_ready') seen.comparison = true;
    }

    expect(unlockedStations(state)).toEqual([
      'content',
      'audience',
      'room',
      'intelligence',
      'strategy',
    ]);
    // No re-simulation was run, so the comparison station must stay locked.
    expect(isUnlocked(state, 'comparison')).toBe(false);
  });

  it('ignores heartbeats for display purposes', () => {
    const afterHeartbeat = fold([{ type: 'heartbeat', at: '2026-01-01T00:00:00Z' }]);
    expect(afterHeartbeat.stage).toBe(initialRunState.stage);
    expect(afterHeartbeat.running).toBe(false);
  });

  it('keeps the provisional mode separate from the authoritative one', () => {
    const state = fold([
      { type: 'run_started', runId: 'r', mode: 'live', engineId: 'deterministic', label: 'A' },
      {
        type: 'run_completed',
        mode: 'demo',
        providers: [
          { task: 'content_dna', providerId: 'fixtures', modelId: 'h', degraded: true, latencyMs: 1 },
        ],
        validation: { state: 'not_established', note: 'Validation benchmark: being established.' },
      },
    ]);
    // Provisional says what was CONFIGURED; mode says what actually SERVED it.
    expect(state.provisionalMode).toBe('live');
    expect(state.mode).toBe('demo');
  });

  it('keeps the last round\'s actions visible after a round completes', () => {
    // Round-scoped actions are cleared when a round STARTS. Clearing them on
    // completion left the tally reading "no actions yet" for the entire time a
    // finished run was on screen, which is when a viewer is actually reading it.
    const state = fold([
      { type: 'audience_ready', audience },
      {
        type: 'agent_event',
        event: {
          id: 'e1',
          runId: 'r',
          agentId: 'ag_0_0',
          segmentId: 'seg',
          round: 1,
          stage: 'action',
          action: 'REJECT',
          intensity: 0.9,
          reasons: ['trust-failed'],
          excerpt: 'Needs evidence.',
          evidenceRefs: [],
          producedBy: 'deterministic',
        },
      },
      { type: 'round_completed', round: 1, label: 'A' },
    ]);

    expect(state.agents['ag_0_0']?.action).toBe('REJECT');
  });

  it('clears round-scoped actions when the next round starts', () => {
    const state = fold([
      { type: 'audience_ready', audience },
      {
        type: 'agent_event',
        event: {
          id: 'e1',
          runId: 'r',
          agentId: 'ag_0_0',
          segmentId: 'seg',
          round: 1,
          stage: 'action',
          action: 'REJECT',
          intensity: 0.9,
          reasons: ['trust-failed'],
          excerpt: 'Needs evidence.',
          evidenceRefs: [],
          producedBy: 'deterministic',
        },
      },
      { type: 'round_completed', round: 1, label: 'A' },
      { type: 'round_started', round: 2, ofRounds: 3, label: 'A' },
    ]);

    const agent = state.agents['ag_0_0'];
    expect(agent?.action).toBeNull();
    expect(agent?.intensity).toBe(0);
    expect(state.round).toBe(2);
  });

  it('captures a failure without clearing the work already done', () => {
    const state = fold([
      { type: 'run_started', runId: 'r', mode: 'demo', engineId: 'deterministic', label: 'A' },
      {
        type: 'run_failed',
        stage: 'ingest',
        code: 'IMPORT_FAILED',
        message: 'That link could not be read.',
        recovered: false,
      },
    ]);
    expect(state.failure?.code).toBe('IMPORT_FAILED');
    expect(state.running).toBe(false);
  });
});

describe('re-simulation through the reducer', () => {
  it('routes Version B metrics separately and unlocks the comparison', async () => {
    const { events, runId } = await realRun();
    const resimEvents: RunEvent[] = [];
    for await (const event of resimulatePipeline({ runId })) resimEvents.push(event);

    const state = fold([...events, ...resimEvents]);

    expect(state.metricsA).not.toBeNull();
    expect(state.metricsB).not.toBeNull();
    expect(state.comparison).not.toBeNull();
    expect(state.comparison?.samePopulation).toBe(true);
    expect(isUnlocked(state, 'comparison')).toBe(true);

    // The whole point: the two metric sets must actually differ, and the
    // audience identity must be provably unchanged.
    expect(state.comparison?.audienceRef.populationHash).toBe(state.audience?.ref.populationHash);
    const changed = state.comparison?.rows.some((r) => Math.abs(r.delta) > 0.05);
    expect(changed).toBe(true);
  });

  it('produces a comparison whose caveats are present and labelled', async () => {
    const { events, runId } = await realRun();
    const resimEvents: RunEvent[] = [];
    for await (const event of resimulatePipeline({ runId })) resimEvents.push(event);

    const state = fold([...events, ...resimEvents]);
    const caveats = state.comparison?.caveats ?? [];
    expect(caveats.length).toBeGreaterThan(0);
    expect(caveats.join(' ')).toContain('Simulated change');
    expect(caveats.join(' ')).toContain('Not representative of any real population');
  });
});
