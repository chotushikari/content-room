# 009 — Strategy (Creative Director)

## TASK

Build the Creative Director: the `creative_brief` AI task, the A→B change list, and the brief panel.

## CONTEXT

The Creative Director receives content, DNA, audience, simulation, segments, disagreement and evidence, and produces the strategy plus **Version B as a first-class asset** — not as prose. Version B must be a valid `ContentAsset` so task 010 can simulate it.

Brief §18 requires the reasoning and evidence behind each recommendation to be visible. `CreativeBriefSchema` enforces this: every entry in `top3Changes` has `evidence` with `min(1)`, and `top3Changes` must be exactly length 3.

## OBJECTIVE

1. The `creative_brief` task producing `CreativeBriefSchema`, with `versionB` as a real `ContentAsset`.
2. A deterministic `changes[]` diff computed from A and B, each change tied to its reason.
3. `BriefPanel` — strongest signal, biggest risk, highest-impact change, top 3 changes, recommended hook, recommended CTA, strategy.
4. `VersionBDiff` — a clear, field-by-field A→B comparison.

## ACCEPTANCE CRITERIA

- [ ] `versionB` is a schema-valid `ContentAsset` with its own recomputed `contentHash`, `kind`, and `source`.
- [ ] `top3Changes.length === 3` — the schema rejects any other length, proven by a test.
- [ ] Every change has `min(1)` evidence refs that resolve against the task 008 index.
- [ ] `changes[]` is computed **deterministically** by diffing A against B — not authored by the model, which would produce prose that drifts from the actual text.
- [ ] Recommended hook and CTA are rendered as distinct, individually copyable assets.
- [ ] The strategy panel shows the evidence behind each recommendation, reusing `EvidenceDrawer`.
- [ ] Version B preserved the original's factual claims — an assertion checks that no number or named entity present in A is silently dropped or altered in B.
- [ ] Copy contains no forbidden phrase from `docs/validation.md` §6. The model will try to write "this will boost engagement"; the guard test catches it.

## CONSTRAINTS

- The model writes the **content and reasoning**; code computes the **diff**. Do not ask the model to produce `changes[]`.
- `versionB` must respect the original content kind and length norms. Rewriting an Instagram caption into a 400-word essay is a failure, not a creative choice.
- Do not invent proof, statistics, testimonials or claims not present in the original content. The rewrite may **restructure** what exists and sharpen the hook and CTA; it may not fabricate evidence. This is enforced by the fact-preservation assertion above.
- Do not re-run the simulation here. That is task 010's job.
- Do not tune recency or emphasis to make Version B look better in the demo. B must win or lose on the model's merits.

## IMPLEMENTATION

1. `src/providers/tasks/creative-brief.ts` — schema, instruction, 12,000-char cap, and a fixture whose `versionB` genuinely differs from A so demo mode tells the true story.
2. `src/providers/tasks/content-rewrite.ts` — separated from the brief so the rewrite can be re-run independently and tested on its own.
3. `src/core/domain/diff.ts` — pure `diffAssets(a, b): Change[]` over the fields the DNA and metrics care about (hook, promise, value proposition, CTA, body structure), each entry carrying the reason supplied alongside the model's rationale.
4. `src/core/domain/fact-preservation.ts` — extract numerals and named entities from A and B, return any that were dropped or altered. Non-empty ⇒ surface to the user rather than hiding it.
5. `src/components/strategy/BriefPanel.tsx` — hierarchy per `docs/ui-ux.md` §2: strongest signal is the hero, top 3 changes are numbered, hook and CTA are copyable.
6. `src/components/strategy/VersionBDiff.tsx` — side-by-side field diff with directional emphasis.
7. Extend the pipeline to emit `brief_ready` and `versionb_ready`.

## TESTS

- `tests/brief-schema.test.ts` — `top3Changes` of length 2 or 4 is rejected; empty evidence is rejected.
- `tests/diff-determinism.test.ts` — the same A/B pair always produces the same `changes[]`.
- `tests/fact-preservation.test.ts` — a fixture that silently drops a statistic from A is flagged. Include the negative case: a legitimate restructure with no dropped facts passes.
- `tests/versionb-valid.test.ts` — `versionB` parses as `ContentAsset`, has a fresh `contentHash`, and preserves `kind`.
- `tests/copy-guard.test.ts` — extended to cover generated brief text. A model-produced forbidden phrase must fail the test suite.
- `evals/golden.json` — is the hook genuinely sharper? Is the recommended CTA specific rather than generic? Rubric-scored.

## BROWSER VERIFICATION

All ten checks, plus: copy-to-clipboard works for hook and CTA; the diff is readable at 390px; the evidence drawer opens from within the brief panel.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification
### Risks            (must state whether Version B's improvement was verified as genuine rather than assumed)
### Next recommended task
```
