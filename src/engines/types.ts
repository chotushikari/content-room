import type { AgentEvent, Audience, ContentAsset, ContentDNA, EngineId, JourneyStage } from '../core/domain';

export type EngineCapabilities = {
  streaming: boolean;
  /** True when identical input produces identical events. */
  reproducible: boolean;
  needsModel: boolean;
  maxPopulation: number;
};

export type SimulationInput = {
  runId: string;
  asset: ContentAsset;
  dna: ContentDNA;
  audience: Audience;
  rounds: number;
  seed: number;
  signal?: AbortSignal;
  /**
   * Called when a round completes, with that round's per-segment positive share.
   * The pipeline uses this to emit `round_completed` without the engine knowing
   * anything about the transport.
   */
  onRoundComplete?: (round: number, segmentPositiveShare: Record<string, number>) => void;
};

/**
 * The engine abstraction.
 *
 * `run` returns an AsyncIterable, not an array. That single choice is what lets
 * the live room render progressively, and it lets a slow model-driven engine
 * and a fast deterministic engine share one interface. Swapping in the
 * (deferred) OASIS engine requires no change anywhere downstream.
 */
export interface SimulationEngine {
  readonly id: EngineId;
  readonly version: string;
  capabilities(): EngineCapabilities;
  run(input: SimulationInput): AsyncIterable<AgentEvent>;
}

export type { JourneyStage };
