import type { ProviderId } from '../core/domain';
import type { ModelProvider, StructuredRequest, StructuredResult } from './types';

/**
 * Live providers via the Vercel AI SDK.
 *
 * The SDK is imported DYNAMICALLY on purpose: if it cannot be resolved at
 * runtime, the chain simply advances to the deterministic tier instead of
 * taking the route down. A model layer is never allowed to be a single point of
 * failure for a demo.
 *
 * API NOTES (verified against ai@7.0.116 shipped types — see AGENTS.md §4):
 *  - `generateObject` is DEPRECATED; the current shape is `generateText` with
 *    `output: Output.object({ schema })`.
 *  - `instructions` is the current name for what used to be `system`.
 *  - `maxOutputTokens`, not `maxTokens`.
 *  - There is NO built-in cross-provider fallback in the SDK. This chain is ours
 *    and is a required component, not a convenience.
 *  - `streamRetries` defaults to 0 (disabled), so a mid-stream provider failure
 *    will not self-heal unless set.
 */

type LiveConfig = {
  id: ProviderId;
  modelId: string;
  envKey: string;
  load: () => Promise<(modelId: string) => unknown>;
};

function googleConfig(): LiveConfig {
  return {
    id: 'google',
    modelId: process.env.CONTENT_ROOM_GOOGLE_MODEL ?? 'gemini-2.5-flash',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    load: async () => {
      const mod = await import('@ai-sdk/google');
      return (modelId: string) => mod.google(modelId);
    },
  };
}

function groqConfig(): LiveConfig {
  return {
    id: 'groq',
    modelId: process.env.CONTENT_ROOM_GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    load: async () => {
      const mod = await import('@ai-sdk/groq');
      return (modelId: string) => mod.groq(modelId);
    },
  };
}

function makeLiveProvider(config: LiveConfig): ModelProvider {
  return {
    id: config.id,
    get available() {
      return Boolean(process.env[config.envKey]);
    },

    async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const startedAt = Date.now();

      const [{ generateText, Output }, makeModel] = await Promise.all([
        import('ai'),
        config.load(),
      ]);

      const model = makeModel(config.modelId) as Parameters<typeof generateText>[0]['model'];

      const result = await generateText({
        model,
        output: Output.object({ schema: req.schema, name: req.task }),
        instructions: req.instructions,
        prompt: req.prompt,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        abortSignal: req.signal,
      });

      // The COMPLETE output is schema-validated by the SDK; we validate again so
      // a provider that ignores the schema cannot smuggle a malformed object in.
      const value = req.schema.parse(result.output);

      return {
        value,
        providerId: config.id,
        modelId: config.modelId,
        degraded: false,
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}

export function liveProviders(): ModelProvider[] {
  return [makeLiveProvider(googleConfig()), makeLiveProvider(groqConfig())];
}
