/**
 * Headless demo run.
 *
 * Executes the full journey with `instant` pacing and prints per-stage timings,
 * so the demo can be checked against the 88-second budget without watching it.
 * Also prints the metrics and the comparison, which is the fastest way to notice
 * that a change to the reaction model has broken the story.
 *
 *   npm run demo
 */

import { runPipeline, resimulatePipeline } from '../src/server/pipeline';
import type { RunEvent } from '../src/core/domain';

type Marks = Record<string, number>;

function labelFor(event: RunEvent): string | null {
  switch (event.type) {
    case 'run_started':
      return 'run_started';
    case 'ingest_resolved':
      return 'ingest';
    case 'dna_ready':
      return 'dna';
    case 'audience_ready':
      return 'audience';
    case 'round_completed':
      return `round_${event.round}`;
    case 'metrics_ready':
      return `metrics_${event.label}`;
    case 'why_ready':
      return 'why';
    case 'brief_ready':
      return 'brief';
    case 'versionb_ready':
      return 'version_b';
    case 'comparison_ready':
      return 'comparison';
    case 'run_completed':
      return 'run_completed';
    case 'run_failed':
      return `FAILED(${event.code})`;
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const marks: Marks = {};
  const mark = (name: string) => {
    if (!(name in marks)) marks[name] = Date.now() - t0;
  };

  let runId: string | null = null;
  let mode = 'unknown';
  let eventCount = 0;
  let failure: string | null = null;
  let metricsA: Array<{ label: string; value: number }> = [];
  let metricsB: Array<{ label: string; value: number }> = [];
  let comparisonRows: Array<{ label: string; a: number; b: number; delta: number }> = [];
  let caveats: string[] = [];
  let samePopulation = false;
  let populationHash = '';

  process.stdout.write('Content Room — headless demo\n\n');

  for await (const event of runPipeline({
    source: { type: 'fixture', fixtureId: 'velloe' },
    options: { audienceSize: 24, rounds: 3, engineId: 'deterministic', demoMode: true },
  })) {
    if (event.type === 'agent_event') eventCount++;
    const label = labelFor(event);
    if (label) mark(label);

    if (event.type === 'run_started') runId = event.runId;
    if (event.type === 'audience_ready') populationHash = event.audience.ref.populationHash;
    if (event.type === 'metrics_ready' && event.label === 'A') {
      metricsA = event.metrics.overall.map((m) => ({ label: m.label, value: m.value }));
    }
    if (event.type === 'run_completed') mode = event.mode;
    if (event.type === 'run_failed') failure = `${event.code}: ${event.message}`;
  }

  if (failure) {
    process.stdout.write(`run failed → ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  if (!runId) {
    process.stdout.write('run produced no runId\n');
    process.exitCode = 1;
    return;
  }

  // Second pass: same audience, Version B.
  for await (const event of resimulatePipeline({ runId })) {
    if (event.type === 'resim_event') eventCount++;
    const label = labelFor(event);
    if (label) mark(label);

    if (event.type === 'metrics_ready' && event.label === 'B') {
      metricsB = event.metrics.overall.map((m) => ({ label: m.label, value: m.value }));
    }
    if (event.type === 'comparison_ready') {
      comparisonRows = event.comparison.rows.map((r) => ({
        label: r.label,
        a: r.a.value,
        b: r.b.value,
        delta: r.delta,
      }));
      caveats = event.comparison.caveats;
      samePopulation = event.comparison.samePopulation;
    }
    if (event.type === 'run_failed') failure = `${event.code}: ${event.message}`;
  }

  process.stdout.write('stage timings (ms since start)\n');
  for (const [name, at] of Object.entries(marks)) {
    process.stdout.write(`  ${name.padEnd(16)} ${String(at).padStart(6)}\n`);
  }

  process.stdout.write(`\nevents streamed: ${eventCount}\n`);
  process.stdout.write(`mode:            ${mode}\n`);
  process.stdout.write(`populationHash:  ${populationHash}\n`);
  process.stdout.write(`samePopulation:  ${samePopulation}\n`);

  if (metricsA.length > 0) {
    process.stdout.write('\nmetrics  (Version A → Version B)\n');
    for (const a of metricsA) {
      const b = metricsB.find((m) => m.label === a.label);
      const delta = b ? (b.value - a.value).toFixed(1) : '—';
      const sign = b && b.value > a.value ? '+' : '';
      process.stdout.write(
        `  ${a.label.padEnd(20)} ${a.value.toFixed(1).padStart(5)}  →  ${(b?.value ?? 0).toFixed(1).padStart(5)}   ${sign}${delta}\n`,
      );
    }
  }

  if (comparisonRows.length > 0) {
    process.stdout.write('\ncomparison (largest change first)\n');
    for (const r of comparisonRows.slice(0, 6)) {
      const sign = r.delta > 0 ? '+' : '';
      process.stdout.write(
        `  ${r.label.padEnd(20)} ${r.a.toFixed(1).padStart(5)}  →  ${r.b.toFixed(1).padStart(5)}   ${sign}${r.delta.toFixed(1)}\n`,
      );
    }
    process.stdout.write('\ncaveats\n');
    for (const c of caveats) process.stdout.write(`  · ${c}\n`);
  }

  const total = Date.now() - t0;
  process.stdout.write(`\ntotal wall clock: ${(total / 1000).toFixed(2)}s\n`);
  process.stdout.write(
    total < 88_000
      ? 'within the 88-second demo budget\n'
      : 'OVER the 88-second demo budget — pacing needs attention\n',
  );

  if (failure) {
    process.stdout.write(`\nre-simulation failed → ${failure}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stdout.write(`demo failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
