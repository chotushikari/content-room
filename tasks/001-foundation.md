# 001 — Foundation

## TASK

Scaffold the Next.js application, install the frozen stack, implement `src/core/`, and prove it with contract tests.

## CONTEXT

Nothing exists yet except documentation. `docs/api-contracts.md` is frozen and is the interface every later task and every parallel worktree depends on. This task turns that document into real, validated, tested code and establishes the layering rules before anything can violate them.

**This is the highest-leverage task in the project.** Everything downstream imports what it produces. Getting the domain types wrong here costs every subsequent task.

## OBJECTIVE

1. A working Next.js 16 app that builds, typechecks and lints clean.
2. `src/core/domain/` materialising every schema in `docs/api-contracts.md`, with types inferred from Zod (never hand-written alongside).
3. `src/core/analytics/`, `src/core/comparison/`, `src/core/rng/`, `src/core/ids/`, `src/core/features/` implemented as pure functions.
4. `tests/contracts.test.ts` passing all ten obligations from `docs/api-contracts.md` §14.
5. A lint rule enforcing that `src/core/` imports nothing from the layers above it.

## ACCEPTANCE CRITERIA

- [ ] `npm run build`, `npm run typecheck`, `npm run lint` all pass with zero errors.
- [ ] Every schema in `docs/api-contracts.md` §§1–9 and §13 exists in `src/core/domain/` with the same field names and constraints.
- [ ] All ten contract-test obligations pass.
- [ ] `aggregate()` called twice on the same events returns byte-identical output (`JSON.stringify` equality).
- [ ] `generateAudience()` called twice with the same seed and DNA returns an identical `populationHash`.
- [ ] A controlled re-run with a differing `populationHash` throws `AudienceMismatchError`.
- [ ] No file in `src/core/` imports from `app/`, `components/`, `server/`, `ingest/`, `providers/`, `engines/`, or `next/*` — enforced by a lint rule, verified by deliberately breaking it once and seeing lint fail.
- [ ] Versions match `docs/architecture.md` §5 exactly.

## CONSTRAINTS

- Node 24.19.0 is installed; AI SDK 7 requires ≥22. Use `npm` (no pnpm/yarn/bun installed).
- Do not install `ai` or any provider package in this task — no model code is written yet. Zod is required.
- Do not build UI beyond a placeholder page. Task 002 owns the design system.
- Do not create `apps/` or `packages/` workspaces. Single app, enforced internal layering — see `docs/architecture.md` §9 for why.
- Do not implement the OASIS adapter.
- No new runtime dependency without a license row in `docs/open-source.md` §1.

## IMPLEMENTATION

1. `npx create-next-app@latest` → TypeScript, App Router, Tailwind, `src/` dir, import alias `@/*`. Confirm `next` resolves to 16.3.6.
2. Add `zod@4`. Configure `tsconfig.json` strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
3. Create the layer skeleton: `src/core/{domain,analytics,comparison,rng,ids,features}/`, `src/{engines,providers,ingest,server,components,fixtures,lib}/`.
4. Materialise the contracts, one file per domain area: `content.ts`, `dna.ts`, `audience.ts`, `simulation.ts`, `analytics.ts`, `report.ts`, `run.ts`, `events.ts`, `errors.ts`, `validation.ts`. Export types via `z.infer`. Re-export from `domain/index.ts`.
5. `src/core/rng/`: `mulberry32` plus `hash32(...parts)` and `rngFor(runSeed, agentId, round, stage)`. Order-independent by construction — this is what makes the engine reproducible while streaming.
6. `src/core/ids/`: `contentHash(asset)`, `populationHash(agents)`, `audienceId(...)`, `eventId(...)`. All deterministic, all documented as to which fields they include.
7. `src/core/features/extract.ts`: `extractFeatures(text, kind): ContentFeatures` per `docs/simulation.md` §3. Pure, documented keyword/rule sets, no model.
8. `src/core/analytics/aggregate.ts`: `aggregate(events, audience): MetricsBundle`. Every metric's formula lives in one place, and `method` strings are generated from the same source as the computation so they cannot drift.
9. `src/core/comparison/compare.ts`: `compare(a, b, audienceRef, reproducibility): Comparison`, always attaching the correct caveat text from `docs/api-contracts.md` §7.
10. `src/core/domain/audience-factory.ts`: segment expansion into personas using `rngFor`. Deterministic given `(seed, segments, size)`.
11. ESLint `no-restricted-imports` rule for `src/core/**`.
12. `.env.example` exactly as in `docs/deployment.md` §5.

## TESTS

- `tests/contracts.test.ts` — the ten obligations.
- `tests/analytics.test.ts` — purity, totality (empty / single / all-`IGNORE` event sets), metric arithmetic recomputed independently, `n > 0` everywhere.
- `tests/rng.test.ts` — determinism and **order independence**: producing the same events in a shuffled order yields the same set.
- `tests/audience.test.ts` — same seed ⇒ same `populationHash`; mismatch throws; 100 consecutive generations produce no collisions.
- `tests/features.test.ts` — golden inputs plus monotonicity (moving the value proposition earlier never decreases `promisePosition`).

Not verified in this task: anything visual, anything involving a model, anything requiring network.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification    (placeholder page only — state that explicitly)
### Risks
### Next recommended task
```
