# scripts/

Operational tooling. Not part of the runtime bundle.

## Planned scripts

| Script | Command | Purpose |
|---|---|---|
| `demo.ts` | `npm run demo` | Runs the Velloe scenario headlessly with `instant` pacing and prints per-stage timings. Used to prove the demo fits the 88-second budget without watching it. |
| `eval.ts` | `npm run eval` | The evaluation harness. Loads `evals/*.json`, runs each case, prints per-case results and pass rates, exits non-zero on failure. Flags: `--set=golden\|regression\|adversarial\|all`, `--provider=fixtures\|live`, `--accept=<caseId>` for regression snapshots. |
| `preflight.ts` | `npm run preflight` | The `docs/demo.md` §6 checklist, automated where practical: build, typecheck, lint, test, eval, three timed demo runs, the velloe grep rule, and a bundle check confirming `d3-force`/`motion` are absent from the landing route. |
| `audit.ts` | `npm run audit` | The task 013 mechanical audit: forbidden-phrase grep across `src/` and `docs/`, purity grep for randomness/clock in `core/` and `engines/`, schema-versus-doc diff, dependency-versus-license-table diff, secret-prefix grep over build output, README command existence. |
| `new-task.ts` | `npm run new-task` | (optional) Scaffolds a task file from the `AGENTS.md` §9 report template. |

## Rules

- Scripts never write to `src/`. They read, verify, and report.
- `--accept` is the only flag that mutates a tracked file, and only `evals/regression.json` snapshots. Any use of it must be visible in the commit diff with a stated reason.
- Every script exits non-zero on failure. A verification script that always exits zero is worse than no script, because it manufactures false confidence.
- `audit.ts` is itself tested by `tests/audit-detects.test.ts`, which deliberately introduces three defects and confirms all three are caught.
