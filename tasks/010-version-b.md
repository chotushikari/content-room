# 010 — Version B, Same-Audience Re-Simulation & Comparison

## TASK

Build the controlled re-simulation and the before/after comparison — the product's differentiator.

## CONTEXT

Research established that **no open-source project does this** (`docs/open-source.md` §4, `docs/research.md` §0). OASIS and MiroFish simulate a world and produce a report; neither holds an audience fixed and re-tests improved content against it. This is the one thing a judge will not have seen elsewhere, and it is the reason the audience identity mechanism in task 005 exists.

Brief §20 is explicit: *"Do not regenerate a completely different audience and pretend the comparison is controlled."* So the population hash is **asserted**, not trusted, and the control mode is surfaced in the UI.

## OBJECTIVE

1. `POST /api/runs/:id/resimulate` — runs Version B against the **same** audience.
2. `assertSamePopulation()` enforcing hash equality.
3. `compare(a, b, audienceRef, reproducibility): Comparison` with correct caveat text.
4. `ComparisonPanel` — the before/after table plus the control-mode statement.
5. A visible re-simulation of the room against Version B, so the comparison is watched rather than just tabulated.

## ACCEPTANCE CRITERIA

- [ ] The re-simulation reuses the identical `audienceId`, `audienceSeed` and `populationHash`.
- [ ] A mismatched `populationHash` throws `AudienceMismatchError` and the run fails loudly — never silently proceeds.
- [ ] `samePopulation === true` only when all three identity fields match.
- [ ] `Comparison.caveats` is non-empty; the correct text is selected by `reproducibility` and `controlMode` per `docs/api-contracts.md` §7.
- [ ] The UI states the control mode: "population hash verified" or the resampled/regenerated caveat.
- [ ] Every row is labelled **Simulated change**.
- [ ] No "lift", "improvement", "increase in conversions" or similar unqualified claim appears anywhere.
- [ ] Rows are sorted by absolute delta, so the largest change is first.
- [ ] The re-simulation is visible in the room, not merely computed.
- [ ] `GET /api/runs/:id` returns a complete `RunRecord` including `versionBRun`, `versionBEvents`, `versionBMetrics` and `comparison`.
- [ ] No domain type, engine or provider references Velloe — re-verified by the grep rule in `AGENTS.md` §3.7.

## CONSTRAINTS

- Only the **content** differs between A and B. `contentHash` changes; nothing in `AudienceRef` does. If you find yourself needing to regenerate the audience, stop and report it — that would break the product's central claim.
- Do not present a `'sampled'` comparison as controlled. If the engine is not reproducible, the resampled caveat must be visible.
- Do not compute deltas in the UI. `core/comparison` is pure and tested.
- Do not add historical run browsing. There is no durable store on the free tier (`docs/deployment.md` §6), and pretending otherwise would be dishonest.
- Do not implement the room again — reuse `TheRoom` in a second pass.

## IMPLEMENTATION

1. `src/server/pipeline.ts` — extend with a `resimulate` entry point taking the persisted A record plus `versionB`.
2. `src/core/domain/audience-assert.ts` — `assertSamePopulation(a: AudienceRef, b: AudienceRef)` throwing `AudienceMismatchError` with both hashes in the message (never the content, just the hashes).
3. `src/core/comparison/compare.ts` — pure; builds rows, computes deltas and directions, selects caveat text, and derives `samePopulation` from the three identity fields.
4. `src/app/api/runs/[id]/resimulate/route.ts` — validates `ResimulateRequestSchema`, streams `resim_event` then `comparison_ready`, with the same runtime and abort configuration as task 007.
5. `src/components/comparison/ComparisonPanel.tsx` — mono tabular, A / B / delta columns, delta-coloured but never labelled "lift", caveat banner above the table, explicit control-mode line.
6. `src/components/comparison/ControlModeNote.tsx` — the honesty surface. Make it visually prominent; this is a feature, not a disclaimer.

## TESTS

- `tests/same-population.test.ts` — identical refs pass; a differing `populationHash`, `audienceId`, or `audienceSeed` each throws. Test all three independently; a single combined test would hide a partial check.
- `tests/compare-purity.test.ts` — deterministic, and total over edge cases: all deltas zero, all deltas negative (B is worse), identical metrics.
- `tests/caveats.test.ts` — the correct caveat text for each `(reproducibility, controlMode)` combination, including the `regenerated` warning.
- `tests/comparison-schema.test.ts` — `caveats: []` is rejected.
- `tests/versionb-different.test.ts` — A and B produce **different** event sets; an accidental identical result indicates the wrong content was simulated, which is the most likely silent bug in this task.
- `evals/regression.json` — frozen A/B comparison for the Velloe fixture, so a future prompt change cannot silently alter the headline result.
- `tests/copy-guard.test.ts` — extended over comparison output for "lift" and "improvement" without qualifiers.

## BROWSER VERIFICATION

All ten checks, plus:

- The full journey A → brief → B → re-simulation → comparison watched end to end in one session.
- Both caveat paths confirmed by forcing the engine to report `reproducibility: 'sampled'`.
- Refresh mid-comparison: `GET /api/runs/:id` restores the completed record.
- 390px: the table remains readable without horizontal overflow.
- Production URL verified with the whole A→B flow.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification   (both caveat paths and the full A→B flow)
### Risks            (must state how controlled the comparison actually is, in plain language)
### Next recommended task
```
