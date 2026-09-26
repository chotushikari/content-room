import type { ModelProvider, StructuredRequest, StructuredResult } from '../types';

/**
 * The deterministic heuristic tier — always available, always terminates.
 *
 * This is the last link in the provider chain and the reason Content Room works
 * with no API keys, no network and no database. It does not return canned
 * fixtures: it computes a real answer from the actual domain objects via the
 * `deterministic` closure supplied with every request.
 *
 * `available` is hard-coded true. There is no configuration in which the chain
 * runs out of options.
 */
export const deterministicProvider: ModelProvider = {
  id: 'fixtures',
  available: true,

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const startedAt = Date.now();
    const value = req.deterministic();
    // Validate our own output through the same schema the model must satisfy,
    // so a heuristic bug surfaces here rather than corrupting the run.
    const parsed = req.schema.parse(value);

    // A small, honest delay: instantaneous output would make the UI flash and
    // would misrepresent this tier as faster than it is.
    await new Promise((resolve) => setTimeout(resolve, 60));

    return {
      value: parsed,
      providerId: 'fixtures',
      modelId: 'deterministic-heuristic-v1',
      degraded: true,
      latencyMs: Date.now() - startedAt,
    };
  },
};
