# 008 — Intelligence (Analytics + WHY)

## TASK

Build the analytics engine, the `why_report` AI task, and the metrics and explanation panels.

## CONTEXT

This is where the product stops being a visualization and starts being useful. Two rules govern it:

1. **Numbers come from pure code, never from a model** (`docs/product.md` §5, `AGENTS.md` §3.3).
2. **Explanations must cite evidence** — `WhyReport.biggestSignal.evidence` has `min(1)`, which is how brief §17's "recommendations must be connected to simulation evidence" becomes mechanically enforced rather than aspirational.

The hard part is not computing the metrics. It is building the provenance chain so a click on a friction reveals the events, segments and excerpts that produced it.

## OBJECTIVE

1. `aggregate(events, audience): MetricsBundle` — pure and total.
2. Segment breakdowns and per-metric disagreement with `bySegment` detail.
3. An evidence index mapping metrics → segments → events → excerpts.
4. The `why_report` AI task, grounded: the model receives computed metrics and a bounded event sample, never the whole run.
5. `MetricsPanel` with on-demand `n` and `method`.
6. `WhyPanel` with clickable evidence.

## ACCEPTANCE CRITERIA

- [ ] Every metric has `n > 0`, a non-empty `method`, and `kind === 'simulated_estimate'`.
- [ ] `method` strings and the computation share one source, so they cannot drift apart.
- [ ] `aggregate()` is pure: identical input ⇒ byte-identical output, and it never reads a clock or randomness.
- [ ] All twelve metrics from `MetricIdSchema` are produced, each with its documented formula.
- [ ] `aggregate()` is total: empty events, a single event, and an all-`IGNORE` set each produce a valid bundle.
- [ ] Disagreement is reported per metric **with** `bySegment` — never as a single polarisation score.
- [ ] Every claim in the rendered WHY panel is clickable through to its evidence: metric → segment → events → excerpts.
- [ ] A `WhyReport` with empty `evidence` fails validation — proven by a test that constructs one.
- [ ] The model is never asked to produce or confirm a number; it receives computed values only.
- [ ] An ungroundable claim is reported in `ungroundedClaims` rather than invented, and the UI shows it honestly.

## CONSTRAINTS

- `core/analytics` is **pure**. No IO, no model, no clock, no randomness. Ever.
- No metric exists outside `MetricIdSchema`. Adding one means updating `docs/api-contracts.md` first.
- Forbidden metric concepts: predicted reach, expected conversions, virality score, engagement rate as a prediction. The metric set is response-and-intent only (`docs/product.md` §5).
- Do not let the model see the full event array — bound the sample, or it will pattern-match noise and produce confident nonsense.
- Every number rendered carries its simulation label automatically via `MetricValue` from task 002. Do not hand-write labels.
- Do not build the Creative Director or Version B (009, 010).

## IMPLEMENTATION

1. `src/core/analytics/metrics.ts` — one entry per metric: id, label, formula, method string. The formula and the method string are generated from the same definition object so they cannot diverge.
2. `src/core/analytics/aggregate.ts` — overall metrics, per-segment breakdowns, disagreement with `bySegment`, and bookkeeping (`events`, `agents`, `rounds`, `actionCounts`).
3. `src/core/analytics/evidence.ts` — build the index: metric → contributing events → excerpts → DNA fields. Cap references per metric to keep payloads small.
4. `src/providers/tasks/why-report.ts` — schema `WhyReportSchema`; input is the `MetricsBundle` plus a bounded, **stratified** event sample (include `REJECT`s and disagreement outliers so the sample is not just the loud majority). Requires evidence refs that must resolve against the supplied index, validated after generation.
5. `src/components/intelligence/MetricsPanel.tsx` — mono tabular values, delta-ready rows, `n`/`method` on expand.
6. `src/components/intelligence/WhyPanel.tsx` — biggest signal, audience split, top frictions, each expandable to its evidence. Show `ungroundedClaims` when present.
7. `src/components/intelligence/EvidenceDrawer.tsx` — the drill-down.

## TESTS

- `tests/analytics-purity.test.ts` — purity via double-invocation equality plus a frozen clock.
- `tests/analytics-totality.test.ts` — empty / single / all-`IGNORE` / all-`REJECT` sets.
- `tests/metric-arithmetic.test.ts` — each metric recomputed independently in the test from the raw events and compared. Independent recomputation is the point; a test that reuses the implementation proves nothing.
- `tests/label-consistency.test.ts` — every `method` string matches its formula's documented description.
- `tests/evidence-resolution.test.ts` — every evidence ref in a generated `WhyReport` resolves against the index; unresolvable refs are rejected.
- `tests/why-grounding.test.ts` — an empty-evidence report fails validation.
- `evals/golden.json` — the attribution cases: does WHY correctly identify a buried value proposition as the dominant friction for a skeptical segment?

## BROWSER VERIFICATION

All ten checks, plus: every claim in WHY clicks through to evidence, as a deliberate walkthrough of at least three claims; metric `n`/`method` expand works; the panel remains readable at 390px.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests            (incl. the independent-recomputation result)
### Browser verification
### Risks
### Next recommended task
```
