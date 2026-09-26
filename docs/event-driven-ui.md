# Content Room — Event-Driven Interface

**Status:** implemented. This document describes how the interface actually works, not how it was planned to work.

## 1. The principle

The interface is a **pure function of an append-only event log**.

Nothing in the UI sets display state directly. No component fetches a result and renders it. There is exactly one source of truth — the log — and every panel is a projection of it. Concretely:

```
server pipeline ──SSE──► RunEventLog ──► runReducer ──► RunViewState ──► panels
                              │                              ▲
                              └──── every event, in order ───┘
```

Two consequences that matter, and that a component-and-state design does not give you:

- **A panel cannot appear before the event that produced its data.** The station rail is derived from which events have arrived, not from a step counter, so the sequence is structurally honest rather than maintained by hand.
- **The whole interface is testable by replaying an event array.** `tests/reducer.test.ts` folds a real run's stream through the reducer and asserts the resulting view state. There is no DOM involved in that assertion.

## 2. The pieces

| Module | Role |
|---|---|
| `src/core/domain/report.ts` → `RunEventSchema` | The 16-member discriminated union of everything the server can say |
| `src/lib/event-log.ts` | Append-only store. Assigns monotonic `seq`, records arrival `deltaMs`, notifies subscribers, counts by type |
| `src/lib/run-reducer.ts` | **Pure** `(state, envelope) => state`. The whole UI state, derived |
| `src/lib/use-run-stream.ts` | Single subscription point. Consumes SSE and folds into the reducer, batched per animation frame |
| `src/components/*` | Read projections. No run state of their own |

The reducer is the load-bearing piece. `RunViewState` holds the asset, DNA, audience, per-agent stage/action/intensity, round, both metric sets, the explanation, the brief, Version B, the comparison, the authoritative mode, provider usage, and any failure — all of it derived from events alone.

## 3. Why the event union is shaped the way it is

- **`run_completed` exists and is separate from `run_started`.** `run_started` carries a *provisional* mode (what is configured, i.e. which API keys are present). `run_completed` carries the *authoritative* mode derived from what actually served the run. The UI shows the provisional value with a "(pending)" suffix until the authoritative one arrives, so a degraded run cannot be presented as live. Two fields, `provisionalMode` and `mode`, are kept distinct in the reducer for exactly this reason.
- **`metrics_ready` carries `label: 'A' | 'B'`.** Version A and Version B metrics are routed to different state slots, so the comparison can show both side by side without the second overwriting the first.
- **`heartbeat` is in the union and changes nothing.** It proves liveness. Vercel sends HTTP/2 `PING` frames, but an idle HTTP/1.1 connection can be closed by an intermediary, so heartbeats are mandatory at the transport level while being explicitly inert at the state level.
- **`run_failed` carries `recovered`.** A stage that had a fallback and continued emits the failure *and* the run carries on. A failure is a state, not the end of the stream.

## 4. The instrumentation layer

A simulation you cannot inspect is not persuasive, so the raw stream is a first-class part of the UI rather than a debug view.

**Event console** — every frame, in arrival order, as `[seq] [type] [Δ] [summary]`, monospaced. Auto-scroll is pinned by default and **releases the instant the user scrolls up**, so reading history during a live run does not fight the stream. Row colours encode event class: accent for lifecycle, green for completion, red for failure, muted for agent events, dim for heartbeats.

**Event ledger** — per-type counts plus wall-clock duration. This is how you can tell at a glance that a run took 608 agent events, 6 rounds, 2 provider calls, and one comparison.

**Reaction feed** — a *selective* humanised stream. It shows rejections, shares, saves, purchases, comments, and anything above 0.72 intensity. It is deliberately not a firehose: a wall of generated messages communicates nothing. Entries append and dedupe by event id, so a reconnect or replay cannot double-post. Each entry carries the agent's archetype label, action badge, round, reason chips, and — from the log, not the domain — the `+Δ` gap since the previous event.

**The room** is a subscriber like everything else. It reads per-agent stage/action/intensity from the reducer and encodes exactly three channels: fill = stage (valence once acted), halo = intensity, proximity = segment grouping. The canvas is repainted continuously from a ref-backed node list while the reducer updates at frame rate, which is what lets ~600 events animate smoothly instead of causing 600 React renders.

## 5. Batching, and why it matters here

A 24-agent × 3-round run emits ~600 events. Folding each one through React state individually would mean ~600 renders and visible stutter in the room.

`use-run-stream.ts` therefore accumulates arriving events into a buffer and flushes them **once per animation frame**: the reducer folds the whole batch in one `setState`, and the entry list is replaced once. Display-rate updates, no dropped frames, and the reducer stays pure.

## 6. Honesty properties the design enforces

The event model is where several product promises stop being conventions:

| Promise | Enforced by |
|---|---|
| A result never appears before its cause | Stations unlock from events, not a counter |
| A degraded run cannot look live | Provisional `run_started.mode` vs authoritative `run_completed.mode` |
| The re-test is controlled | `comparison_ready` carries `samePopulation`, and the pipeline throws on a population-hash mismatch before it can be emitted |
| Numbers never come from a model | `metrics_ready` carries a `MetricsBundle` computed by pure code; no model output can reach it |
| Caveats cannot be dropped | `Comparison.caveats` has `min(1)`, so a caveat-free `comparison_ready` is unconstructable |

## 7. Testing

`tests/reducer.test.ts` covers: log sequencing and deltas; reducer purity (folding the same log twice is identical); complete state derivation from a real run; the ordering invariant that a station is never unlocked by someone else's event; heartbeat inertness; provisional-versus-authoritative mode; round-scoped action clearing; failure capture that preserves completed work; and the full re-simulation routing to separate metric slots with a verified population hash.
