# 004 — Content DNA

## TASK

Build the provider abstraction, the fallback chain, and the `content_dna` AI task.

## CONTEXT

This task establishes the pattern every later AI task copies, so the abstraction matters more than the DNA prompt itself. Two verified facts shape it:

1. The Vercel AI SDK has **no built-in cross-provider fallback** — checked against the v7 runtime export list. The chain is ours and is a required component.
2. `generateObject` is **deprecated** in `ai@7.0.116`; the current shape is `generateText` with `output: Output.object({ schema })`. See `AGENTS.md` §4.

The chain's terminal tier is not a model — it is a deterministic fixture provider. That is what makes "works with no API keys" true rather than aspirational.

## OBJECTIVE

1. `ModelProvider` interface and `ProviderChain` with ordered fallback and per-result provenance.
2. `GoogleProvider` (primary), `GroqProvider` (fallback), `OpenAICompatibleProvider`, `OllamaProvider` (local), `DeterministicFixtureProvider` (always available).
3. The `content_dna` task: schema, instruction with injection-resistant wrapping, input cap, fixture.
4. `DnaPanel` UI.
5. `DemoModeController` resolving Live / Degraded / Demo from actual provider usage — not from configuration inspection.

## ACCEPTANCE CRITERIA

- [ ] With **no** API keys set, a DNA is produced from fixtures, the complete journey continues, and `mode === 'demo'`.
- [ ] With a primary key that returns 429, the chain advances and `mode === 'degraded'`.
- [ ] `StructuredResult` carries `providerId`, `modelId`, `degraded`, `latencyMs`; these propagate into `RunRecord.providers`.
- [ ] `DeterministicFixtureProvider.available` is hard-coded `true`, so the chain can always terminate.
- [ ] `streamRetries` is set explicitly — its default of `0` silently prevents mid-stream recovery.
- [ ] Malformed JSON triggers exactly one `repairText` attempt, then one retry, then the next provider. Never an uncaught throw.
- [ ] An injection string in the content produces a DNA that *describes* the injection, never one that obeys it.
- [ ] No API key or upstream error body appears in any log or client payload.
- [ ] `DnaPanel` renders every DNA field; a legitimately empty `visualStyle` does not leave a blank gap.

## CONSTRAINTS

- Install `ai@7.0.116`, `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/openai-compatible`, `zod@4`. Record each in `docs/open-source.md` §1.
- Verify the installed API from `node_modules/ai/dist/index.d.ts` before writing model code. Do not write from memory.
- Write the chain **once**, generically. Do not special-case tasks inside it.
- Content is untrusted: wrap it in `<untrusted_content>` delimiters with the shared instruction from `docs/api-contracts.md` §12.
- Providers are server-only modules. No provider code may be reachable from a client component.
- Do not build the audience, why, brief or rewrite tasks — those are 005, 008, 009, 010. Only `content_dna` here, as the pattern setter.

## IMPLEMENTATION

1. `src/providers/types.ts` — `ModelProvider`, `StructuredRequest<T>`, `StructuredResult<T>`.
2. `src/providers/chain.ts` — skip unavailable, try in order, record provenance, emit a typed `ErrorCode` only when every tier fails (which would itself be a bug, since fixtures are always available).
3. `src/providers/google.ts`, `groq.ts`, `openai-compatible.ts`, `ollama.ts`. Model ids from env with sane defaults. `maxRetries` and `streamRetries` set deliberately.
4. `src/providers/fixtures/index.ts` — loads typed fixtures, simulates realistic latency so the UI does not flash, and always returns schema-valid data.
5. `src/providers/tasks/content-dna.ts` — schema (reuse `ContentDNASchema`), instruction, 20,000-char cap with explicit truncation, fixture, and a `taskId` registered in the registry.
6. `src/server/demo-mode.ts` — `DemoModeController` resolving mode from the provider usage actually observed during the run.
7. `DnaPanel` per `docs/user-journey.md` §2 Station 1 and the tokens in `docs/ui-ux.md` §3.
8. `DemoBadge` wired to the resolved mode.

## TESTS

- `tests/chain.test.ts` — ordering, skipping unavailable providers, provenance, and that a failing primary falls through. Use stub providers; no network.
- `tests/provider-contract.test.ts` — every registered provider satisfies the interface and every provider module is server-only.
- `tests/fixtures-valid.test.ts` — every fixture parses against its task schema. A fixture that fails its own schema is a demo outage waiting to happen; this test is the guard.
- `tests/injection.test.ts` — the cases from `docs/validation.md` §4 `adversarial.json`.
- `tests/no-secret-leak.test.ts` — scan all error paths for key material.

## BROWSER VERIFICATION

All ten checks in three configurations: no keys (Demo), valid key (Live), and a forced primary failure (Degraded). Confirm the badge is correct in each and that no configuration makes a degraded run look live.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification
### Risks            (must state which tiers were actually exercised, and which were not)
### Next recommended task
```
