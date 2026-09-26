# Content Room

> **Rehearse before you publish.**

Content Room is an **AI-powered synthetic-audience rehearsal environment**. Put any piece of content in front of a simulated audience *before* you publish it, and find out what might happen, why it might happen, and what to change.

**Content goes in. A relevant audience forms. The audience reacts. The system explains why. The content improves. The same audience tests it again.**

---

## What it does

Any content — a social post, video, reel, ad, campaign, landing page, email, article, script, or launch concept.

1. **Ingest** — paste a URL or the content itself. Metadata is resolved where it legitimately can be; otherwise you paste, and the product stays useful rather than dead-ending.
2. **Understand** — the content is read into a **Content DNA**: hook, topic, promise, value proposition, emotion, tone, CTA, visual style, audience signals, strengths, risks, and likely friction points.
3. **Build a contextual audience** — the audience is *derived from the content*, not picked from a fixed list. Segments are proposed with a rationale, then expanded into a reproducible population of synthetic agents drawn from a 19-archetype library.
4. **Run the room** — agents move through exposure → attention → interpretation → response → decision → action, emitting structured reaction events (`STOP`, `IGNORE`, `LIKE`, `COMMENT`, `SHARE`, `SAVE`, `FOLLOW`, `CLICK`, `BUY`, `REJECT`).
5. **What happened** — deterministic aggregation into attention, ignore rate, clarity, trust, and share/save/comment/follow/click intent.
6. **Why** — an explanation grounded in the specific events, segments and excerpts that produced the numbers. Every claim links to its evidence.
7. **Creative Director → Version B** — strongest signal, biggest risk, highest-impact change, recommended hook and CTA, and an improved version with a change-by-change diff.
8. **Same audience, new content, re-simulation** — Version B is tested against the **same** synthetic population, with the population hash verified, and the two runs are compared.

## What it is not

Not a virality predictor. Not a survey. Not a replacement for real user research. It does not predict real-world reach, revenue or conversion, and it does not claim statistical representativeness.

**Every number is labelled as a simulated estimate.** The validation benchmark is *being established* — see `docs/validation.md`.

## The differentiator

Open-source research (`docs/research.md`, `docs/open-source.md`) found strong agent-simulation foundations — [OASIS](https://github.com/camel-ai/oasis) (Apache-2.0, 5.2k★) and [MiroFish](https://github.com/666ghj/MiroFish) (AGPL-3.0, 74k★, which itself runs on OASIS) — but **no project holds an audience fixed and re-tests improved content against it as a controlled comparison.** They simulate a world and produce a report.

That controlled re-test, plus honest labelling and a zero-dependency demo mode, is what Content Room adds.

## Why it works with no API keys

The default engine is a **deterministic** simulator we own: no model calls, reproducible, order-independent. AI raises fidelity when available; it is never a precondition. The full journey completes with no keys, no network and no database — with the mode stated openly in the UI:

| Badge | Meaning |
|---|---|
| **Live** | primary model provider served the run |
| **Degraded: fallback model** | primary failed, a fallback served it |
| **Demo mode: deterministic fixtures** | no keys, or all providers failed |

No configuration makes a degraded run look like a live one.

## Architecture in one picture

```
CONTENT → CONTENT DNA → CONTEXTUAL AUDIENCE → SIMULATION ENGINE → AgentEvent[]
                                                                        │
                                          ┌─────────────────────────────┤
                                          ▼                             ▼
                                   ANALYTICS (pure)              VALIDATION LAYER
                                          │                       (not established)
                                          ▼
                                    WHY (evidence-linked)
                                          │
                                          ▼
                              CREATIVE DIRECTOR → VERSION B
                                          │
                                          ▼
                        SAME AUDIENCE → RE-SIMULATE → COMPARISON
```

Full detail: `docs/architecture.md`. Frozen interfaces: `docs/api-contracts.md`.

**Design rule:** AI handles language; deterministic code handles every number. Validation, aggregation, percentages, comparisons, state transitions, IDs, routing, business rules, confidence and simulation bookkeeping are all pure functions with tests. No agent theatre.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16.3.6 (App Router) · React 19.3.0 · TypeScript strict |
| UI | Tailwind v4.3.3 · shadcn/ui · `motion` 13.4.4 · `lucide-react` |
| The Room | own `d3-force` + canvas component |
| Comparison | Recharts 3.10.1 |
| AI | Vercel AI SDK 7 (`ai@7.0.116`) · Zod 4 · Gemini primary → Groq fallback → deterministic fixtures |
| Simulation | `DeterministicSimulationEngine` (default) · `OasisSimulationEngine` (deferred adapter) |
| Persistence | `MemoryRunStore` (default) · `FileRunStore` (local dev only) |
| Deploy | Vercel Hobby · Node runtime · SSE streaming, not polling |

## Getting started

```bash
npm install
cp .env.example .env.local     # all keys optional — the app runs without any
npm run dev
```

Open http://localhost:3000 and either paste a URL, paste content, or load the Velloe demo scenario.

## Commands

```bash
npm run dev          # local dev
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint
npm run test         # deterministic unit + contract + security tests
npm run eval         # AI capability evaluation against evals/
npm run demo         # run the Velloe scenario headlessly, print stage timings
```

## Documentation

| File | Contents |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **Operating contract for contributors. Read this first.** |
| [`docs/product.md`](docs/product.md) | What we build, who for, what we refuse to build |
| [`docs/user-journey.md`](docs/user-journey.md) | The six stations and the screen inventory |
| [`docs/event-driven-ui.md`](docs/event-driven-ui.md) | **How the interface works: event log → reducer → panels** |
| [`docs/architecture.md`](docs/architecture.md) | Layers, data flow, determinism, security, deviations |
| [`docs/api-contracts.md`](docs/api-contracts.md) | **Frozen domain contracts** — the source of truth |
| [`docs/research.md`](docs/research.md) | Open-source research with sources for every claim |
| [`docs/open-source.md`](docs/open-source.md) | Reuse decisions and the license risk register |
| [`docs/simulation.md`](docs/simulation.md) | The reaction model, reproducibility, and its limitations |
| [`docs/validation.md`](docs/validation.md) | Correctness vs predictive validity; what we can and cannot claim |
| [`docs/ui-ux.md`](docs/ui-ux.md) | Design tokens, the Room specification, the copy guide |
| [`docs/deployment.md`](docs/deployment.md) | Vercel constraints and the deploy checklist |
| [`docs/demo.md`](docs/demo.md) | The 90-second script and the failure matrix |

## Status

Working end to end, and verified in a real browser.

| Area | State |
|---|---|
| Deterministic engine, analysis, aggregation, comparison | **Built and tested** (100 tests) |
| Event-driven interface (log, reducer, console, room, panels) | **Built and browser-verified** |
| Content DNA, contextual audience, WHY, Creative Director, Version B | **Built** (heuristic tier; model tier wired but unexercised here) |
| Same-audience re-simulation with hash assertion | **Built and verified** |
| URL ingestion with SSRF guard | **Built and tested**; resolves public metadata only |
| Live model providers (Gemini → Groq) | **Wired, not exercised** — no API key is configured in this environment |
| OASIS adapter | **Not built** (deliberately deferred, `docs/architecture.md` §9) |
| Predictive validation | **Not established**, and reported as such |

### Honest caveats

- The simulation coefficients are hand-authored hypotheses, never fitted to real outcomes.
- The offline rewrite and the offline analyser share a feature model, so part of Version B's improvement is guaranteed by construction. Stated in `docs/simulation.md` §8.6.
- No live-model run has been performed here, because no relevant API key exists in this environment.

## Prior art

Content Room builds on the shoulders of excellent open-source work, and borrows patterns rather than code:

- **[OASIS](https://github.com/camel-ai/oasis)** (Apache-2.0) — the `trace(user_id, created_at, action, info)` event-log shape and the social action vocabulary. Available behind a deferred adapter.
- **[MiroFish](https://github.com/666ghj/MiroFish)** (AGPL-3.0) — architectural and UI reference for the pipeline and the report view. **No code copied**, out of respect for its license.
- **[Vercel AI SDK](https://ai-sdk.dev)** (Apache-2.0) — structured generation and provider abstraction.
- **[shadcn/ui](https://ui.shadcn.com)**, **[d3](https://d3js.org)**, **[Recharts](https://recharts.org)**, **[motion](https://motion.dev)** — UI foundations.

## Honesty statement

Synthetic agents are not people. This is a rehearsal system, not a substitute for real audience research.

Nothing in this product fabricates statistical representativeness, survey validity, accuracy percentages, real-world lift, or guaranteed virality or conversion. Where we have no data, we say so — in the type system, in the interface, and in this file.

---

*We don't just generate content. We let you rehearse it.*
