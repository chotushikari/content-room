import { describe, expect, it } from 'vitest';
import {
  ComparisonSchema,
  CreativeBriefSchema,
  MetricSchema,
  RunRecordSchema,
  ValidationStatusSchema,
  WhyReportSchema,
} from '../src/core/domain';
import { NOT_ESTABLISHED } from '../src/core/domain';

/**
 * Contract obligations.
 *
 * Each of these protects a promise the product makes to the user, and each one
 * is enforced by the schema rather than by a convention a future change could
 * quietly drop.
 */

const validMetric = {
  id: 'attention' as const,
  label: 'Attention',
  value: 62.5,
  scale: 100 as const,
  n: 24,
  method: 'agents that reached the interpretation stage ÷ n',
  kind: 'simulated_estimate' as const,
};

describe('Metric', () => {
  it('accepts a well-formed simulated metric', () => {
    expect(MetricSchema.safeParse(validMetric).success).toBe(true);
  });

  it('rejects a metric without a sample size', () => {
    const { n: _n, ...withoutN } = validMetric;
    expect(MetricSchema.safeParse(withoutN).success).toBe(false);
  });

  it('rejects a zero sample size', () => {
    expect(MetricSchema.safeParse({ ...validMetric, n: 0 }).success).toBe(false);
  });

  it('rejects a metric without a stated derivation', () => {
    expect(MetricSchema.safeParse({ ...validMetric, method: '' }).success).toBe(false);
  });

  it('cannot claim to be measured real-world data', () => {
    // `kind` is a literal, so this is impossible at runtime AND at type-check
    // time. The UI reads it to render the "simulated" label automatically, which
    // is why the label cannot be forgotten.
    expect(MetricSchema.safeParse({ ...validMetric, kind: 'measured' }).success).toBe(false);
    expect(MetricSchema.safeParse({ ...validMetric, kind: 'real_world' }).success).toBe(false);
  });
});

describe('Comparison', () => {
  const base = {
    runA: 'a',
    runB: 'b',
    audienceRef: {
      audienceId: 'aud',
      audienceSeed: 'seed',
      populationHash: 'hash',
      controlMode: 'same_population' as const,
    },
    samePopulation: true,
    reproducibility: 'deterministic' as const,
    rows: [
      {
        metricId: 'attention' as const,
        label: 'Attention',
        a: validMetric,
        b: { ...validMetric, value: 79 },
        delta: 16.5,
        direction: 'up' as const,
      },
    ],
    caveats: ['Simulated change.', 'Same synthetic audience; population hash verified.'],
  };

  it('accepts a comparison that carries caveats', () => {
    expect(ComparisonSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a comparison with no caveats at all', () => {
    // A caveat-free comparison cannot be constructed, so "Simulated change"
    // labelling cannot be dropped under deadline pressure.
    expect(ComparisonSchema.safeParse({ ...base, caveats: [] }).success).toBe(false);
  });

  it('rejects a comparison with no rows', () => {
    expect(ComparisonSchema.safeParse({ ...base, rows: [] }).success).toBe(false);
  });
});

describe('WhyReport', () => {
  const base = {
    biggestSignal: { headline: 'x', detail: 'y', evidence: [] },
    audienceSplit: [],
    topFrictions: [],
    ungroundedClaims: [],
  };

  it('rejects an explanation whose biggest signal cites no evidence', () => {
    expect(WhyReportSchema.safeParse(base).success).toBe(false);
  });

  it('accepts an explanation that cites evidence', () => {
    const withEvidence = {
      ...base,
      biggestSignal: {
        ...base.biggestSignal,
        evidence: [{ id: 'e1', kind: 'dna_field' as const, ref: 'dna.promise', note: 'grounded' }],
      },
    };
    expect(WhyReportSchema.safeParse(withEvidence).success).toBe(true);
  });

  it('rejects a friction with no evidence', () => {
    const report = {
      ...base,
      biggestSignal: {
        ...base.biggestSignal,
        evidence: [{ id: 'e1', kind: 'dna_field' as const, ref: 'r', note: 'n' }],
      },
      topFrictions: [{ rank: 1, label: 'l', detail: 'd', evidence: [] }],
    };
    expect(WhyReportSchema.safeParse(report).success).toBe(false);
  });
});

describe('CreativeBrief', () => {
  const change = {
    rank: 1,
    change: 'c',
    expectedEffect: 'e',
    evidence: [{ id: 'e1', kind: 'dna_field' as const, ref: 'r', note: 'n' }],
  };
  const asset = {
    id: 'a',
    kind: 'social_post' as const,
    source: { type: 'manual' as const },
    title: '',
    body: 'b',
    media: [],
    meta: {},
    partial: false,
    importedBy: 'manual',
    contentHash: 'h',
  };
  const base = {
    strongestSignal: 's',
    biggestRisk: 'r',
    highestImpactChange: 'h',
    top3Changes: [change, { ...change, rank: 2 }, { ...change, rank: 3 }],
    recommendedHook: 'h',
    recommendedCTA: 'c',
    strategy: 's',
    versionB: asset,
    changes: [{ field: 'f', before: 'a', after: 'b', reason: 'r' }],
  };

  it('accepts exactly three changes', () => {
    expect(CreativeBriefSchema.safeParse(base).success).toBe(true);
  });

  it('rejects two or four changes', () => {
    expect(CreativeBriefSchema.safeParse({ ...base, top3Changes: base.top3Changes.slice(0, 2) }).success).toBe(false);
    expect(
      CreativeBriefSchema.safeParse({ ...base, top3Changes: [...base.top3Changes, { ...change, rank: 3 }] }).success,
    ).toBe(false);
  });

  it('rejects a brief with no computed diff', () => {
    expect(CreativeBriefSchema.safeParse({ ...base, changes: [] }).success).toBe(false);
  });
});

describe('ValidationStatus', () => {
  it('reports the truthful current state', () => {
    expect(NOT_ESTABLISHED.state).toBe('not_established');
    expect(NOT_ESTABLISHED.note).toContain('being established');
  });

  it('rejects a calibrated benchmark with no sample size', () => {
    // A bare error figure must not be representable as a validated result:
    // a benchmark needs an observation count and a named method.
    const withoutN = {
      state: 'calibrated',
      benchmarks: [{ metric: 'attention', observed: 61, simulated: 64, error: 3, method: 'mae' }],
      calibratedAt: '2026-09-26',
    };
    expect(ValidationStatusSchema.safeParse(withoutN).success).toBe(false);
  });

  it('rejects a calibrated benchmark with an unnamed method', () => {
    const withoutMethod = {
      state: 'calibrated',
      benchmarks: [{ metric: 'attention', observed: 61, simulated: 64, error: 3, n: 30 }],
      calibratedAt: '2026-09-26',
    };
    expect(ValidationStatusSchema.safeParse(withoutMethod).success).toBe(false);
  });

  it('accepts a fully specified benchmark', () => {
    const complete = {
      state: 'calibrated',
      benchmarks: [{ metric: 'attention', observed: 61, simulated: 64, error: 3, method: 'mae', n: 30 }],
      calibratedAt: '2026-09-26',
    };
    expect(ValidationStatusSchema.safeParse(complete).success).toBe(true);
  });

  it('carries the not-established status on a complete run record', () => {
    expect(RunRecordSchema.shape.validation.safeParse(NOT_ESTABLISHED).success).toBe(true);
  });
});
