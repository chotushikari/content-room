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

/**
 * Default model ids.
 *
 * VERIFIED against the live API on 2026-09-26, not chosen from memory. The
 * previous default was `gemini-2.5-flash`, which authenticates fine and still
 * appears in the models list, but returns 404 on `generateContent` with
 * "no longer available to new users". That failure is silent in a fallback
 * chain: the run simply degrades to the deterministic engine and looks like it
 * worked. Only calling the API revealed it.
 *
 * Aliases like `gemini-flash-latest` also exist and survive model churn, but a
 * pinned id is used here because run reproducibility matters — regression
 * snapshots in evals/ should not silently change because Google moved an alias.
 */
const GOOGLE_DEFAULT_MODEL = 'gemini-3.8-flash';
/**
 * VERIFIED against the live Groq API on 2026-09-26. The previous guess,
 * `llama-3.3-70b-versatile`, is NOT in this key's model list and would have
 * 404'd — the same stale-model-id trap as Gemini, caught the same way: by
 * calling the API instead of trusting a default.
 *
 * Available to this key: openai/gpt-oss-120b, openai/gpt-oss-20b,
 * qwen/qwen3.8-27b, allam-2-7b. The 120b is used for quality.
 */
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';

type LiveConfig = {
  id: ProviderId;
  modelId: string;
  envKey: string;
  load: () => Promise<(modelId: string) => unknown>;
  /**
   * Per-provider request options.
   *
   * Groq runs structured output in STRICT schema mode by default, which requires
   * every property to be listed in `required`. Our ContentDNA has an optional
   * `span` field on frictions, so the request was rejected with a 400:
   *   "invalid JSON schema for response_format ... must be listed in required: span"
   * Disabling strict mode is correct here rather than reshaping the schema,
   * because the AI SDK still validates the parsed object against the same Zod
   * schema in this file before it is returned — so nothing unvalidated gets past.
   */
  providerOptions?: Record<string, Record<string, unknown>>;
};

function googleConfig(): LiveConfig {
  return {
    id: 'google',
    modelId: process.env.CONTENT_ROOM_GOOGLE_MODEL ?? GOOGLE_DEFAULT_MODEL,
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
    modelId: process.env.CONTENT_ROOM_GROQ_MODEL ?? GROQ_DEFAULT_MODEL,
    envKey: 'GROQ_API_KEY',
    providerOptions: { groq: { strictJsonSchema: false } },
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
        ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
      } as Parameters<typeof generateText>[0]);

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
