import {
  samePopulation,
  type AudienceRef,
  type Comparison,
  type MetricsBundle,
  type Metric,
  type Reproducibility,
} from '../domain';

/**
 * Before/after comparison. PURE and deterministic.
 *
 * The caveat text is not optional decoration — `Comparison.caveats` has min(1)
 * in the schema, so a comparison with no caveat cannot be constructed. The
 * correct caveat is selected from provenance:
 *
 *   regenerated audience  -> an explicit WARNING (never presented as controlled)
 *   sampled reactions     -> "reactions resampled"
 *   deterministic         -> the clean controlled statement
 */

export function caveatsFor(
  reproducibility: Reproducibility,
  refA: AudienceRef,
  refB: AudienceRef,
): string[] {
  const controlled = samePopulation(refA, refB);
  const list: string[] = ['Simulated change.'];

  if (!controlled) {
    list.push(
      'WARNING: the audience was regenerated for Version B, so this is NOT a controlled comparison.',
    );
    return list;
  }

  list.push('Same synthetic audience; population hash verified.');

  if (reproducibility === 'deterministic') {
    list.push('Both runs are reproducible, so the difference is attributable to the content.');
  } else {
    list.push('Audience held constant. Reactions resampled.');
  }

  list.push('Not representative of any real population.');
  return list;
}

export type CompareInput = {
  runA: string;
  runB: string;
  metricsA: MetricsBundle;
  metricsB: MetricsBundle;
  audienceRefA: AudienceRef;
  audienceRefB: AudienceRef;
  reproducibility: Reproducibility;
};

function direction(delta: number): 'up' | 'down' | 'flat' {
  if (Math.abs(delta) < 0.05) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function compare(input: CompareInput): Comparison {
  const rows = input.metricsA.overall
    .map((a) => {
      const b = input.metricsB.overall.find((x) => x.id === a.id);
      if (!b) return null;
      const delta = Math.round((b.value - a.value) * 10) / 10;
      return {
        metricId: a.id,
        label: a.label,
        a,
        b,
        delta,
        direction: direction(delta),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Largest change first: the headline is what moved, not an arbitrary order.
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    runA: input.runA,
    runB: input.runB,
    audienceRef: input.audienceRefB,
    samePopulation: samePopulation(input.audienceRefA, input.audienceRefB),
    reproducibility: input.reproducibility,
    rows,
    caveats: caveatsFor(input.reproducibility, input.audienceRefA, input.audienceRefB),
  };
}

export function metricBy(bundle: MetricsBundle, id: Metric['id']): Metric | undefined {
  return bundle.overall.find((m) => m.id === id);
}
