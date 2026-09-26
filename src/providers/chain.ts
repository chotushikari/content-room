import type { ProviderUsage, RunMode } from '../core/domain';
import { deterministicProvider } from './deterministic';
import { liveProviders } from './live';
import type { AiTaskId, ModelProvider, StructuredRequest, StructuredResult } from './types';

/**
 * Classify a provider failure.
 *
 *  - `retry`     — transient; one more attempt is worth the latency (429, 5xx).
 *  - `skip`      — terminal for THIS request only; move on without retrying and
 *                  without blaming the provider (400 bad schema, 404, 422).
 *  - `quarantine`— the provider itself is unusable for this run (401, 402, 403:
 *                  auth, billing, permission).
 *
 * The distinction between `skip` and `quarantine` matters, and getting it wrong
 * cost real debugging time: a 400 caused by ONE schema being incompatible with
 * Groq's strict mode was treated as provider-wide, so Groq was removed for the
 * entire run and every task silently fell to the deterministic tier. A
 * request-specific rejection must not disable a working provider.
 */
type FailureClass = 'retry' | 'skip' | 'quarantine';

function classify(error: unknown): FailureClass {
  const status = (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') {
    if ([401, 402, 403].includes(status)) return 'quarantine';
    if ([400, 404, 422].includes(status)) return 'skip';
    return 'retry'; // 408, 429, 5xx
  }

  const message = String((error as { message?: string })?.message ?? '').toLowerCase();
  if (/credit|billing|permission|unauthor|invalid api key|api key not valid/.test(message)) {
    return 'quarantine';
  }
  if (/invalid json schema|schema|no longer available|not found|model_not_found/.test(message)) {
    return 'skip';
  }
  return 'retry';
}

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
  /** Providers that failed terminally; skipped for the rest of this run. */
  private readonly quarantined = new Set<string>();

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
    const candidates = this.forceDemo
      ? []
      : this.providers.filter((p) => p.available && !this.quarantined.has(p.id));

    for (const provider of candidates) {
      // One retry ONLY for transient failures.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await provider.generate(req);
          this.record(req.task, result);
          return result;
        } catch (error) {
          if (req.signal?.aborted) throw error;

          const failure = classify(error);
          if (failure === 'quarantine') {
            // Provider-wide problem: stop offering it for the rest of the run.
            this.quarantined.add(provider.id);
            break;
          }
          if (failure === 'skip') {
            // This request will not succeed here; try the next provider.
            break;
          }
          if (attempt === 1) break; // transient and still failing: demote
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
