# 013 — Final Audit

## TASK

Independent verification of the whole system against every promise made in the documentation.

## CONTEXT

Every previous task reported its own verification. This task assumes those reports may contain optimism and re-checks the claims from outside. Its value is entirely in its independence: **an audit that re-runs the author's tests and reports green has verified nothing.**

This is also the task that catches drift — docs describing a system that no longer exists, or code making a claim the docs forbid.

## OBJECTIVE

1. Verify every honesty constraint mechanically, from the outside.
2. Verify the docs match the code.
3. Verify the full journey in all three modes and on the production URL.
4. Produce the final task report, including an honest list of what is *not* done.

## ACCEPTANCE CRITERIA

### Honesty (the most important section)

- [ ] No forbidden phrase from `docs/validation.md` §6 appears in any user-facing string, any generated content, or any doc. **Grepped, not eyeballed.**
- [ ] Every metric on screen carries its `n` and a reachable `method`.
- [ ] Every comparison row is labelled **Simulated change**.
- [ ] `ValidationStatus` reads `'not_established'` on every reachable path, and the `'calibrated'` branch is unreachable from product code — proven by test, not by inspection.
- [ ] The audience is described as synthetic agents everywhere, never as people.
- [ ] No claim of accuracy, lift, representativeness, or statistical significance appears anywhere.

### Contracts

- [ ] Every schema in `docs/api-contracts.md` exists in code with matching field names and constraints. Diffed field by field.
- [ ] All ten contract obligations pass.
- [ ] Every contract change made during implementation was recorded in `docs/api-contracts.md` first. Any undocumented divergence is a finding.

### Architecture

- [ ] `src/core/` imports nothing from the layers above it, verified by deliberately breaking the rule once and confirming lint fails.
- [ ] No engine or provider is reachable from a client bundle.
- [ ] `d3-force`, `motion`, Recharts and Recharts' dependencies absent from the landing route bundle.
- [ ] No `Math.random()`, `Date.now()` or `crypto.randomUUID()` in `core/` or `engines/` — grepped.

### Security

- [ ] The full `docs/validation.md` §3.2 table passes.
- [ ] No secret appears in the built client bundle — grepped for key prefixes in the build output.
- [ ] No secret appears in any log line, error payload, or test snapshot.
- [ ] `URL_BLOCKED` and `IMPORT_FAILED` remain indistinguishable to the caller.
- [ ] Prompt-injection cases from `adversarial.json` all pass.

### Degradation

- [ ] All eleven `docs/demo.md` §5 rows pass, as tests.
- [ ] Every row of `docs/architecture.md` §10 verified.
- [ ] The invariant holds: **no single failure produces a blank screen.**

### Browser

- [ ] All ten `AGENTS.md` §7 checks, on the **production URL**, in all three modes.
- [ ] The full A→B→comparison journey timed and within budget.
- [ ] Console clean in every mode.
- [ ] 1440px, 1024px, 390px.
- [ ] Reduced-motion mode: no animation, narrative intact.
- [ ] Keyboard-only navigation through the whole journey.

### Docs versus reality

- [ ] Every file listed in `README.md`'s documentation table exists.
- [ ] Every command in `README.md` and `AGENTS.md` §6 runs and does what it claims.
- [ ] `docs/architecture.md` §9 deviations match what was actually built.
- [ ] Every dependency in `package.json` has a row in `docs/open-source.md` §1 with a license.
- [ ] Every `UNVERIFIED` item in `docs/research.md` §9 either remains marked or has been resolved with a source.
- [ ] No TODO, FIXME, or `console.log` left in shipped code paths.
- [ ] The velloe grep rule returns nothing.

## CONSTRAINTS

- **Do not fix findings silently.** Report each finding with its severity. Fix only what is trivially safe; anything else becomes a new task. An audit that quietly repairs its own findings destroys the record of what was wrong.
- Do not re-run the authors' tests and call it verification. Write independent checks — grep for the forbidden phrases, diff the schemas, break the lint rule, inspect the built bundle, open the production URL.
- Do not extend scope. This task verifies; it does not build.
- Do not soften findings to make the report look better. A finding honestly stated is the deliverable.

## IMPLEMENTATION

1. `scripts/audit.ts` — mechanical checks: forbidden-phrase grep over `src/` and `docs/`, purity grep for randomness/clock in `core/` and `engines/`, schema-versus-doc diff, dependency-versus-license-table diff, secret-prefix grep over build output, README command existence.
2. `docs/audit-report.md` — findings with severity, evidence, and status. Severity: **blocker** (breaks a product promise or the demo), **major** (breaks a documented behaviour), **minor** (cosmetic or documentary).
3. Independent manual walkthroughs, recorded with the actual steps taken and what was observed.
4. A final `docs/handover.md`: what exists, what does not, what is verified, what is not, and what the next three tasks would be.

## TESTS

The audit script is itself tested:

- `tests/audit-detects.test.ts` — deliberately insert a forbidden phrase, a `Math.random()` call in `core/`, and an undocumented schema field; confirm the audit catches all three. **An audit that has never failed is not known to work.**

## BROWSER VERIFICATION

The full journey on the production URL in Live, Degraded and Demo modes, plus the ten checks in each, plus a timed end-to-end run.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests            (the three deliberate-failure detections must be reported explicitly)
### Browser verification   (production URL, all three modes)
### Risks            (must include an honest list of what is NOT done and NOT verified)
### Next recommended task
```

The report must answer plainly: **what does not work, what was never tested, and what would break first under pressure?** A final audit that reports nothing but success has failed at its only job.
