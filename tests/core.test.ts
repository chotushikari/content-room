import { describe, expect, it } from 'vitest';
import { aggregate } from '../src/core/analytics/aggregate';
import { compare, caveatsFor } from '../src/core/comparison/compare';
import { buildAudience } from '../src/core/audience/factory';
import { assertSamePopulation, AudienceMismatchError } from '../src/core/domain';
import { computePopulationHash, makeAudienceRef } from '../src/core/ids';
import { deterministicEngine } from '../src/engines/deterministic/engine';
import { heuristicDNA, heuristicSegments } from '../src/providers/deterministic/analysis';
import { velloeDemoAsset, weakVariants } from '../src/fixtures/velloe/content';
import type { AgentEvent, Audience } from '../src/core/domain';

const dna = heuristicDNA(velloeDemoAsset);

function makeAudience(seed: string, size = 24, asset = velloeDemoAsset): Audience {
  const d = heuristicDNA(asset);
  return buildAudience({
    dna: d,
    segments: heuristicSegments(asset, d, size),
    size,
    audienceSeed: seed,
    producedBy: 'test',
  });
}

async function collect(audience: Audience, asset = velloeDemoAsset, rounds = 2): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of deterministicEngine.run({
    runId: 'run_test',
    asset,
    dna: heuristicDNA(asset),
    audience,
    rounds,
    seed: 42,
  })) {
    events.push(e);
  }
  return events;
}

describe('audience identity', () => {
  it('produces an identical population hash for the same seed', () => {
    const a = makeAudience('seed-alpha');
    const b = makeAudience('seed-alpha');
    expect(a.ref.populationHash).toBe(b.ref.populationHash);
    expect(a.ref.audienceId).toBe(b.ref.audienceId);
  });

  it('produces different populations for different seeds', () => {
    const a = makeAudience('seed-alpha');
    const b = makeAudience('seed-beta');
    expect(a.ref.populationHash).not.toBe(b.ref.populationHash);
  });

  it('keeps the population identical when only the CONTENT changes', () => {
    // The whole basis of the controlled comparison: same seed, different content,
    // same audience.
    const a = makeAudience('seed-alpha', 24, velloeDemoAsset);
    const b = makeAudience('seed-alpha', 24, weakVariants.vagueAnnouncement());
    expect(a.ref.populationHash).toBe(b.ref.populationHash);
  });

  it('bytes the hash on identity-bearing fields only, not on bio', () => {
    const audience = makeAudience('seed-alpha');
    const before = computePopulationHash(audience.agents);
    const withBios = audience.agents.map((x, i) => ({ ...x, bio: `bio ${i}` }));
    expect(computePopulationHash(withBios)).toBe(before);
  });

  it('throws AudienceMismatchError when populations differ', () => {
    const a = makeAudience('seed-alpha').ref;
    const b = makeAudience('seed-beta').ref;
    expect(() => assertSamePopulation(a, b)).toThrow(AudienceMismatchError);
  });

  it('asserting a population against itself re-derived from the same seed passes', () => {
    const audience = makeAudience('seed-alpha');
    const recheck = makeAudienceRef(audience.ref.audienceSeed, audience.segments, audience.agents);
    expect(() => assertSamePopulation(audience.ref, recheck)).not.toThrow();
  });

  it('produces a diverse population rather than clones', () => {
    const audience = makeAudience('seed-alpha', 24);
    const skepticisms = audience.agents.map((a) => a.traits.skepticism);
    const spread = Math.max(...skepticisms) - Math.min(...skepticisms);
    // A population that shares one trait value would produce unanimous results
    // and make every metric meaningless.
    expect(spread).toBeGreaterThan(0.15);
    expect(new Set(audience.agents.map((a) => a.archetypeId)).size).toBeGreaterThan(2);
  });
});

describe('deterministic engine', () => {
  it('is byte-identical across runs on the same input', async () => {
    const audience = makeAudience('seed-alpha');
    const first = await collect(audience);
    const second = await collect(audience);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('reports itself as reproducible and model-free', () => {
    const caps = deterministicEngine.capabilities();
    expect(caps.reproducible).toBe(true);
    expect(caps.needsModel).toBe(false);
    expect(caps.streaming).toBe(true);
  });

  it('covers all six journey stages', async () => {
    const events = await collect(makeAudience('seed-alpha'));
    const stages = new Set(events.map((e) => e.stage));
    for (const stage of ['exposure', 'attention', 'interpretation', 'response', 'decision', 'action']) {
      expect(stages.has(stage as never)).toBe(true);
    }
  });

  it('records early exits as actions rather than dropping the agent', async () => {
    const events = await collect(makeAudience('seed-alpha'));
    const agents = new Set(events.filter((e) => e.stage === 'exposure').map((e) => e.agentId));
    const withAction = new Set(events.filter((e) => e.stage === 'action').map((e) => e.agentId));
    expect(withAction.size).toBe(agents.size);
  });

  it('produces both disengagement and rejection rather than uniform approval', async () => {
    const events = await collect(makeAudience('seed-alpha'));
    const actions = new Set(events.filter((e) => e.action).map((e) => e.action));
    expect(actions.has('IGNORE') || actions.has('STOP')).toBe(true);
    // A room that unanimously approves indicates a broken model, not good content.
    expect(actions.size).toBeGreaterThan(2);
  });

  it('keeps intensity within range', async () => {
    const events = await collect(makeAudience('seed-alpha'));
    for (const e of events) {
      expect(e.intensity).toBeGreaterThanOrEqual(0);
      expect(e.intensity).toBeLessThanOrEqual(1);
    }
  });

  it('attributes every event to the engine that produced it', async () => {
    const events = await collect(makeAudience('seed-alpha'));
    expect(events.every((e) => e.producedBy === 'deterministic')).toBe(true);
  });
});

describe('model sensitivity', () => {
  it('scores deliberately strong content above deliberately weak content', async () => {
    const weakAsset = weakVariants.vagueAnnouncement();
    const strongAsset = weakVariants.strongControl();

    const weakAudience = makeAudience('sensitivity', 24, weakAsset);
    const strongAudience = makeAudience('sensitivity', 24, strongAsset);

    const weakEvents = await collect(weakAudience, weakAsset, 3);
    const strongEvents = await collect(strongAudience, strongAsset, 3);

    const weakMetrics = aggregate({ runId: 'w', events: weakEvents, audience: weakAudience, rounds: 3 });
    const strongMetrics = aggregate({ runId: 's', events: strongEvents, audience: strongAudience, rounds: 3 });

    const value = (b: typeof weakMetrics, id: string) => b.overall.find((m) => m.id === id)?.value ?? 0;

    expect(value(strongMetrics, 'positiveResponse')).toBeGreaterThan(value(weakMetrics, 'positiveResponse'));
    expect(value(strongMetrics, 'ignoreRate')).toBeLessThan(value(weakMetrics, 'ignoreRate'));
  });
});

describe('analytics', () => {
  it('is pure: the same events produce a byte-identical bundle', async () => {
    const audience = makeAudience('seed-alpha');
    const events = await collect(audience);
    const a = aggregate({ runId: 'r', events, audience, rounds: 2 });
    const b = aggregate({ runId: 'r', events, audience, rounds: 2 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('is total over degenerate inputs', () => {
    const audience = makeAudience('seed-alpha');
    const bundle = aggregate({ runId: 'r', events: [], audience, rounds: 1 });
    expect(bundle.overall).toHaveLength(12);
    for (const m of bundle.overall) {
      expect(m.n).toBeGreaterThan(0);
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(100);
    }
  });

  it('reports every metric with a sample size, a derivation and the simulated literal', async () => {
    const audience = makeAudience('seed-alpha');
    const events = await collect(audience);
    const bundle = aggregate({ runId: 'r', events, audience, rounds: 2 });
    for (const m of bundle.overall) {
      expect(m.n).toBeGreaterThan(0);
      expect(m.method.length).toBeGreaterThan(0);
      expect(m.kind).toBe('simulated_estimate');
    }
  });

  it('recomputes shareIntent independently and agrees', async () => {
    const audience = makeAudience('seed-alpha');
    const events = await collect(audience);
    const bundle = aggregate({ runId: 'r', events, audience, rounds: 2 });

    // Independent recomputation from raw events, not a call back into the
    // implementation. A test that reuses the implementation proves nothing.
    const sharers = new Set(
      events.filter((e) => e.stage === 'action' && e.action === 'SHARE').map((e) => e.agentId),
    );
    const expected = Math.round((sharers.size / audience.agents.length) * 100 * 10) / 10;
    const actual = bundle.overall.find((m) => m.id === 'shareIntent')?.value;
    expect(actual).toBe(expected);
  });

  it('reports disagreement per metric with a per-segment breakdown', async () => {
    const audience = makeAudience('seed-alpha');
    const events = await collect(audience, velloeDemoAsset, 3);
    const bundle = aggregate({ runId: 'r', events, audience, rounds: 3 });
    for (const d of bundle.disagreements) {
      expect(d.bySegment.length).toBeGreaterThanOrEqual(2);
      const values = d.bySegment.map((s) => s.value);
      expect(d.spread).toBeCloseTo(Math.max(...values) - Math.min(...values), 1);
    }
  });
});

describe('comparison', () => {
  it('always attaches at least one caveat', async () => {
    const audience = makeAudience('seed-alpha');
    const events = await collect(audience);
    const metrics = aggregate({ runId: 'a', events, audience, rounds: 2 });
    const c = compare({
      runA: 'a',
      runB: 'b',
      metricsA: metrics,
      metricsB: metrics,
      audienceRefA: audience.ref,
      audienceRefB: audience.ref,
      reproducibility: 'deterministic',
    });
    expect(c.caveats.length).toBeGreaterThan(0);
    expect(c.samePopulation).toBe(true);
  });

  it('warns loudly when the audience was regenerated', () => {
    const a = makeAudience('seed-alpha').ref;
    const b = makeAudience('seed-beta').ref;
    const caveats = caveatsFor('deterministic', a, b);
    expect(caveats.some((c) => c.startsWith('WARNING'))).toBe(true);
  });

  it('states honestly when reactions were resampled', () => {
    const ref = makeAudience('seed-alpha').ref;
    const caveats = caveatsFor('sampled', ref, ref);
    expect(caveats.some((c) => c.includes('resampled'))).toBe(true);
  });
});
