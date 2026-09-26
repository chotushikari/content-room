# 006 — Simulation Engine

## TASK

Implement `DeterministicSimulationEngine` per `docs/simulation.md`, streaming `AgentEvent`s.

## CONTEXT

This is the default engine and the reason the product works with no API keys, no network and no database. It must be reproducible and order-independent, because it is streamed and the events it emits become the sole input to every number the product shows.

The honest framing from `docs/simulation.md` §8 governs this task: the coefficients are hand-authored hypotheses, not a calibrated model. Do not tune them until the demo looks good.

## OBJECTIVE

1. `SimulationEngine` interface plus the engine registry.
2. `DeterministicSimulationEngine` emitting the six-stage journey per agent per round.
3. `src/core/rng`-based `rngFor(runSeed, agentId, round, stage)` used for every sampled decision.
4. Coefficients as named constants in one file with documented rationale and ranges.
5. Bounded cross-round social reinforcement.
6. Engine provenance on every event.

## ACCEPTANCE CRITERIA

- [ ] `capabilities()` returns `{ streaming: true, reproducible: true, needsModel: false, maxPopulation: 200 }`.
- [ ] Running twice on identical input yields **byte-identical** event arrays (`JSON.stringify` equality).
- [ ] Shuffling agent processing order yields the same event **set** (order-independence proven, not assumed).
- [ ] All six stages appear for every agent that reaches them; early exits are recorded as `STOP` or `IGNORE`, never as missing events.
- [ ] `REJECT` and `IGNORE` are distinct and both reachable; a content variant that should provoke rejection does.
- [ ] Social reinforcement is bounded to ±0.15 on any trait.
- [ ] Every event carries `producedBy: 'deterministic'` and non-empty `reasons`.
- [ ] `intensity` varies meaningfully rather than clustering at one value.
- [ ] The engine works with **text features only** — `ContentDNA` enriches `reasons` but is never required.
- [ ] A deliberately weak content variant produces measurably worse metrics than a strong one, demonstrating sensitivity rather than asserting it.

## CONSTRAINTS

- No model calls. If you find yourself wanting one, the design is wrong.
- No `Math.random()`, no `Date.now()`, no `crypto.randomUUID()`. `core/rng` only.
- No arithmetic in the engine beyond per-agent decisions. No percentages, no aggregation, no metric definitions — those belong to `core/analytics` (task 008). Violating this is the most likely way to make the numbers unauditable.
- Coefficients must be named constants with documented ranges. No inline magic numbers.
- Do not implement `OasisSimulationEngine` — it is a deferred post-MVP adapter (`docs/architecture.md` §9).
- Do not build the room UI (007).
- Excerpts are template-composed synthetic fragments and must never read as quotations from a person.

## IMPLEMENTATION

1. `src/engines/types.ts` — `SimulationEngine`, `EngineCapabilities`, `SimulationInput`.
2. `src/engines/deterministic/coefficients.ts` — every constant, with a comment stating its expected range and which direction it pushes behaviour.
3. `src/engines/deterministic/model.ts` — the pure scoring functions from `docs/simulation.md` §4: `hookPull`, `clarityGain`, `trustGate`, `valueFit`, `interestFit`, `frictionDrag`, and the three stage logits.
4. `src/engines/deterministic/engine.ts` — the async generator. For each round, for each agent, walk the stages, sample with `rngFor`, yield an event per stage transition. Apply bounded cross-round reinforcement from cluster aggregates.
5. `src/engines/deterministic/excerpts.ts` — template composition over DNA fragments, friction labels and archetype voice. Keep fragments short and clearly synthetic.
6. `src/engines/registry.ts` — deterministic always registered; OASIS registered only when a health check passes.
7. `src/engines/deterministic/index.ts` exporting `version`; bump it on any model change, since it is written into `SimulationRun.engineVersion` and is what makes two runs comparable.

## TESTS

- `tests/engine-reproducibility.test.ts` — 50 runs, byte-identical output every time.
- `tests/engine-order-independence.test.ts` — shuffled processing order, identical event set.
- `tests/engine-stage-coverage.test.ts` — all six stages reachable; early exits recorded as actions.
- `tests/engine-sensitivity.test.ts` — a strong variant beats a weak variant on attention and clarity, and a buried-promise variant shows elevated `IGNORE`. This is the test that stops the model being tuned into a rubber stamp.
- `tests/engine-bounds.test.ts` — social reinforcement never exceeds ±0.15; no trait leaves `0..1`; `intensity` stays in range.
- `tests/engine-no-model.test.ts` — engine runs with every provider stubbed to throw.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests            (state the sensitivity result explicitly, with numbers)
### Browser verification   (none — this task has no UI; say so)
### Risks            (restate that coefficients are uncalibrated hypotheses)
### Next recommended task
```
