<div align="center">

# Content Room

**Rehearse before you publish.**

Put any piece of content in front of a simulated audience and find out how it lands —<br>
before the real one sees it.

[**Live demo →**](https://content-room-dun.vercel.app) &nbsp;·&nbsp; [Architecture](docs/architecture.md) &nbsp;·&nbsp; [Contracts](docs/api-contracts.md) &nbsp;·&nbsp; [Research](docs/research.md)

[![CI](https://github.com/chotushikari/content-room/actions/workflows/ci.yml/badge.svg)](https://github.com/chotushikari/content-room/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-151%20passing-2ea44f)](#testing)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.6-000?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.3-087ea4?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Runs without API keys](https://img.shields.io/badge/runs%20with-no%20API%20keys-2ea44f)](#it-works-with-no-api-keys-at-all)

</div>

---

## Reviewing this repository? Start here

Everything below is checkable. This is the fast path.

```bash
git clone https://github.com/chotushikari/content-room.git
cd content-room
npm install
npm run verify     # typecheck + 151 tests + production build, no API keys needed
```

`npm run verify` should finish green in about 30 seconds. It ran in CI on every push — see the badge above.

Then, to watch the whole journey run headlessly in ~1.5s and print its own numbers:

```bash
npm run demo
```

### Claim → how to verify it

Each row is a specific assertion this project makes, and the one command that shows whether it is true.

| Claim | Verify with | What you should see |
|---|---|---|
| It runs with **no API keys, no network, no database** | `npm run verify`, `npm run demo` | Green, and a completed run in demo mode |
| The simulation is **deterministic and order-independent** | `npx vitest run tests/core.test.ts` | Byte-identical output across runs; shuffled order yields the same event set |
| The **same audience** is held constant across a re-test | `npx vitest run tests/core.test.ts` | Identical `populationHash` for a seed; `AudienceMismatchError` when it differs |
| The model **can't become a rubber stamp** | `npx vitest run tests/features.test.ts` | Weak content scores *below* strong content; a unanimous run fails |
| **No number can claim to be real-world data** | `npx vitest run tests/contracts.test.ts` | `Metric` without `n`, or with `kind: 'measured'`, is rejected |
| **URL fetching is SSRF-safe** | `npx vitest run tests/ingest.test.ts` | Loopback, RFC1918, cloud metadata, IPv6, `file:` and hostile Unicode all blocked |
| The price of a metric's derivation is **stated, not implied** | click the score in the live app | Every metric exposes `n` and its formula |
| **No secrets are committed** | `git grep -nE 'AIza\|gsk_\|sk-'; ls .env.local` | No matches; file absent (gitignored). CI enforces this too |

### What is *not* done

Stated up front so it is not mistaken for a gap in the claims:

- **No predictive validation.** Nothing here has been compared against a real-world outcome. See [Honesty](#honesty-is-enforced-by-the-types-not-by-discipline).
- **No predictive validation.** Nothing here has been compared against a real-world outcome. See [Honesty](#honesty-is-enforced-by-the-types-not-by-discipline).
- **No durable run history.** Free-tier serverless has no writable filesystem; a mid-run refresh restarts that run.

---

## What it does

Paste a post, an ad, an email, a script, or a link. Content Room builds a synthetic audience **from the content itself**, runs them through the journey a real reader takes, and answers five questions on one screen:

| Question | Answer |
|---|---|
| Is it good? | a score out of 100 and a band: Weak / Mixed / Solid / Strong |
| Will they like it? | how each audience segment reacts, and which metric that segment loses it on |
| What do you think? | two or three sentences of plain opinion |
| What do I change? | three concrete changes, each with the rewritten text ready to copy |
| Will it spread? | Low / Moderate / High amplification potential |

Then **Test it** re-runs the *same* simulated audience against the rewrite, so you can see whether the room actually changed.

A second view, **Agents**, makes the audience accountable one member at a time — archetype, motivation, disposition, where they got to in the journey, what they did, the reasoning fragment the engine produced for them, and a confidence figure carrying its own `(Simulated Estimate, n=…)` label. A simulated audience that cannot be inspected per member is just a number that appeared.

<p align="center">
  <img src="docs/screenshots/verdict.png" alt="The verdict: 76 out of 100, Strong, with per-segment reaction, the read, and three changes" width="900">
</p>

## The part that matters: a controlled re-test

Anyone can generate a rewrite. The hard question is whether the rewrite is actually *better* — and answering that properly means holding the audience constant.

The audience is therefore a **fixed population derived from a seed**. Version A and Version B run against the same agents, and the code **asserts** the population hash matches instead of trusting it:

```ts
assertSamePopulation(audience.ref, recheck);   // throws AudienceMismatchError on mismatch
```

Every comparison carries a mandatory caveat, and which one depends on provenance:

| Situation | What the user is told |
|---|---|
| Same population, reproducible engine | *"Simulated change. Same synthetic audience; population hash verified. Both runs are reproducible, so the difference is attributable to the content."* |
| Same population, sampled reactions | *"Audience held constant. Reactions resampled."* |
| Audience regenerated | *"WARNING: the audience was regenerated, so this is NOT a controlled comparison."* |

<p align="center">
  <img src="docs/screenshots/comparison.png" alt="Before and after: Version A at 42, Version B at 76, same verified audience" width="900">
</p>

## Inside the room

Every agent moves through the six stages a real reader does — exposure → attention → interpretation → response → decision → action — and ends with one of `STOP` `IGNORE` `LIKE` `COMMENT` `SHARE` `SAVE` `FOLLOW` `CLICK` `BUY` `REJECT`.

The room encodes exactly three things and nothing else: **fill** is stage (valence once they have acted), **halo** is reaction intensity, **proximity** is segment grouping.

<p align="center">
  <img src="docs/screenshots/room.png" alt="The live room: agents clustered by segment, coloured by stage and reaction" width="900">
</p>

## Architecture

```
                        ┌──────────────────────────────┐
   URL / pasted text ──►│  INGEST (SSRF-guarded)       │
                        │  metadata → article → paste  │
                        └──────────────┬───────────────┘
                                       ▼  ContentAsset
                        ┌──────────────────────────────┐
                        │  CONTENT DNA      (AI)       │
                        │  model writes prose;         │
                        │  a composer builds the shape │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  CONTEXTUAL AUDIENCE         │
                        │  AI proposes segments,       │
                        │  seeded code builds agents   │
                        └──────────────┬───────────────┘
                                       ▼  AudienceRef{ populationHash }
                        ┌──────────────────────────────┐
                        │  SIMULATION ENGINE (streams) │
                        │  deterministic │ oasis†      │
                        └──────────────┬───────────────┘
                                       ▼  AgentEvent[]
                        ┌──────────────────────────────┐
                        │  ANALYTICS   (pure, no AI)   │
                        └──────────────┬───────────────┘
                          ┌────────────┴────────────┐
                          ▼                         ▼
                   WHY (AI, grounded)        VALIDATION
                          │                   (not established)
                          ▼
                  CREATIVE DIRECTOR → VERSION B
                          ▼
              SAME AUDIENCE → RE-SIMULATE → COMPARISON

† OASIS is a deferred post-MVP adapter — see docs/architecture.md §9
```

**The rule that holds it together:** AI handles language; deterministic code handles every number. Validation, aggregation, percentages, comparisons, IDs, state transitions and business rules are pure functions with tests. No metric in this product originates from a language model.

### The interface is event-sourced

One append-only `RunEventLog` is the only source of truth. One **pure** reducer derives all display state. Every panel is a projection of it, which means a result **cannot appear before its cause** — the station rail unlocks from events, not from a step counter. The console beside the room shows every frame as it arrives, with the gap since the previous one.

600-event runs are batched into animation frames rather than rendered per event, so the room animates smoothly. The raw console, the per-type ledger and the reaction feed are part of the product: a simulation you cannot inspect is not persuasive. Details in [`docs/event-driven-ui.md`](docs/event-driven-ui.md).

## It works with no API keys at all

This is not a fallback. It is the default architecture.

The simulation engine is deterministic and ours: no model calls, no network, no clock, no `Math.random()`. Every sampled value is derived from `(seed, agentId, round)`, which makes runs **order-independent and byte-identical across replays**.

Model providers are a tier on top:

```
Gemini  →  Groq  →  deterministic heuristic
```

The final tier is not a model. It is a real analyser that reads the actual text — and because every AI task **must** supply a deterministic answer, a request that could leave the user with nothing cannot be constructed:

```ts
type StructuredRequest<T> = {
  task: AiTaskId;
  schema: ZodType<T>;
  instructions: string;
  prompt: string;
  deterministic: () => T;   // REQUIRED — the chain can always terminate
};
```

**Verified in production:** a full run served by the model across all four tasks, `degraded=false`, in about 11 seconds.

```
content_dna        groq/openai/gpt-oss-120b   2407ms
audience_segments  groq/qwen/qwen3.8-27b      1237ms
why_report         groq/openai/gpt-oss-20b     970ms
creative_brief     groq/openai/gpt-oss-120b   2132ms
```

## Honesty is enforced by the types, not by discipline

The promises this product makes are properties of the schema, so a future change cannot quietly drop one:

| Promise | Enforced by |
|---|---|
| No number without a sample size | `Metric.n` is required |
| No number claims to be real-world data | `Metric.kind` is the literal `'simulated_estimate'` |
| No comparison without a caveat | `Comparison.caveats` has `min(1)` |
| No explanation without evidence | `WhyReport.biggestSignal.evidence` has `min(1)` |
| No unvalidated accuracy claim | `ValidationStatus` reports `'not_established'`, and its calibrated branch requires `n` and a named method |

There is no benchmark. Nothing here has ever been compared against a real-world outcome, so the app says so on every screen rather than inventing a number.

**This is a rehearsal environment, not a prediction engine.** It is genuinely good at telling you which of two versions of *your own* content a given audience prefers. It is not evidence about the real world.

## Project structure

```
src/
├── core/                    PURE — no IO, no network, no model, no clock
│   ├── domain/              the Zod contracts every layer builds against
│   ├── analytics/           events → metrics, segments, disagreement
│   ├── audience/            seeded population construction
│   ├── comparison/          before/after, with mandatory caveats
│   ├── features/            deterministic text analysis
│   ├── ids/  rng/           reproducible identity and randomness
│   └── summary.ts           the score, the verdict, the changes
├── engines/                 SimulationEngine implementations
│   └── deterministic/       the default engine — coefficients, model, excerpts
├── providers/               model tiers
│   ├── chain.ts             fallback + failure classification
│   ├── live.ts              Gemini / Groq, with model overrides
│   ├── tasks*.ts            one module per AI task, each with a composer
│   └── deterministic/       the offline analyser and rewriter
├── ingest/                  SSRF-guarded fetching, metadata, article extraction
├── lib/                     event log, reducer, SSE, stream hook
├── components/              the event-sourced interface
├── server/                  the run pipeline — the only layer that composes
└── fixtures/velloe/         the demo scenario (a fixture, never the domain)

tests/       151 deterministic tests — contracts, core, security, ingest, agents
evals/       golden / regression / adversarial AI-capability fixtures
docs/        13 documents — research, architecture, contracts, simulation, validation
tasks/       13 task specs used to build this
scripts/     demo, preflight, model probe
```

## Quick start

```bash
npm install
cp .env.example .env.local     # every key is optional
npm run dev
```

Open http://localhost:3000 and either paste something, or press **Review it** with the box empty to load the worked example.

### Commands

```bash
npm run dev         # local dev server
npm run build       # production build
npm run verify      # typecheck + tests + build
npm run test        # 151 deterministic tests
npm run demo        # headless full run with stage timings
npm run preflight   # everything a demo needs checked, before you present
npm run probe       # inspect the reaction model's inputs and sensitivity
```

## API keys

**You need none.** A key upgrades the *wording* of the analysis; the score, the segments, the simulation and the comparison come from our own code either way.

| Provider | Key | Status |
|---|---|---|
| **Groq** | `GROQ_API_KEY` | **Verified in production** — a full run served across all four tasks |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | Supported; the development key had depleted credits → 402 |
| OpenRouter | `OPENROUTER_API_KEY` | Any OpenAI-compatible endpoint also works |

### Four things that took calling the API to discover

Each of these fails *silently* — the chain degrades to the deterministic tier and the run looks like it succeeded, so the badge is the only clue.

1. **Model ids drift.** `gemini-2.5-flash` authenticates and still appears in the models list, but returns 404 on `generateContent` ("no longer available to new users"). `llama-3.3-70b-versatile` is not in the current Groq model list at all. Both defaults were wrong.
2. **Providers demand different schema strictness.** Groq runs structured output in strict mode, which requires *every* property in `required`. One optional field made every request fail with a 400.
3. **Provider-wide and request-level failures are different things.** A `400` from one incompatible schema was treated as provider-wide, which removed a working provider for an entire run. Now `401/402/403` quarantine the provider, `400/404/422` skip one request, and a stochastic *generation* failure is retried while a schema *definition* failure is not.
4. **A valid key can still fail on billing.** Google keys authenticate fine and return `402 "prepayment credits are depleted"` when the project has billing enabled with exhausted credits — such a project does **not** fall back to the free tier.

Also measured: Groq's free tier applies an **org-level** tokens-per-minute limit shared across all models, so spreading tasks across different models does *not* help. Keeping per-call input budgets modest does — `content_dna` was being sent 20,000 characters for a single read, now 6,000.

Full detail in [`docs/api-keys.md`](docs/api-keys.md).

## Testing

**151 tests**, deterministic and offline — no live network calls and no model calls in the suite, so CI needs no secrets and cannot go red for external reasons.

```bash
npm run test
```

What they actually protect:

- **Determinism** — byte-identical output across runs, with order-independence *proven* rather than assumed
- **The same-audience guarantee** — identical `populationHash` for a given seed, and a thrown `AudienceMismatchError` when it differs
- **Model sensitivity** — deliberately weak content must score *below* deliberately strong content, and a run where every agent approves **fails**. Unanimity means the model has become a rubber stamp, so it is treated as a bug rather than a good result
- **Analytics purity** — with metrics recomputed independently in the test rather than by calling the implementation
- **SSRF** — loopback, RFC1918, link-local (including cloud metadata), IPv6 and IPv4-mapped forms, credential-bearing URLs, non-HTTP schemes and hostile Unicode, all blocked, with `URL_BLOCKED` and `IMPORT_FAILED` indistinguishable so the endpoint is not a network probe
- **Schema obligations** — the five promises above, each asserted to be *unconstructable* when violated
- **Ingest robustness** — attribute-order-independent metadata parsing, numeric HTML entities, and a link-density gate that rejects navigation pages

## Deployment

Deployed on Vercel's free tier. Route handlers run on Node with `maxDuration = 120` and stream results as server-sent events.

Streaming rather than polling is a forced design, not a preference: on the free tier cron has a one-per-day minimum interval, and `waitUntil` promises are cancelled at the invocation deadline, so there is **nowhere durable for a detached job to live**. The simulation therefore runs inside the request the browser is already consuming.

One consequence worth knowing: serverless instances do not share memory, so the re-simulation request carries back the context it received, and the population hash is re-derived and asserted server-side regardless. Tested in production with a deliberately bogus run id to prove it does not depend on instance reuse.

## Known limitations

Stated here rather than only in the code:

1. **The simulation coefficients are hand-authored hypotheses.** They were reasoned out, not fitted to any observed outcome. There is no benchmark.
2. **The offline rewrite and the offline analyser share a feature model.** `heuristicRewrite` moves forward the sentence `extractFeatures` identifies as the value proposition, so part of Version B's improvement is guaranteed by construction. The live model path does not have this circularity. See [`docs/simulation.md`](docs/simulation.md) §8.6.
3. **`attention` measures engagement across all rounds**, so it answers "did they engage at all", not "did the opening work".
4. **URL import reads text, not social posts.** Instagram, LinkedIn and Facebook are refused outright because their terms prohibit automated reading; X, TikTok and Threads are refused because they only serve posts to a logged-in browser (verified: an x.com post returns HTTP 404 even from its own oEmbed endpoint). Other unreadable links degrade to the paste path rather than failing. YouTube yields title and description, not a transcript — there is no sanctioned no-auth path to captions. **Images are shown but not read**, because the configured models are text-only; alt text is extracted and used. See [`docs/api-keys.md`](docs/api-keys.md).
5. **The live model path has far less test coverage than the deterministic path**, which is the default for exactly that reason.
6. **Per-agent confidence is the simulation's own resolution**, not a probability that the agent is right about the real world. It is labelled accordingly wherever it is shown.

## Documentation

| Document | Contents |
|---|---|
| [`docs/verdict.md`](docs/verdict.md) | How the score, the opinion, the changes and the viral read are computed |
| [`docs/event-driven-ui.md`](docs/event-driven-ui.md) | The event log, the reducer, and the per-agent inspector |
| [`docs/event-driven-ui.md`](docs/event-driven-ui.md) | The event log, the reducer, and why a panel cannot precede its cause |
| [`docs/architecture.md`](docs/architecture.md) | Layers, data flow, the determinism contract, security boundaries |
| [`docs/api-contracts.md`](docs/api-contracts.md) | **Frozen Zod contracts** — the interface everything else builds against |
| [`docs/simulation.md`](docs/simulation.md) | The reaction model, and an honest list of its limitations |
| [`docs/validation.md`](docs/validation.md) | Correctness vs predictive validity; what we can and cannot claim |
| [`docs/research.md`](docs/research.md) | Open-source research, with a source for every claim |
| [`docs/open-source.md`](docs/open-source.md) | Reuse decisions and the license risk register |
| [`docs/api-keys.md`](docs/api-keys.md) | Which keys are needed, and the failure modes to expect |
| [`docs/product.md`](docs/product.md) | What this is, who it is for, what it refuses to be |
| [`docs/ui-ux.md`](docs/ui-ux.md) | Design tokens, the room specification, the copy guide |
| [`docs/deployment.md`](docs/deployment.md) | Vercel constraints and the deploy checklist |
| [`docs/demo.md`](docs/demo.md) | The 90-second script and the failure matrix |
| [`AGENTS.md`](AGENTS.md) | Operating contract for contributors |
| [`SECURITY.md`](SECURITY.md) | Threat model, SSRF controls, secret handling |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, and the four rules that are not negotiable |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, what was measured, what turned out to be wrong |

## Prior art and licensing

MIT licensed. The dependency set is MIT / ISC / Apache-2.0 throughout, and **no copyleft code was copied** — including from projects used as architectural references.

- **[OASIS](https://github.com/camel-ai/oasis)** (Apache-2.0) — the `trace(user_id, created_at, action, info)` event-log shape that our `AgentEvent` mirrors, so a future OASIS adapter is a pure field mapping. Deferred as an out-of-process adapter because it requires Python 3.10/3.11, pulls PyTorch, and needs a model call per agent action — incompatible with the zero-key requirement.
- **[MiroFish](https://github.com/666ghj/MiroFish)** (AGPL-3.0) — architectural and UI reference for the pipeline and the event-driven monitoring view. **No code copied**, out of respect for its license, despite it being strong validation of the category.
- **[Vercel AI SDK](https://ai-sdk.dev)** (Apache-2.0) — structured generation and provider abstraction.
- **[Readability](https://github.com/mozilla/readability)** + **[linkedom](https://github.com/WebReflection/linkedom)** — article extraction, lazily loaded so the common path stays cheap.
- **[d3-force](https://github.com/d3/d3-force)**, **[Tailwind CSS](https://tailwindcss.com)**, **[Motion](https://motion.dev)**, **[Lucide](https://lucide.dev)** — the interface.

Research found that no existing open-source project holds an audience fixed and re-tests improved content against it as a controlled comparison. That gap is what this is built around.

---

<div align="center">

*We don't just generate content. We let you rehearse it.*

</div>
