# tests/

Deterministic verification of the pure core, the contracts, security boundaries and failure handling.

**This directory is for things that must pass or fail exactly.** Statistical evaluation of AI capability lives in `evals/` instead — a different harness with different failure semantics.

## Planned layout

```
tests/
├── contracts.test.ts           the ten obligations from docs/api-contracts.md §14
├── rng.test.ts                 determinism + order independence
├── audience.test.ts            hashing, determinism, diversity
├── features.test.ts            monotonicity of feature extraction
├── analytics-*.test.ts         purity, totality, independent metric recomputation
├── engine-*.test.ts            reproducibility, stage coverage, sensitivity, bounds
├── ssrf.test.ts                the full docs/validation.md §3.2 table
├── security.test.ts            secrets, oracles, injection
├── failure-injection.test.ts   the docs/validation.md §3.3 table
├── copy-guard.test.ts          forbidden phrases, everywhere, forever
├── audit-detects.test.ts       proves the audit script can actually fail
└── fixtures/                   recorded HTML/JSON for importer tests
```

## Rules

**No live network calls.** Importer and provider tests use recorded fixtures and stub providers. A test that depends on a third party's availability is a test that will fail during a demo.

**No model calls in `tests/`.** If a test needs a model, it belongs in `evals/`.

**Independent recomputation over implementation reuse.** For metrics, the test must recompute the value from raw events using its own arithmetic and compare. A test that calls the implementation to verify the implementation proves nothing.

**Two tests are load-bearing and must never be weakened:**

- `copy-guard.test.ts` — keeps the forbidden-phrase discipline (`docs/validation.md` §6) honest as the codebase grows. It is cheap and it protects the product's credibility.
- `audit-detects.test.ts` — proves the audit script *can* fail. An audit that has never failed is not known to work.

**Determinism means determinism.** No `Date.now()`, no `Math.random()`, no reliance on file-system ordering in any test of `src/core/`.

Where a test cannot verify something (a real browser, a real provider), say so in the task report under "Tests" rather than implying full coverage.
