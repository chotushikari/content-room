import type { RunEvent } from '../core/domain';

/**
 * The append-only event log.
 *
 * This is the spine of the interface. Nothing in the UI sets display state
 * directly: every visual change is the result of an event arriving here. The
 * log is the single source of truth, and every panel is a subscriber.
 *
 * Two properties matter and are therefore explicit:
 *  - `seq` is monotonic, so ordering is never inferred from timestamps.
 *  - `deltaMs` records the gap since the previous event, which is what makes the
 *    "instrumentation" reading of a live run possible (each row shows how long
 *    it took to arrive).
 */

export type EventEnvelope = {
  /** Monotonic sequence number, assigned on arrival. */
  seq: number;
  event: RunEvent;
  /** Wall-clock arrival time (ms since epoch). Presentation only. */
  at: number;
  /** Milliseconds since the previous event arrived. Not part of the domain. */
  deltaMs: number;
};

export type LogSubscriber = (entries: readonly EventEnvelope[], latest: EventEnvelope) => void;

export class RunEventLog {
  private entries: EventEnvelope[] = [];
  private subscribers = new Set<LogSubscriber>();
  private seq = 0;
  private lastAt = 0;

  append(event: RunEvent): EventEnvelope {
    const at = Date.now();
    const envelope: EventEnvelope = {
      seq: this.seq++,
      event,
      at,
      deltaMs: this.lastAt === 0 ? 0 : at - this.lastAt,
    };
    this.lastAt = at;
    this.entries = [...this.entries, envelope];
    for (const fn of this.subscribers) fn(this.entries, envelope);
    return envelope;
  }

  subscribe(fn: LogSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  all(): readonly EventEnvelope[] {
    return this.entries;
  }

  /** Most recent entries first, for the console. */
  recent(limit: number): EventEnvelope[] {
    return this.entries.slice(-limit).reverse();
  }

  /** Count per event type. Drives the instrumentation ledger. */
  counters(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      out[e.event.type] = (out[e.event.type] ?? 0) + 1;
    }
    return out;
  }

  reset(): void {
    this.entries = [];
    this.seq = 0;
    this.lastAt = 0;
    for (const fn of this.subscribers) fn(this.entries, { seq: -1, event: { type: 'heartbeat', at: '' }, at: 0, deltaMs: 0 });
  }
}

/** Human-readable label for an event type, used by the console and ledger. */
export const EVENT_LABELS: Record<string, string> = {
  run_started: 'run_started',
  stage_changed: 'stage_changed',
  ingest_resolved: 'ingest_resolved',
  dna_ready: 'dna_ready',
  audience_ready: 'audience_ready',
  round_started: 'round_started',
  agent_event: 'agent_event',
  round_completed: 'round_completed',
  metrics_ready: 'metrics_ready',
  why_ready: 'why_ready',
  brief_ready: 'brief_ready',
  versionb_ready: 'versionb_ready',
  resim_event: 'resim_event',
  comparison_ready: 'comparison_ready',
  heartbeat: 'heartbeat',
  run_completed: 'run_completed',
  run_failed: 'run_failed',
};

/**
 * A one-line summary of an event, for the console.
 * Deliberately terse and monospaced: the console reads as instrumentation.
 */
export function describeEvent(event: RunEvent): string {
  switch (event.type) {
    case 'run_started':
      return `run ${event.runId} · engine=${event.engineId} · label=${event.label} · mode=${event.mode}(provisional)`;
    case 'stage_changed':
      return `${event.stage} — ${event.label}`;
    case 'ingest_resolved':
      return `${event.asset.kind} · ${event.asset.importedBy} · partial=${event.asset.partial} · hash=${event.asset.contentHash}`;
    case 'dna_ready':
      return `label=${event.label} · hook="${truncate(event.dna.hook, 60)}" · frictions=${event.dna.potentialFrictions.length} · confidence=${event.dna.confidence}`;
    case 'audience_ready':
      return `${event.audience.size} agents · ${event.audience.segments.length} segments · populationHash=${event.audience.ref.populationHash}`;
    case 'round_started':
      return `label=${event.label} round ${event.round}/${event.ofRounds}`;
    case 'agent_event':
      return `${event.event.agentId} ${event.event.stage}${event.event.action ? ` → ${event.event.action}` : ''} intensity=${event.event.intensity}`;
    case 'resim_event':
      return `${event.event.agentId} ${event.event.stage}${event.event.action ? ` → ${event.event.action}` : ''} intensity=${event.event.intensity}`;
    case 'round_completed':
      return `label=${event.label} round ${event.round} complete`;
    case 'metrics_ready':
      return `label=${event.label} · ${event.metrics.overall.length} metrics · ${event.metrics.bookkeeping.events} events · ${event.metrics.disagreements.length} disagreements`;
    case 'why_ready':
      return `signal="${truncate(event.why.biggestSignal.headline, 60)}" · frictions=${event.why.topFrictions.length}`;
    case 'brief_ready':
      return `changes=${event.brief.changes.length} · versionB hash=${event.brief.versionB.contentHash}`;
    case 'versionb_ready':
      return `hash=${event.asset.contentHash} · bytes=${event.asset.body.length}`;
    case 'comparison_ready':
      return `samePopulation=${event.comparison.samePopulation} · rows=${event.comparison.rows.length} · caveats=${event.comparison.caveats.length}`;
    case 'heartbeat':
      return 'keepalive';
    case 'run_completed':
      return `mode=${event.mode} · providers=${event.providers.map((p) => `${p.task}:${p.providerId}`).join(' ')}`;
    case 'run_failed':
      return `${event.code} at ${event.stage} — ${event.message}`;
    default:
      return '';
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
