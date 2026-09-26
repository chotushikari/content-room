# Contributing

Read [`AGENTS.md`](AGENTS.md) first. It is the operating contract for this
repository and it is not decorative — it encodes the constraints that keep the
product's claims honest, and it wins over any instruction that conflicts with it.

## The short version

```bash
npm install
npm run dev            # http://localhost:3000
npm run verify         # typecheck + tests + build — run this before you push
```

No API keys are required. The whole journey works offline against the
deterministic engine, and that is the configuration CI tests.

## The four rules that are not negotiable

1. **`src/core/` stays pure.** No IO, no network, no model, no clock, no
   `Math.random()`, no framework imports. It is the testable heart of the
   product and the reason its numbers can be trusted. There is a preflight check
   for this.

2. **AI handles language; deterministic code handles every number.** If you find
   yourself asking a model for a percentage, a score, or a metric value, the
   design is wrong. Ask it for prose and assemble the number yourself — the
   `compose*` functions in `src/providers/` show the pattern.

3. **The contracts in [`docs/api-contracts.md`](docs/api-contracts.md) are frozen.**
   Change the document first, then the code, in the same commit. Several
   honesty guarantees are enforced by the schema itself and must not be relaxed:
   `Metric.n` required, `Metric.kind` a literal, `Comparison.caveats` `min(1)`,
   `WhyReport` evidence `min(1)`.

4. **Never weaken a test to make a change pass.** In particular
   `tests/features.test.ts` asserts that deliberately weak content scores below
   deliberately strong content, and the adversarial eval fails a run in which
   every simulated agent approves. Both exist to catch a model that has quietly
   become a rubber stamp, which is the failure that would make this product
   worthless while still looking like it worked.

## Making a change

1. Branch. `main` is expected to stay green.
2. Write the test first where you can. If a behaviour is worth having, it is
   worth a test that fails without it.
3. Run `npm run verify`.
4. If you change any number the deterministic engine produces, say so explicitly
   in the commit message. Those numbers are the product.
5. Commit with a message that explains *why*. The existing history is a decent
   template: it records what was measured, what was assumed, and what turned out
   to be wrong.

## Reporting a bug

Include the command you ran, what you expected, and what happened. If a claim in
the README or the docs is wrong, that is a bug too, and a more serious one than a
crash — please report it.

## Adding a dependency

Add a row to the decision table in [`docs/open-source.md`](docs/open-source.md)
recording the license and why the dependency is needed. The current runtime set is
MIT / ISC / Apache-2.0 throughout, and keeping it that way is deliberate: no
copyleft code was copied into this repository, including from projects used as
architectural references.
