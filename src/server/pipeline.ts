import {
  ErrorCodeSchema,
  NOT_ESTABLISHED,
  assertSamePopulation,
  type AgentEvent,
  type Audience,
  type Comparison,
  type ContentAsset,
  type CreateRunRequest,
  type CreativeBrief,
  type EngineId,
  type ErrorCode,
  type MetricsBundle,
  type RunEvent,
  type RunRecord,
  type RunMode,
  type Segment,
  type ValidationStatus,
  type WhyReport,
} from '../core/domain';
import { aggregate } from '../core/analytics/aggregate';
import { compare } from '../core/comparison/compare';
import { buildAudience } from '../core/audience/factory';
import { deriveAudienceSeed, makeAudienceRef, makeRunId } from '../core/ids';
import { deterministicEngine } from '../engines/deterministic/engine';
import { getEngine } from '../engines/registry';
import { ProviderChain } from '../providers/chain';
import { contentDnaRequest, segmentsRequest, whyRequest } from '../providers/tasks';
import { briefNarrativeRequest } from '../providers/tasks-brief';
import { heuristicRewrite, heuristicDNA } from '../providers/deterministic/analysis';
import { importFromManual, importFromUrl } from '../ingest';
import { velloeDemoAsset } from '../fixtures/velloe/content';
import { getRunStore } from './store';
import type { SimulationInput } from '../engines/types';

/**
 * The run pipeline: the only module that composes ingest, providers, engines and
 * the pure core. Emits a single `RunEvent` stream that the UI consumes.
 *
 * It streams rather than buffering because Vercel Hobby gives 300s of function
 * time and NOWHERE durable for background work (cron has a one-per-day minimum
 * and `waitUntil` promises are cancelled at the deadline). So the simulation
 * runs inside the request the browser is already streaming.
 */

export type PipelineOptions = {
  audienceSize: number;
  rounds: number;
  audienceSeed?: string;
  engineId: 'deterministic' | 'oasis';
  demoMode: boolean;
};

const DEFAULT_OPTIONS: PipelineOptions = {
  audienceSize: 24,
  rounds: 3,
  engineId: 'deterministic',
  demoMode: false,
};

/** Small pacing delay so the room animates instead of dumping 400 events. */
const pace = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function configuredMode(): RunMode {
  const hasLive = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GROQ_API_KEY,
  );
  return hasLive ? 'live' : 'demo';
}

async function resolveAsset(
  source: CreateRunRequest['source'],
): Promise<{ asset: ContentAsset; note: string | null }> {
  if (source.type === 'fixture') {
    return { asset: velloeDemoAsset, note: 'Demo fixture — not live content.' };
  }
  if (source.type === 'manual') {
    const result = importFromManual({
      kind: source.kind as ContentAsset['kind'],
      title: source.title,
      body: source.body,
    });
    return { asset: result.asset, note: result.note ?? null };
  }
  const result = await importFromUrl(source.url);
  return { asset: result.asset, note: result.note ?? null };
}

/** Simulate a content asset against an audience, streaming events. */
async function* simulate(
  input: SimulationInput,
  label: 'A' | 'B',
  engineId: EngineId,
): AsyncGenerator<RunEvent> {
  const engine = getEngine(engineId);

  // Round boundaries are surfaced by the engine's onRoundComplete callback, so
  // the engine stays unaware of the transport.
  const roundQueue: number[] = [];
  const withCallback: SimulationInput = {
    ...input,
    onRoundComplete: (round) => {
      roundQueue.push(round);
    },
  };

  let currentRound = 0;
  for await (const event of engine.run(withCallback)) {
    if (event.stage === 'exposure' && event.round !== currentRound) {
      currentRound = event.round;
      yield { type: 'round_started', round: event.round, ofRounds: input.rounds, label };
    }
    yield label === 'A' ? { type: 'agent_event', event } : { type: 'resim_event', event };

    // Drain any rounds completed during this agent's pass.
    while (roundQueue.length > 0) {
      const done = roundQueue.shift();
      if (done !== undefined) {
        yield { type: 'round_completed', round: done, label };
      }
    }
  }

  while (roundQueue.length > 0) {
    const done = roundQueue.shift();
    if (done !== undefined) yield { type: 'round_completed', round: done, label };
  }
}

export async function* runPipeline(opts: {
  source: CreateRunRequest['source'];
  options?: Partial<PipelineOptions>;
  signal?: AbortSignal;
}): AsyncGenerator<RunEvent> {
  const options: PipelineOptions = { ...DEFAULT_OPTIONS, ...opts.options };
  const chain = new ProviderChain({ forceDemo: options.demoMode });
  const store = getRunStore();

  let stage = 'ingest';
  try {
    // ---------------------------------------------------------------- ingest
    const { asset, note } = await resolveAsset(opts.source);
    const seed = options.audienceSeed ?? deriveAudienceSeed(asset.contentHash);
    const runId = makeRunId(seed, asset.contentHash, 'A');
    const startedAt = new Date().toISOString();

    yield {
      type: 'run_started',
      runId,
      mode: configuredMode(),
      engineId: options.engineId,
      label: 'A',
    };
    yield { type: 'stage_changed', stage: 'content', label: 'Reading the content' };
    yield { type: 'ingest_resolved', asset, note };
    if (opts.signal?.aborted) return;

    // ------------------------------------------------------- content DNA (AI)
    stage = 'content_dna';
    yield { type: 'stage_changed', stage: 'understanding', label: 'Understanding the content' };
    const dnaResult = await chain.generate(
      { ...contentDnaRequest(asset), signal: opts.signal },
    );
    const dna = dnaResult.value;
    yield { type: 'dna_ready', dna, label: 'A' };

    // ------------------------------------------------- audience segments (AI)
    stage = 'audience_segments';
    yield { type: 'stage_changed', stage: 'audience', label: 'Building a contextual audience' };
    const segmentsResult = await chain.generate({
      ...segmentsRequest(asset, dna, options.audienceSize),
      signal: opts.signal,
    });
    const segments: Segment[] = segmentsResult.value.segments;

    const audience: Audience = buildAudience({
      dna,
      segments,
      size: options.audienceSize,
      audienceSeed: seed,
      producedBy: segmentsResult.providerId,
    });
    yield { type: 'audience_ready', audience };
    if (opts.signal?.aborted) return;

    // ------------------------------------------------------ simulate version A
    stage = 'simulate';
    yield { type: 'stage_changed', stage: 'room', label: 'The room is live' };
    const eventsA: AgentEvent[] = [];
    const engine = deterministicEngine;
    const runA = {
      id: runId,
      label: 'A' as const,
      contentHash: asset.contentHash,
      audienceRef: audience.ref,
      engineId: engine.id,
      engineVersion: engine.version,
      reproducibility: engine.capabilities().reproducible ? ('deterministic' as const) : ('sampled' as const),
      status: 'running' as const,
      rounds: options.rounds,
      seed: Number.parseInt(asset.contentHash.slice(0, 6), 16) || 42,
      startedAt,
      endedAt: null,
    };

    for await (const evt of simulate(
      {
        runId,
        asset,
        dna,
        audience,
        rounds: options.rounds,
        seed: runA.seed,
        signal: opts.signal,
      },
      'A',
      options.engineId,
    )) {
      if (evt.type === 'agent_event') eventsA.push(evt.event);
      yield evt;
      // Pace only stage transitions lightly; the client batches into frames.
      if (evt.type === 'round_completed') await pace(180);
    }
    if (opts.signal?.aborted) return;

    // ------------------------------------------------------------- analytics
    stage = 'analytics';
    yield { type: 'stage_changed', stage: 'intelligence', label: 'Reading the room' };
    const metricsA: MetricsBundle = aggregate({
      runId,
      events: eventsA,
      audience,
      rounds: options.rounds,
    });
    yield { type: 'metrics_ready', metrics: metricsA, label: 'A' };

    // ------------------------------------------------------ explanation (AI)
    stage = 'why';
    const sampled = pickStratifiedSample(eventsA, audience);
    const whyResult = await chain.generate({
      ...whyRequest(metricsA, dna, audience, sampled),
      signal: opts.signal,
    });
    const why: WhyReport = whyResult.value;
    yield { type: 'why_ready', why };

    // --------------------------------------------- rewrite + brief narrative
    stage = 'creative_director';
    yield { type: 'stage_changed', stage: 'strategy', label: 'Creative Director' };
    const rewrite = heuristicRewrite(asset);
    const narrativeResult = await chain.generate({
      ...briefNarrativeRequest(metricsA, dna, why, audience, {
        hook: rewrite.hook,
        cta: rewrite.cta,
        changes: rewrite.changes,
      }),
      signal: opts.signal,
    });

    const brief: CreativeBrief = {
      ...narrativeResult.value,
      versionB: rewrite.versionB,
      changes: rewrite.changes,
    };
    yield { type: 'brief_ready', brief };
    yield { type: 'versionb_ready', asset: rewrite.versionB };

    const mode = chain.mode();
    const validation: ValidationStatus = NOT_ESTABLISHED;

    const run: RunRecord = {
      run: { ...runA, status: 'completed', endedAt: new Date().toISOString() },
      asset,
      dna,
      audience,
      events: eventsA,
      metrics: metricsA,
      why,
      brief,
      versionBRun: null,
      versionBEvents: null,
      versionBMetrics: null,
      comparison: null,
      providers: chain.providerUsage(),
      mode,
      validation,
      versionBAsset: null,
      versionBAudience: null,
    };

    await store.save(run);
    yield { type: 'run_completed', mode, providers: chain.providerUsage(), validation };
  } catch (error) {
    if (opts.signal?.aborted) {
      yield { type: 'run_failed', stage, code: 'ABORTED', message: 'Run cancelled.', recovered: false };
      return;
    }
    const raw = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'INTERNAL';
    const code = ErrorCodeSchema.safeParse(raw).success
      ? (raw as ErrorCode)
      : ('INTERNAL' as const);

    yield {
      type: 'run_failed',
      stage,
      code,
      // Never leak upstream detail: URL_BLOCKED and IMPORT_FAILED must stay
      // indistinguishable so this endpoint cannot be used as a network probe.
      message:
        code === 'URL_BLOCKED' || code === 'IMPORT_FAILED'
          ? 'That link could not be read. Paste the content and we will take it from there.'
          : 'Something went wrong in this run.',
      recovered: false,
    };
  }
}

/**
 * Build a stratified sample of reaction events for the explanation task.
 * Including REJECTs and disagreement outliers is deliberate: a sample drawn only
 * from the loud majority produces confident nonsense.
 */
function pickStratifiedSample(events: AgentEvent[], audience: Audience): string[] {
  const segments = new Map(audience.segments.map((s) => [s.id, s.label]));
  const actionEvents = events.filter((e) => e.stage === 'action' && e.excerpt);

  const rejects = actionEvents.filter((e) => e.action === 'REJECT').slice(0, 8);
  const ignores = actionEvents.filter((e) => e.action === 'IGNORE' || e.action === 'STOP').slice(0, 8);
  const positives = actionEvents
    .filter((e) => e.action && ['SHARE', 'SAVE', 'BUY', 'COMMENT'].includes(e.action))
    .slice(0, 8);

  const chosen = [...rejects, ...ignores, ...positives];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of chosen) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    lines.push(
      `[${segments.get(e.segmentId) ?? e.segmentId}] ${e.action}: "${e.excerpt ?? ''}"`,
    );
  }
  return lines;
}

/**
 * Re-simulate Version B against the SAME audience, then compare.
 *
 * The population is reused verbatim from the stored run, and the population
 * hash is ASSERTED rather than trusted. If the audience derivation ever changes, this
 * throws AudienceMismatchError instead of silently presenting an uncontrolled
 * result as a controlled one.
 */
export async function* resimulatePipeline(opts: {
  runId: string;
  signal?: AbortSignal;
}): AsyncGenerator<RunEvent> {
  const store = getRunStore();
  const record = await store.get(opts.runId);
  if (!record || !record.brief) {
    yield {
      type: 'run_failed',
      stage: 'resimulate',
      code: 'INTERNAL',
      message: 'That run is no longer available in this session.',
      recovered: false,
    };
    return;
  }

  const { audience, brief } = record;
  const versionB = brief.versionB;

  // Version B is simulated against its OWN Content DNA, not Version A's.
  //
  // This matters: the friction Version A carried was addressed by the rewrite, so
  // charging Version B with it would understate the change and make the
  // comparison measure the original's defects a second time. The DNA is
  // recomputed with the same deterministic analyser, so it is still reproducible
  // and still no model call.
  const dnaB = heuristicDNA(versionB);

  // Re-derive the audience ref from the same seed and segments. If trait
  // derivation has changed, the hash differs and we refuse to compare.
  const recheck = makeAudienceRef(audience.ref.audienceSeed, audience.segments, audience.agents);
  assertSamePopulation(audience.ref, recheck);

  const chain = new ProviderChain();
  const runBId = makeRunId(audience.ref.audienceSeed, versionB.contentHash, 'B');
  const startedAt = new Date().toISOString();
  const seedB = Number.parseInt(versionB.contentHash.slice(0, 6), 16) || 42;

  try {
    yield {
      type: 'run_started',
      runId: runBId,
      mode: configuredMode(),
      engineId: 'deterministic',
      label: 'B',
    };
    yield {
      type: 'stage_changed',
      stage: 'room',
      label: 'Same audience, new content',
    };
    // No dna_ready for B: the DNA station shows the original content's reading,
    // and overwriting it mid-comparison would be confusing. Version B's DNA is
    // used for the simulation only.
    yield { type: 'versionb_ready', asset: versionB };

    const engine = deterministicEngine;
    const eventsB: AgentEvent[] = [];
    for await (const evt of simulate(
      {
        runId: runBId,
        asset: versionB,
        dna: dnaB,
        audience,
        rounds: record.run.rounds,
        seed: seedB,
        signal: opts.signal,
      },
      'B',
      'deterministic',
    )) {
      if (evt.type === 'resim_event') eventsB.push(evt.event);
      yield evt;
      if (evt.type === 'round_completed') await pace(180);
    }
    if (opts.signal?.aborted) return;

    const metricsB: MetricsBundle = aggregate({
      runId: runBId,
      events: eventsB,
      audience,
      rounds: record.run.rounds,
    });
    yield { type: 'metrics_ready', metrics: metricsB, label: 'B' };

    const comparison: Comparison = compare({
      runA: record.run.id,
      runB: runBId,
      metricsA: record.metrics,
      metricsB,
      audienceRefA: record.run.audienceRef,
      audienceRefB: recheck,
      reproducibility: 'deterministic',
    });
    yield { type: 'comparison_ready', comparison };

    const updated: RunRecord = {
      ...record,
      versionBRun: {
        id: runBId,
        label: 'B',
        contentHash: versionB.contentHash,
        audienceRef: recheck,
        engineId: engine.id,
        engineVersion: engine.version,
        reproducibility: 'deterministic',
        status: 'completed',
        rounds: record.run.rounds,
        seed: seedB,
        startedAt,
        endedAt: new Date().toISOString(),
      },
      versionBEvents: eventsB,
      versionBMetrics: metricsB,
      comparison,
      versionBAsset: versionB,
      versionBAudience: record.audience.agents,
      providers: [...record.providers, ...chain.providerUsage()],
    };
    await store.save(updated);

    yield {
      type: 'run_completed',
      mode: updated.mode,
      providers: chain.providerUsage(),
      validation: updated.validation,
    };
  } catch (error) {
    if (opts.signal?.aborted) {
      yield { type: 'run_failed', stage: 'resimulate', code: 'ABORTED', message: 'Run cancelled.', recovered: false };
      return;
    }
    if (error instanceof Error && error.name === 'AudienceMismatchError') {
      yield {
        type: 'run_failed',
        stage: 'resimulate',
        code: 'AUDIENCE_MISMATCH',
        message:
          'The synthetic audience changed between runs, so this would not be a controlled comparison.',
        recovered: false,
      };
      return;
    }
    yield {
      type: 'run_failed',
      stage: 'resimulate',
      code: 'INTERNAL',
      message: 'The re-simulation could not be completed.',
      recovered: false,
    };
  }
}
