# 011 — Validation Layer

## TASK

Build the validation layer, the eval harness, and all three eval fixture sets.

## CONTEXT

`docs/validation.md` separates two things that are usually conflated: **software correctness** (testable now, required) and **predictive validity** (no data exists, so not claimable). The brief is explicit: if there is no real benchmark, report `"Validation benchmark: being established"` and never fabricate.

This task ships the interface and the honesty, and deliberately ships **no validation numbers** — there are no real-world outcomes to validate against.

## OBJECTIVE

1. `ValidationStatus` wired into every `RunRecord`, always `'not_established'` until real data exists.
2. A real eval harness at `npm run eval` that runs the fixture sets and reports pass rates.
3. `evals/golden.json`, `evals/regression.json`, `evals/adversarial.json` populated per `docs/validation.md` §4.
4. Security tests from `docs/validation.md` §3.2 consolidated and passing.
5. Failure-injection tests from `docs/validation.md` §3.3 consolidated and passing.
6. `ValidationStatusNote` UI component.

## ACCEPTANCE CRITERIA

- [ ] `ValidationStatus` is present on every run and reads `{ state: 'not_established', note: 'Validation benchmark: being established.' }`.
- [ ] The `'calibrated'` branch is unreachable in the product and can only be constructed in a test, with `n` and a named method required.
- [ ] `npm run eval` runs all three sets and prints per-case results plus overall pass rates.
- [ ] Every row in `docs/validation.md` §3.2 (security) passes.
- [ ] Every row in `docs/validation.md` §3.3 (failure injection) completes the full journey.
- [ ] **The homogeneity eval passes**: a run producing zero `REJECT` and zero `IGNORE` across all segments fails the eval. A synthetic audience that unanimously approves indicates a broken model, not good content.
- [ ] `evals/regression.json` snapshots are compared and any mismatch requires explicit acceptance — never a silent update.
- [ ] `npm run test` and `npm run eval` are wired into the build check so neither can rot.
- [ ] The UI displays the validation note wherever numbers appear, without a dismissible state.

## CONSTRAINTS

- **Do not invent validation numbers.** No accuracy percentage, no correlation, no Brier score appears without genuinely paired real-world observations, which do not exist.
- The `'calibrated'` branch is built for the future and must remain **unreachable** in the product today. Do not leave a path that could populate it with simulated data.
- Eval cases are statistical, so define pass **rates**, not exact-match assertions — except for schema validity, which is exact.
- Do not add a paid evaluation framework. A script plus fixtures plus a rubric-scoring model call is sufficient.
- Do not weaken the forbidden-phrase guard. `tests/copy-guard.test.ts` is a required, permanent test.

## IMPLEMENTATION

1. `src/core/domain/validation.ts` — `ValidationStatusSchema` per `docs/api-contracts.md` §13; a `notEstablished()` factory used everywhere.
2. `scripts/eval.ts` — runner: loads the three sets, executes each case against the live or fixture provider per flags, applies structural assertions plus rubric scoring, prints a table, exits non-zero on failure. Support `--set=golden|regression|adversarial|all` and `--provider=fixtures|live`.
3. `evals/golden.json` — the five content types from `docs/validation.md` §4, each with structural assertions and a rubric.
4. `evals/regression.json` — frozen per-task snapshots with a `snapshot` field and an `acceptedAt` field; a mismatch fails unless `--accept` is passed, which must also update `acceptedAt` and be visible in the diff.
5. `evals/adversarial.json` — the full §4 adversarial table, including the homogeneity case, prompt injection, prompt leaking, boundary-length input, and hostile Unicode.
6. `tests/security.test.ts` — the §3.2 table consolidated from tasks 003 and 004.
7. `tests/failure-injection.test.ts` — the §3.3 table.
8. `src/components/validation/ValidationStatusNote.tsx` — quiet, persistent, always visible, using the approved copy.
9. `package.json` scripts: `eval`, `test`, `verify` (runs typecheck + lint + test + eval).

## TESTS

The eval harness **is** the deliverable, so its own tests matter:

- `tests/eval-runner.test.ts` — a deliberately failing case produces a non-zero exit code; the runner does not swallow failures.
- `tests/eval-regression-guard.test.ts` — a modified snapshot without `--accept` fails.
- `tests/homogeneity-eval.test.ts` — a fabricated all-positive run fails the eval. This is the single most important test in the repository: it is what stops the model becoming a rubber stamp while appearing to work.

## BROWSER VERIFICATION

`ValidationStatusNote` renders on the comparison station in every mode, is legible at 390px, and cannot be dismissed. Confirm on the production URL.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests            (report actual pass rates per set, not "all passing")
### Browser verification
### Risks            (must restate that predictive validity is unmeasured)
### Next recommended task
```
