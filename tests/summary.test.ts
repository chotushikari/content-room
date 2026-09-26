import { describe, expect, it } from 'vitest';
import {
  bandFor,
  deriveVerdict,
  performanceScore,
  viralPotential,
} from '../src/core/summary';
import { aggregate } from '../src/core/analytics/aggregate';
import { buildAudience } from '../src/core/audience/factory';
import { deterministicEngine } from '../src/engines/deterministic/engine';
import { heuristicDNA, heuristicSegments } from '../src/providers/deterministic/analysis';
import { velloeDemoAsset, weakVariants } from '../src/fixtures/velloe/content';
import type { AgentEvent, Audience, MetricsBundle } from '../src/core/domain';

/**
 * The verdict is the product's whole output for a user, so its properties are
 * tested as carefully as the simulation's: it must be deterministic, it must
 * rank content the way the underlying model does, and it must never produce a
 * score outside its stated range.
 */

async function run(asset = velloeDemoAsset, size = 24, rounds = 3) {
  const dna = heuristicDNA(asset);
  const audience: Audience = buildAudience({
    dna,
    segments: heuristicSegments(asset, dna, size),
    size,
    audienceSeed: 'verdict-seed',
    producedBy: 'test',
  });
  const events: AgentEvent[] = [];
  for await (const e of deterministicEngine.run({
    runId: 'run_verdict',
    asset,
    dna,
    audience,
    rounds,
    seed: 7,
  })) {
    events.push(e);
  }
  const metrics = aggregate({ runId: 'run_verdict', events, audience, rounds });
  return { dna, audience, metrics };
}

describe('band thresholds', () => {
  it('is monotonic and covers the whole range', () => {
    expect(bandFor(0)).toBe('Weak');
    expect(bandFor(34.9)).toBe('Weak');
    expect(bandFor(35)).toBe('Mixed');
    expect(bandFor(54.9)).toBe('Mixed');
    expect(bandFor(55)).toBe('Solid');
    expect(bandFor(71.9)).toBe('Solid');
    expect(bandFor(72)).toBe('Strong');
    expect(bandFor(100)).toBe('Strong');
  });
});

describe('performance score', () => {
  it('stays within 0-100 for the real fixtures', async () => {
    for (const asset of [velloeDemoAsset, weakVariants.vagueAnnouncement(), weakVariants.strongControl()]) {
      const { metrics } = await run(asset);
      const score = performanceScore(metrics);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('ranks deliberately strong content above deliberately weak content', async () => {
    const weak = await run(weakVariants.vagueAnnouncement());
    const strong = await run(weakVariants.strongControl());
    expect(performanceScore(strong.metrics)).toBeGreaterThan(performanceScore(weak.metrics));
  });

  it('improves when the audience responds better', () => {
    const base = (over: Partial<Record<string, number>> = {}): MetricsBundle =>
      ({
        runId: 'r',
        overall: [
          'attention', 'ignoreRate', 'clarity', 'trust', 'positiveResponse', 'negativeResponse',
          'shareIntent', 'saveIntent', 'commentIntent', 'followIntent', 'clickIntent', 'purchaseIntent',
        ].map((id) => ({
          id: id as MetricsBundle['overall'][number]['id'],
          label: id,
          value: over[id] ?? 40,
          scale: 100 as const,
          n: 24,
          method: 'test',
          kind: 'simulated_estimate' as const,
        })),
        bySegment: [],
        disagreements: [],
        bookkeeping: { events: 0, agents: 24, rounds: 1, actionCounts: {} as never },
      });

    const lower = performanceScore(base({ positiveResponse: 20, trust: 30 }));
    const higher = performanceScore(base({ positiveResponse: 70, trust: 80 }));
    expect(higher).toBeGreaterThan(lower);
  });

  it('penalises a high ignore rate', () => {
    const make = (ignore: number): MetricsBundle => ({
      runId: 'r',
      overall: [
        { id: 'attention' as const, label: 'Attention', value: 80, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
        { id: 'ignoreRate' as const, label: 'Ignore', value: ignore, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
      ],
      bySegment: [],
      disagreements: [],
      bookkeeping: { events: 0, agents: 24, rounds: 1, actionCounts: {} as never },
    });
    expect(performanceScore(make(10))).toBeGreaterThan(performanceScore(make(80)));
  });
});

describe('viral potential', () => {
  it('bands low, moderate and high', () => {
    const mk = (share: number, save: number, comment: number, positive: number, ignore: number): MetricsBundle => ({
      runId: 'r',
      overall: [
        { id: 'shareIntent' as const, label: 'Share', value: share, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
        { id: 'saveIntent' as const, label: 'Save', value: save, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
        { id: 'commentIntent' as const, label: 'Comment', value: comment, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
        { id: 'positiveResponse' as const, label: 'Positive', value: positive, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
        { id: 'ignoreRate' as const, label: 'Ignore', value: ignore, scale: 100 as const, n: 24, method: 't', kind: 'simulated_estimate' as const },
      ],
      bySegment: [],
      disagreements: [],
      bookkeeping: { events: 0, agents: 24, rounds: 1, actionCounts: {} as never },
    });

    expect(viralPotential(mk(0, 0, 0, 10, 70)).band).toBe('Low');
    expect(viralPotential(mk(12, 8, 8, 60, 30)).band).toBe('Moderate');
    expect(viralPotential(mk(30, 25, 20, 80, 10)).band).toBe('High');
  });

  it('always explains itself without overclaiming', () => {
    const empty: MetricsBundle = {
      runId: 'r',
      overall: [],
      bySegment: [],
      disagreements: [],
      bookkeeping: { events: 0, agents: 24, rounds: 1, actionCounts: {} as never },
    };
    const v = viralPotential(empty);
    expect(v.note.length).toBeGreaterThan(0);
    expect(v.note.toLowerCase()).not.toContain('guarantee');
    expect(v.note.toLowerCase()).not.toContain('will go viral');
  });
});

describe('the verdict', () => {
  it('is deterministic: the same run yields the same verdict', async () => {
    const a = await run();
    const b = await run();
    const verdictA = deriveVerdict({ metrics: a.metrics, dna: a.dna, why: null, brief: null, audience: a.audience });
    const verdictB = deriveVerdict({ metrics: b.metrics, dna: b.dna, why: null, brief: null, audience: b.audience });
    expect(JSON.stringify(verdictB)).toBe(JSON.stringify(verdictA));
  });

  it('answers every question a user has', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });

    expect(v.headline.length).toBeGreaterThan(0);
    expect(v.read.length).toBeGreaterThan(40);
    expect(v.likes.length).toBeGreaterThan(0);
    expect(v.concerns.length).toBeGreaterThan(0);
    expect(v.segments.length).toBeGreaterThan(1);
    expect(v.improvements.length).toBeGreaterThan(0);
    expect(['Low', 'Moderate', 'High']).toContain(v.viralBand);
    expect(v.score).toBeGreaterThanOrEqual(0);
    expect(v.score).toBeLessThanOrEqual(100);
  });

  it('gives every segment a plain-language reaction, not a bare number', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    for (const s of v.segments) {
      expect(s.note.length).toBeGreaterThan(10);
      expect(s.note).not.toMatch(/\d/);
    }
  });

  it('does not repeat the same note for every segment', async () => {
    // Varying only by band meant four segments in one band produced identical
    // text, which is what makes a summary read as machine-generated.
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    const notes = v.segments.map((s) => s.note);
    expect(new Set(notes).size).toBe(notes.length);
  });

  it('names a specific gap per segment rather than a generic line', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    const withGap = v.segments.filter((s) => /attention|clarity|trust|share|save|comment|follow|click|purchase|response|rejection/i.test(s.note));
    expect(withGap.length).toBeGreaterThan(0);
  });

  it('states that the score is simulated', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    expect(v.method.toLowerCase()).toContain('simulated');
  });

  it('never claims real-world performance', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    const text = [v.headline, v.read, v.viralNote, v.method, ...v.likes, ...v.concerns]
      .join(' ')
      .toLowerCase();
    for (const phrase of ['guarantee', 'will go viral', 'predicted lift', 'expected conversion', 'statistically significant']) {
      expect(text).not.toContain(phrase);
    }
  });

  it('improvements are actionable and specific', async () => {
    const { metrics, dna, audience } = await run();
    const v = deriveVerdict({ metrics, dna, why: null, brief: null, audience });
    for (const imp of v.improvements) {
      expect(imp.title.length).toBeGreaterThan(3);
      expect(imp.title.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(imp.why.length).toBeGreaterThan(10);
      expect(imp.moves.length).toBeGreaterThan(2);
    }
  });
});
