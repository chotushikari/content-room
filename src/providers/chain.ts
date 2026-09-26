import type { ProviderUsage, RunMode } from '../core/domain';
import { deterministicProvider } from './deterministic';
import { liveProviders } from './live';
import type { AiTaskId, ModelProvider, StructuredRequest, StructuredResult } from './types';

/**
 * The provider chain: live -> fallback -> deterministic heuristic.
 *
 * The Vercel AI SDK has NO built-in cross-provider error fallback (verified by
 * inspecting the v7 runtime export list), so this is ours and it is a required
 * component rather than a convenience.
 *
 * The chain records which tier actually served each task, which is what lets
 * the UI state its mode honestly instead of guessing from configuration.
 */
export class ProviderChain {
  private readonly providers: ModelProvider[];
  private readonly usage: ProviderUsage[];
  private readonly forceDemo: boolean;

  constructor(options: { forceDemo?: boolean } = {}) {
    this.providers = liveProviders();
    this.usage = [];
    this.forceDemo = options.forceDemo ?? false;
  }

  /**
   * Generate a structured result, falling through the tiers.
   *
   * Guaranteed to return: `StructuredRequest.deterministic` is required, so the
   * final tier can always answer. A throw here would be a bug, not a
   * configuration problem.
   */
  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const candidates = this.forceDemo ? [] : this.providers.filter((p) => p.available);

    for (const provider of candidates) {
      // One retry per provider: transient 429s and malformed single responses
      // are common enough that a retry is worth more than an immediate demotion.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await provider.generate(req);
          this.record(req.task, result);
          return result;
        } catch (error) {
          if (req.signal?.aborted) throw error;
          if (attempt === 1) break; // demote to the next provider
        }
      }
    }

    const result = await deterministicProvider.generate(req);
    this.record(req.task, result);
    return result;
  }

  private record(task: AiTaskId, result: StructuredResult<unknown>): void {
    this.usage.push({
      task,
      providerId: result.providerId,
      modelId: result.modelId,
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
    });
  }

  /**
   * The mode is derived from what ACTUALLY served the run, never from
   * inspecting configuration. A degraded run cannot be presented as live.
   */
  mode(): RunMode {
    if (this.usage.length === 0) return 'demo';
    const degraded = this.usage.filter((u) => u.degraded).length;
    if (degraded === this.usage.length) return 'demo';
    if (degraded > 0) return 'degraded';
    return 'live';
  }

  providerUsage(): ProviderUsage[] {
    return [...this.usage];
  }
}

export const PROVIDER_TIER_ORDER = [
  'google',
  'groq',
  'fixtures (deterministic heuristic)',
] as const;
