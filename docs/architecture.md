# Content Room — Architecture

**Status:** approved for implementation
**Supersedes:** the sketch in the original brief (§31). Deviations are listed in §9 with reasons.

---

## 1. Design principles

1. **Deterministic by default, model-assisted when available.** The product must produce a complete, credible result with zero API keys. AI raises fidelity; it is never a precondition for the demo.
2. **AI for language, code for arithmetic.** AI: semantic understanding, DNA, persona enrichment, reaction reasoning, explanation, strategy, rewriting. Deterministic code: validation, aggregation, percentages, comparisons, state transitions, IDs, routing, business rules, confidence, simulation bookkeeping. *(Brief §23.)*
3. **Every number is traceable.** No metric exists without a sample size `n` and a `method` string. No claim is rendered without its label.
4. **The audience is a held-constant variable.** Re-simulation reuses the same population by identity, and the code asserts it rather than trusting it.
5. **Stream, don't poll.** On Vercel Hobby there is nowhere durable for background work, so work runs inside the request the browser is already consuming.
6. **One event shape across all engines.** Modelled on OASIS's `trace(user_id, created_at, action, info)` so a future OASIS adapter changes nothing downstream.
7. **Pure core.** `src/core/` has no IO, no network, no LLM, no framework imports. It is the testable, trustworthy heart.

---

## 2. Layered structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  app/            Next.js App Router — pages, route handlers          │
│                  Thin. Validates input, delegates, streams output.   │
├──────────────────────────────────────────────────────────────────────┤
│  components/     shadcn/ui primitives + feature components           │
│                  Owns: TheRoom, DnaPanel, MetricsPanel, WhyPanel,    │
│                  BriefPanel, ComparisonPanel, DemoBadge              │
├──────────────────────────────────────────────────────────────────────┤
│  server/         Orchestration — the pipeline that composes          │
│                  ingest + providers + engines + core, and streams    │
│                  a RunEvent sequence. The only layer that wires      │
│                  everything together.                                │
├──────────────────────────────────────────────────────────────────────┤
│  ingest/         ContentImporter implementations                     │
│                  + ssrf-safe fetcher (the security boundary)         │
├──────────────────────────────────────────────────────────────────────┤
│  providers/      ModelProvider implementations (Gemini, Groq,        │
│                  OpenAI-compatible, Ollama, DeterministicFixtures)   │
│                  + ProviderChain + one module per AI task            │
├──────────────────────────────────────────────────────────────────────┤
│  engines/        SimulationEngine implementations                    │
│                  ├── DeterministicSimulationEngine   (DEFAULT)       │
│                  └── OasisSimulationEngine           (DEFERRED)      │
├──────────────────────────────────────────────────────────────────────┤
│  core/           PURE. No IO, no network, no LLM, no framework.      │
│    domain/         zod schemas + inferred types (the contracts)      │
│    analytics/      events[] → Metrics, Segments, Disagreement        │
│    comparison/     Metrics × Metrics → Comparison                    │
│    rng/            seeded PRNG (reproducibility)                     │
│    ids/            deterministic ids + content hashing               │
└──────────────────────────────────────────────────────────────────────┘
```

**Import rule, enforced by review and a lint rule:** `core/` imports nothing from the layers above it. `engines/` and `providers/` depend on `core/`, never on each other. `server/` is the only composer.

---

## 3. Data flow

```
                      ┌──────────────────────────────────────┐
   URL / pasted text  │            INGEST                    │
   ─────────────────► │  ssrf-safe fetch → OG/JSON-LD/oEmbed  │
                      │  → Readability (lazy) → normalize     │
                      │  on failure → ManualContentImporter   │
                      └──────────────┬───────────────────────┘
                                     ▼
                              ContentAsset
                                     │
                                     ▼
                      ┌──────────────────────────────────────┐
                      │      CONTENT DNA   (AI, validated)    │
                      │  hook · topic · promise · emotion ·   │
                      │  tone · cta · strengths · risks ·     │
                      │  frictions · audienceSignals          │
                      └──────────────┬───────────────────────┘
                                     ▼
                                 ContentDNA
                                     │
                                     ▼
                      ┌──────────────────────────────────────┐
                      │   AUDIENCE  (AI proposes segments,    │
                      │   deterministic code expands)         │
                      │  segments[] → archetypes → personas   │
                      │  seeded by audienceSeed               │
                      └──────────────┬───────────────────────┘
                                     ▼
                    Audience { audienceId, audienceSeed, populationHash, agents[] }
                                     │
                                     ▼
                      ┌──────────────────────────────────────┐
                      │   SIMULATION ENGINE  (streamed)       │
                      │   deterministic │ oasis (deferred)    │
                      │   emits AgentEvent[] over rounds      │
                      └──────────────┬───────────────────────┘
                                     ▼
                     AgentEvent { agentId, round, stage, action,
                                  intensity, reasons[], excerpt,
                                  evidenceRefs[] }
                                     │
                                     ▼
                      ┌──────────────────────────────────────┐
                      │   ANALYTICS   (PURE, deterministic)   │
                      │   events[] → Metrics · Segments ·     │
                      │   Disagreement · Evidence index       │
                      └──────────────┬───────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
      ┌──────────────────────────┐   ┌──────────────────────────────┐
      │   WHY  (AI, grounded)     │   │  VALIDATION LAYER            │
      │   cites metric → segment  │   │  state: 'not_established'    │
      │   → event → excerpt       │   │  (never fabricated)          │
      └──────────────┬───────────┘   └──────────────────────────────┘
                     ▼
                      ┌──────────────────────────────────────┐
                      │   CREATIVE DIRECTOR  (AI)             │
                      │   strongest signal · biggest risk ·   │
                      │   highest-impact change · top 3 ·     │
                      │   recommended hook + CTA · strategy   │
                      └──────────────┬───────────────────────┘
                                     ▼
                    CreativeBrief { ..., versionB: ContentAsset }
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
        Version A metrics                  RE-SIMULATE Version B
        (already computed)                 ** same audienceId **
                                           ** same audienceSeed **
                                           ** asserted, not trusted **
                                                      │
                                                      ▼
                      ┌──────────────────────────────────────┐
                      │   COMPARISON   (PURE, deterministic)  │
                      │   deltas + control-mode provenance    │
                      │   label: "Simulated change"           │
                      └──────────────────────────────────────┘
```

---

## 4. Core contracts

Authoritative TypeScript definitions live in `docs/api-contracts.md` and will be materialised in `src/core/domain/`. This section states the properties that matter architecturally.

### 4.1 `AgentEvent` — the universal interface between engines and analytics

```ts
type AgentEvent = {
  id: string;              // deterministic: hash(runId, agentId, round, stage, seq)
  runId: string;
  agentId: string;
  segmentId: string;       // denormalised so analytics needs no agent lookup
  round: number;           // 1-indexed tick
  stage: JourneyStage;     // exposure|attention|interpretation|response|decision|action
  action: ReactionAction | null;  // null until the action stage
  intensity: number;       // 0..1
  reasons: string[];       // machine-readable reason codes
  excerpt: string | null;  // short human-readable reaction fragment
  evidenceRefs: string[];  // DNA field paths or content spans this reaction rests on
  producedBy: EngineId;
};
```

`producedBy` is mandatory. Every event is attributable to the engine that emitted it, which is what makes the honesty labels automatable rather than a matter of discipline.

The shape deliberately mirrors OASIS's `trace(user_id INTEGER, created_at DATETIME, action TEXT, info TEXT)` where `agentId↔user_id`, `round+stage↔created_at` ordering, `action↔action`, and the structured remainder lives in `reasons`/`excerpt`/`evidenceRefs`. A future OASIS adapter performs a pure field mapping.

### 4.2 `Metric` — no number without provenance

```ts
type Metric = {
  id: MetricId;
  label: string;
  value: number;          // 0..100 for scaled metrics
  scale: 0 | 100;
  n: number;              // sample size — REQUIRED
  method: string;         // human-readable formula, e.g.
                          // "agents with action ∈ {SHARE} ÷ n"
  kind: 'simulated_estimate';  // literal type: cannot be confused with measured data
};
```

`kind` is a literal, not a string. It is impossible to construct a `Metric` that claims to be measured real-world data. The UI reads it to render the "Simulated" label, so the label cannot be forgotten.

### 4.3 Simulation engines

```ts
interface SimulationEngine {
  readonly id: EngineId;                        // 'deterministic' | 'oasis'
  readonly version: string;                     // bump on any reaction-model change
  capabilities(): EngineCapabilities;
  run(input: SimulationInput): AsyncIterable<AgentEvent>;
}

type EngineCapabilities = {
  streaming: boolean;
  reproducible: boolean;   // same input ⇒ identical events
  needsModel: boolean;
  maxPopulation: number;
};
```

`run` returns an **`AsyncIterable`**, not an array. This single choice is what lets the live room render progressively, and it lets a slow LLM engine and a fast deterministic engine share one interface. `reproducible` is declared *by the engine* and copied onto the `SimulationRun`, so the comparison UI can state honestly whether the re-run was a true controlled repeat or a resample.

### 4.4 Model providers and the fallback chain

```ts
interface ModelProvider {
  readonly id: ProviderId;
  readonly available: boolean;   // e.g. API key present in env
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

type StructuredResult<T> = {
  value: T;
  providerId: ProviderId;
  modelId: string;
  degraded: boolean;      // true when served by the fixture provider
  latencyMs: number;
};
```

The chain tries providers in order, skipping unavailable ones, and records `providerId` + `degraded` on the result. `DeterministicFixtureProvider.available` is hard-coded `true`, so the chain can always terminate. Downstream, `RunRecord.providers` aggregates which tiers actually served, and `DemoModeController` turns that into a single honest UI badge: **"Live"**, **"Degraded: fallback model"**, or **"Demo mode: deterministic fixtures"**.

**Note:** the Vercel AI SDK has **no built-in cross-provider fallback** (verified by inspecting the v7 runtime export list). This chain is ours and is a required component, not a convenience.

---

## 5. The determinism and same-audience contract

This is the mechanism that makes the product's central claim credible, so it is specified precisely.

**Audience identity.** An audience is generated from `audienceSeed` (a string) using a seeded PRNG plus stable archetype ordering. Same seed ⇒ identical agent ids, traits and segment membership.

```ts
type AudienceRef = {
  audienceId: string;      // hash(audienceSeed, dnaHash, archetypeSet, size)
  audienceSeed: string;
  populationHash: string;  // hash of the ordered persona list
  controlMode: 'same_population' | 'regenerated';
};
```

**Re-simulation rules.**
1. The Version B run **must** be constructed with the same `audienceId`, `audienceSeed` and `populationHash`.
2. The pipeline **asserts** `populationHash` equality and fails loudly on mismatch — it does not silently regenerate a different audience and call the comparison controlled.
3. Only the content changes between A and B. `SimulationRun.contentHash` differs; everything in `AudienceRef` is equal.
4. `Comparison.controlMode` is copied from the B run and rendered in the UI. `'regenerated'` can only ever be shown with an explicit warning.

**Honesty about reproducibility.** A deterministic engine yields identical events for identical input, so A→B difference is attributable entirely to content. An LLM engine holds the *population* constant but resamples *reactions*, so its `SimulationRun.reproducibility` is `'sampled'` and the comparison UI appends a visible caveat: *"Audience held constant. Reactions resampled."* Declaring this is a feature; hiding it would be the fabrication the brief forbids.

---

## 6. Streaming protocol

One HTTP response carries the whole run. Discriminated union of `RunEvent`:

| Event | Payload | UI effect |
|---|---|---|
| `run_started` | `runId`, `mode`, `engineId` | mount the room, show provider badge |
| `stage_changed` | `stage`, `label` | advance the journey indicator |
| `ingest_resolved` | `ContentAsset`, `source`, `partial: boolean` | fill the content panel; if `partial`, offer manual paste |
| `dna_ready` | `ContentDNA` | reveal DNA panel |
| `audience_ready` | `Audience` (without full persona text) | agents appear in the room |
| `round_started` | `round`, `ofRounds` | tick the clock |
| `agent_event` | `AgentEvent` | animate one agent's state; append to feed |
| `round_completed` | `round` | cluster/aggregate refresh |
| `metrics_ready` | `MetricsBundle` | reveal numbers |
| `why_ready` | `WhyReport` | reveal explanation with evidence links |
| `brief_ready` | `CreativeBrief` | reveal strategy |
| `versionb_ready` | `ContentAsset` | reveal Version B + diff |
| `resim_event` | `AgentEvent` | second pass animation |
| `comparison_ready` | `Comparison` | reveal before/after |
| `heartbeat` | `at` | keep intermediaries from closing the connection |
| `run_failed` | `stage`, `code`, `message`, `recovered` | show error state; if `recovered`, continue |

`heartbeat` is not optional: Vercel sends HTTP/2 `PING` frames but an idle HTTP/1.1 connection can be closed by an intermediary.

**Endpoints.**
- `POST /api/runs` → runs A end-to-end, streaming, stops after `versionb_ready`. Emits `runId`.
- `POST /api/runs/:id/resimulate` → runs B on the **same** audience, streaming, ends with `comparison_ready`.
- `GET /api/runs/:id` → the persisted `RunRecord`, for refresh recovery.

Splitting resimulation into its own endpoint is deliberate: it makes the "same audience, new content" step individually demonstrable and individually testable, and it matches the demo script's timing.

---

## 7. Persistence

```ts
interface RunStore {
  save(run: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  list(limit: number): Promise<RunRecord[]>;
}
```

- `MemoryRunStore` — default. Zero dependencies, always works. Satisfies "database unavailable" in the brief's failure list.
- `FileRunStore` — writes `.data/runs/*.json`. **Local development only.**

**Known constraint, stated plainly:** Vercel's serverless filesystem is read-only apart from `/tmp` and is not durable. There is therefore no persistent run history on the free tier. Consequences, accepted deliberately for the MVP: the demo is a single uninterrupted session, and a mid-run page refresh restarts that run. Runs are short and re-runnable by design, which is the mitigation. `FileRunStore` exists so local development and tests have real persistence; a durable hosted store is a post-MVP decision, not a hackathon task.

---

## 8. Security architecture

| Boundary | Untrusted input | Control |
|---|---|---|
| URL submission | arbitrary user URL | 12-point SSRF checklist in `docs/research.md` §5.6: scheme allowlist, credential rejection, port allowlist, full A/AAAA resolution, private/link-local/loopback range blocking, `redirect: 'manual'` with per-hop revalidation capped at 3, per-hop and total timeouts, response size cap, Content-Type allowlist, no oracle responses, per-client rate limit. Implemented once, in `ingest/ssrf-safe-fetch.ts`. |
| Imported content | HTML, metadata, model-visible text | Untrusted text is **never** interpolated as instruction. AI tasks wrap it in explicit `<untrusted_content>` delimiters and the instruction states that the delimited region is data to analyse, never instructions to follow. Length-capped per task. |
| Model output | text that must become a domain object | Validated against the task's Zod schema before it is trusted. Complete outputs are validated; **streamed partial objects are deep-partial and are treated as untrusted by the UI until the stream completes** (an AI SDK v7 property confirmed from its shipped types). |
| Tool arguments / API responses | malformed data | Schema at the boundary; malformed ⇒ typed error, never a partial write. |
| Persisted state | a `.data/*.json` file a user could hand-edit | Re-validated through `RunRecordSchema` on read. Never `JSON.parse` then cast. |
| Secrets | API keys | Server-only env vars. Never in source, never in client bundles, never logged, never echoed in error messages. Providers are instantiated server-side only. |

Also: no blind-SSRF oracle — upstream bodies, headers, status text and DNS/TLS error strings are never returned to the client; failures collapse to a generic typed error.

---

## 9. Deviations from the brief's proposed architecture

| Brief (§31 / §32) | Decision | Reason |
|---|---|---|
| `apps/web` + `apps/simulation` monorepo with `packages/*` | **Single Next.js app with enforced internal layering** (`core/` is the package boundary) | npm workspaces + Tailwind v4 + Next 16 transpilation adds real build friction. The brief permits simplification when research supports it, and the layering rule delivers the actual benefit — a pure core — without workspace overhead. A `packages/` split can happen later without touching domain code. |
| OASIS in the architecture diagram on the critical path | **`OasisSimulationEngine` deferred to a post-MVP adapter, out of process** | OASIS requires Python 3.10/3.11 (local default is 3.13.5), pulls PyTorch and native cairo, and every agent action is an LLM call — so it cannot satisfy the no-key requirement. Deferring it removes the largest schedule and reliability risk while keeping the abstraction that makes it pluggable. |
| `LocalSimulationEngine` as a separate engine | **Not created.** Two engines: `deterministic` (default) and `oasis` (deferred) | A third engine that is architecturally similar to the deterministic one is complexity without a distinct capability. The abstraction already permits adding it. |
| Background jobs / polling | **SSE streaming inside one request** | Vercel Hobby cron has a one-per-day minimum interval and `waitUntil` work is cancelled at the invocation deadline, so there is nowhere durable for a detached job to live. |
| `evals/` as the sole test location | `evals/` for AI-capability fixtures **plus** `tests/` for deterministic unit and golden tests | Deterministic core and non-deterministic AI capabilities need different harnesses and different failure semantics. |
| Validation layer with metrics (MAE, RMSE, Brier…) | **Validation layer exists and reports `state: 'not_established'`** | The brief forbids fabricating validation results. The interface and eval scaffolding ship; the numbers do not exist yet, and the type says so. |

---

## 10. Reliability and degradation

Every external dependency has a defined fallback, and each row is a required eval case:

| Dependency | Failure | Behaviour |
|---|---|---|
| URL ingestion | blocked / 403 / timeout / unsupported platform | `partial: true`, manual paste offered and pre-filled with whatever metadata resolved |
| Primary model (Gemini) | 429 / 5xx / timeout | chain advances to Groq |
| All models | unavailable or no keys | fixture provider serves schema-valid output; `degraded: true`; UI badge "Demo mode" |
| Model returns invalid JSON | schema violation | one `repairText` attempt, then one retry, then next provider |
| OASIS | not installed / not configured | engine simply absent from the registry; default engine unaffected |
| Persistence | no durable store on serverless | `MemoryRunStore`; run continues in-request |
| Client disconnect | browser closes mid-run | stream aborts; `AbortSignal` propagates; no work continues unstoppably |
| Any single stage | throws | `run_failed` with `recovered: true` when the stage had a fallback and the run continued |

The invariant: **no single failure produces a blank screen.** Worst case is a complete demo-mode run with every output labelled.
