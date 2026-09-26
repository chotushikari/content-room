# 007 — The Live Room

## TASK

Build the streaming run pipeline and "The Room" — the live simulation visualization.

## CONTEXT

This is the demo centrepiece. Per `docs/ui-ux.md` §5 it must be legible in three seconds and worth watching for thirty. Per brief §15 it must **not** be a wall of fake chat messages: agents, clusters, states, aggregate metrics, meaningful reaction excerpts, disagreement, progression.

Two architectural facts drive the implementation: events arrive over SSE (so rendering is incremental), and ~24–100 nodes at 60fps means **canvas, not DOM**.

**This task is the first vertical slice checkpoint.** It is also where `docs/deployment.md` §7 says to deploy early rather than at the end.

## OBJECTIVE

1. The full streaming `RunEvent` pipeline in `POST /api/runs`, through to `round_completed`.
2. `TheRoom` — a `d3-force` canvas component driven by the event stream.
3. `ReactionFeed` — selective, meaningful, append-and-dedupe by event id.
4. Live aggregate counters.
5. Heartbeats and abort propagation.
6. **Production deployment verified** end to end.

## ACCEPTANCE CRITERIA

- [ ] A full run streams from `run_started` to `round_completed` with no buffering of the whole run first.
- [ ] Room frame time stays under 16ms with 60 agents — measure and report the actual number.
- [ ] Three encoding channels only: fill = stage, halo = intensity, proximity = segment hint. No additional decoration.
- [ ] Stage colours come from the CSS custom properties defined in task 002, not from duplicated literals.
- [ ] Reaction feed shows a *selective* stream (high intensity, `REJECT` blocks, disagreement) — capped, never a firehose.
- [ ] Round advance is a 300ms coordinated settle, not a re-scatter.
- [ ] `prefers-reduced-motion` removes all motion and states switch directly; the feed still carries the narrative.
- [ ] `heartbeat` emits when any stage is silent >5s.
- [ ] Client disconnect aborts server work — verified by closing the tab mid-run and confirming no further provider calls.
- [ ] The room component is `next/dynamic` with `ssr: false`, and appears in **no** landing-route bundle.
- [ ] 390px renders a compact cluster strip with the feed and counters as the primary narrative.
- [ ] **Deployed to Vercel and verified in production** — this is an acceptance criterion, not a follow-up.

## CONSTRAINTS

- Import `d3-force` and `d3-selection` only. Never the full `d3` bundle.
- No `d3` on the server. `TheRoom` is a client component.
- Do not compute metrics in the UI. Counters read from engine events and the analytics module only.
- Do not add a graph library (`react-force-graph`, `cytoscape`, `vis-network`, `React Flow`). Rejected with reasons in `docs/open-source.md` §1.
- Do not animate for decoration. Every animation must encode a state change.
- Cluster is a **view concept only**. It must not appear in any domain type or analytics code.
- Do not build the metrics, why, brief or comparison panels (008–010).

## IMPLEMENTATION

1. `src/server/pipeline.ts` — stage orchestration: ingest → DNA → audience → simulate, emitting `RunEvent`s. One `AsyncGenerator`.
2. `src/app/api/runs/route.ts` — `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 120`; SSE response; a heartbeat interval timer; `AbortSignal` threaded from `request.signal` down through providers and engine.
3. `src/lib/sse.ts` — server-side `RunEvent` → `data:` line encoding, plus a client-side reader with reconnect.
4. `src/components/room/TheRoom.tsx` — canvas, `d3-force` layout, three encoding channels, `requestAnimationFrame` loop driven by a ref-backed event queue (never React state per event, which would render 400 times).
5. `src/components/room/useRoomState.ts` — event stream → agent state map, batched into animation frames.
6. `src/components/room/ReactionFeed.tsx` — capped, append-and-dedupe by `event.id`.
7. `src/components/room/RoomCounters.tsx` — per-stage counts and running action tally, `MetricValue` styling, mono tabular.
8. A DevTools performance recording during a 60-agent run, with the result recorded in the task report.

## TESTS

- `tests/sse.test.ts` — event encoding, ordering, ordering under interleaved heartbeats, and dedupe.
- `tests/abort.test.ts` — aborting the request stops engine and provider work.
- `tests/room-state.test.ts` — the reducer applying a recorded event sequence produces the expected final agent state.
- `tests/bundle.test.ts` — asserts `d3-force` and `motion` are absent from the landing route's client bundle.
- Manual performance measurement, recorded with an actual number.

## BROWSER VERIFICATION

All ten checks, plus specifically:

- A full run watched start to finish in the browser.
- Tab closed mid-run → repeat the run and confirm it starts clean.
- 60-agent run with DevTools performance recording open; report measured frame time.
- Reduced-motion mode active; confirm no animation and a readable narrative.
- 390px layout.
- **The deployed production URL**, not localhost. Note cold-start latency in the report.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification   (must include the measured frame time and the production URL result)
### Risks
### Next recommended task
```
