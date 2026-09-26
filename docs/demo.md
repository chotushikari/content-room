# Content Room — Demo

**The demo is a product feature, not an afterthought.** It must be deterministic enough to rehearse reliably, and it must survive any single failure on stage.

## 1. The 90-second script

| Time | Beat | On screen | Spoken |
|---|---|---|---|
| 0–10s | Real Velloe post | Content card with the real post | "This is a real Velloe post. Before we publish it, we're going to rehearse it." |
| 10–20s | Content DNA | DNA panel fills in | "The system reads it the way an audience would — hook, promise, tone, CTA, and the friction it's likely to create." |
| 20–35s | Contextual audience | Segments appear, agents materialise | "It constructs the audience this content actually needs. Not a generic panel — these segments come from the content itself." |
| 35–50s | The Room runs | Agents move through stages; feed updates | "Now the room is live. Every agent goes through exposure, attention, interpretation, decision. They react." |
| 50–62s | What happened + WHY | Metrics, then explanation with evidence | "Here's what happened. And here's *why* — the value proposition arrives too late for the skeptical segment." |
| 62–73s | Creative Director + Version B | Brief, then A→B diff | "The Creative Director proposes a fix. Recommended hook, recommended CTA, and a rewritten version." |
| 73–88s | Same audience, re-simulated | Room runs again; comparison table | "Same audience. New content. Re-simulated. Population hash verified — this is a controlled comparison." |
| 88–90s | Before vs after | Deltas | "We don't just generate content. **We let you rehearse it.**" |

**Rehearsal rule:** the timing above must be validated by actually running the demo with a timer, at least three times, before presenting. A demo that has never been timed is a demo that will overrun.

## 2. What the demo must prove

A judge should understand, without narration:

1. Content goes in.
2. A relevant audience forms — and it is *derived*, not picked from a dropdown.
3. The audience reacts.
4. The system explains why, citing evidence.
5. The content improves.
6. The **same** audience tests it again.

Point 6 is the differentiator and the one most likely to be missed on stage. Say the words "same audience" while the audience hash is visible on screen.

## 3. The Velloe fixture

Velloe is the primary demonstration scenario, **never the domain model**. It appears in exactly three places:

```
src/fixtures/velloe/
  content.ts          the real Velloe post as a ContentAsset with source: 'fixture'
  dna.json            pre-computed Content DNA (so demo mode needs no model call)
  audience.json       pre-generated population with a fixed audienceSeed
  simulation.json     pre-computed AgentEvent[] for versions A and B
  brief.json          pre-computed CreativeBrief including versionB
  scenario.ts         VelloeDemoScenario — assembles the above into a full run
```

**Hard rule:** a grep for `velloe` (case-insensitive) outside `src/fixtures/velloe/`, `docs/demo.md`, `docs/product.md` and the pitch script **is a bug**. The product is generic; the fixture is a fixture.

## 4. Demo mode architecture

Four components, exactly as the brief specifies:

| Component | Responsibility |
|---|---|
| `DeterministicSimulationEngine` | The default engine. Reproducible; works with no keys. Not demo-specific — it is the product's real default engine. |
| `VelloeDemoScenario` | Assembles the fixture into a complete run. |
| `DemoTimeline` | Paces replay: reads pre-computed events and emits them over SSE on a realistic cadence, so the room animates as if live rather than dumping 400 events at once. |
| `DemoModeController` | Decides the mode. Resolves **Live**, **Degraded**, or **Demo**, and exposes it to the UI badge. |

### Mode resolution

```
demoMode option set explicitly        → DEMO
no provider keys present              → DEMO
all providers fail                    → DEMO
primary works                         → LIVE
primary fails, fallback serves        → DEGRADED
```

The badge is rendered on **every** station. There is no configuration in which a degraded run looks like a live one.

### DemoTimeline pacing

Pre-computed events are replayed at a cadence derived from the real run's per-round wall-clock, compressed to fit the demo. Round boundaries are always emitted at their real relative positions, so the room's rhythm looks like a simulation rather than a slideshow.

`DemoTimeline` supports an explicit speed multiplier (`1x`, `2x`, `instant`). `instant` emits everything immediately — used by tests and by a presenter who is running out of time.

## 5. Failure matrix — every row must be rehearsed

The demo must work when any single dependency is gone. Each row is verified by a test and by at least one timed rehearsal.

| Failure | Demo behaviour | Rehearsed |
|---|---|---|
| No API keys | Demo mode; badge visible; full journey | required |
| Gemini 429 / 5xx | chain advances to Groq; badge reads Degraded | required |
| All providers down | fixture provider; badge reads Demo | required |
| OASIS not installed | engine simply absent; deterministic engine used | required |
| Velloe URL extraction fails | fixture content loads; badge notes fixture source | required |
| Network fully offline | full journey, demo mode | required |
| Database unavailable | `MemoryRunStore`; run completes in-request | required |
| Model returns malformed JSON | repair → retry → next provider | required |
| Server-sent events dropped | client falls back to `GET /api/runs/:id` polling | required |
| Mid-demo refresh | last completed station restores, or the run restarts cleanly | required |

**The default live demonstration uses the deterministic engine**, not a live model call. Live mode is for a recorded take. A stage demo should never depend on a third-party API's latency or rate limit.

## 6. Pre-flight checklist

Run in order, immediately before presenting:

1. `npm run build` — clean build, zero type errors.
2. `npm run test` and `npm run eval` — all green.
3. `npm run dev` → run the full Velloe scenario three times end to end.
4. Time the run. Confirm it fits the 88-second budget.
5. Browser console clean — zero unexpected errors or warnings.
6. Responsive check at 1440px, 1024px, 390px.
7. **Production URL warm** — open the deployed route once so the first request is not a cold start.
8. Two tabs open: the demo, and the production deployment as an instant fallback.
9. Screen recording of a clean full run available offline, as last resort.
10. Confirm the demo-mode badge state you expect is the state you see.

## 7. Judge-facing talking points

Use these, and nothing stronger:

- "This is a rehearsal environment, not a prediction engine. Every number is labelled **simulated**."
- "24 synthetic audience agents — not 24 people. We are explicit about that."
- "The validation benchmark is **being established**. We are not claiming accuracy we haven't measured."
- "The differentiator is the controlled re-test: same audience, population hash verified, new content."
- "It works with no API keys at all — that's not a fallback, it's the default engine."
- "MiroFish and OASIS proved the category is real. Neither of them does a controlled same-audience comparison. That's the gap we're filling."

**Never claim** on stage: real-world lift, expected conversions, accuracy percentages, statistical significance, or that the audience represents any real population. One overclaim costs more credibility than the entire demo earns. The full forbidden-phrase list is in `docs/validation.md` §6.

## 8. Post-demo

Leave the deployed production URL live, with the run reproducible from the demo fixture, so anyone who saw the pitch can run it themselves. That is a far stronger artefact than a slide.
