# 012 — Demo Mode

## TASK

Build the Velloe demo fixture, `DemoTimeline`, `DemoModeController`, and the pre-flight tooling.

## CONTEXT

The demo is a product feature, not an afterthought (`docs/demo.md`). It must be deterministic enough to rehearse reliably and survive any single failure on stage. Brief §25 requires it to work when there is no API key, the model fails, OASIS is unavailable, URL extraction fails, the network is down, or the database is unavailable.

Velloe is the primary demonstration scenario and **never** the domain model. It lives in exactly three places, and `AGENTS.md` §3.7 makes any other reference a bug.

## OBJECTIVE

1. `src/fixtures/velloe/` — the complete fixture per `docs/demo.md` §3.
2. `DemoTimeline` — paced replay of pre-computed events.
3. `DemoModeController` — mode resolution, wired to the badge.
4. `npm run demo` — headless run printing stage timings.
5. The pre-flight checklist automated as `npm run preflight` where practical.
6. All eleven rows of the failure matrix in `docs/demo.md` §5 verified.

## ACCEPTANCE CRITERIA

- [ ] The full journey completes in demo mode with **no keys, no network, no database**.
- [ ] Demo mode output equals the deterministic engine's output for the same fixture — demo mode is a *pacing* layer, not a different simulation. Asserted by test.
- [ ] `DemoTimeline` paces events so the room animates rather than dumping 400 events at once.
- [ ] `DemoTimeline` supports `1x`, `2x`, and `instant`; `instant` is used by tests.
- [ ] Round boundaries emit at their true relative positions.
- [ ] All eleven failure-matrix rows pass, each as a test.
- [ ] `npm run demo` completes headlessly and prints per-stage timings totalling under the 88-second budget.
- [ ] A case-insensitive grep for `velloe` outside `src/fixtures/velloe/`, `docs/demo.md`, `docs/product.md` and the pitch script returns **nothing**.
- [ ] Demo-mode runs are fully labelled: badge visible on every station.
- [ ] Fixture `versionB` genuinely differs from fixture A, and fixture B metrics genuinely differ — a demo where nothing changes is worse than no demo.

## CONSTRAINTS

- The fixture must be **real Velloe content**, not invented placeholder text. The demo story depends on it being real.
- Do not special-case demo mode anywhere in `core/`, `engines/` or `analytics/`. Demo mode selects a **provider** and a **pacing layer**; it must not fork the simulation. If demo mode needs a code path elsewhere, the design is wrong.
- Do not let the fixture reach production routes as a default. It is selected explicitly, or via the empty-input demo shortcut.
- Do not pre-seed the comparison to show a favourable result. If the deterministic model produces a modest change, ship the modest change and adjust the narrative, not the numbers. Tuning the fixture until B looks impressive is exactly the rigged demo `docs/simulation.md` §4 warns against.
- Do not build a video, GIF, or slide deck. The deployed URL is the artefact.

## IMPLEMENTATION

1. `src/fixtures/velloe/content.ts` — the real post as a `ContentAsset` with `source: { type: 'fixture' }`.
2. `src/fixtures/velloe/*.json` — `dna`, `audience`, `simulation` (A and B), `brief`, each typed and validated by `fixtures-valid.test.ts` from task 004.
3. `src/fixtures/velloe/scenario.ts` — `VelloeDemoScenario` assembling the fixture into a complete run, exposing the same `RunEvent` stream shape as a live run.
4. `src/server/demo-timeline.ts` — `DemoTimeline`: replays events at a cadence derived from the real per-round wall-clock, compressed to the demo budget, honouring `speed`.
5. `src/server/demo-mode.ts` — extend task 004's `DemoModeController` with explicit-override support and the empty-input shortcut.
6. `scripts/demo.ts` — headless runner: full journey, `instant` pacing, prints stage timings and the total.
7. `scripts/preflight.ts` — build, typecheck, lint, test, eval, the three timed runs, the velloe grep rule, and a bundle check for absent heavy dependencies.
8. Home page: a one-tap Velloe demo shortcut (task 003 built the input; this adds the shortcut).

## TESTS

- `tests/demo-equivalence.test.ts` — demo-mode output equals the deterministic engine on the same fixture.
- `tests/demo-timeline.test.ts` — pacing, speed settings, round-boundary positions.
- `tests/failure-matrix.test.ts` — all eleven rows from `docs/demo.md` §5.
- `tests/velloe-boundary.test.ts` — the grep rule, as an automated test rather than a convention.
- `tests/demo-budget.test.ts` — `npm run demo` finishes within the 88-second budget.
- `tests/fixture-differs.test.ts` — fixture A and B produce different metrics, and B is not uniformly better on every metric unless the model genuinely says so.

## BROWSER VERIFICATION

All ten checks in demo mode, plus a **timed full run** with the actual measured duration recorded, and the same timed run on the production URL with the route pre-warmed.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests            (incl. the measured demo duration)
### Browser verification   (incl. the timed production run)
### Risks
### Next recommended task
```
