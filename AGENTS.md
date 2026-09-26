# AGENTS.md — Operating Contract

This file governs every agent (human or AI) working in this repository. Read it before your first edit. If a task instruction conflicts with this file, this file wins — surface the conflict instead of resolving it silently.

---

## 1. What this project is

**Content Room** — an AI-powered synthetic-audience rehearsal environment. Content goes in; a relevant simulated audience forms; it reacts with structured events; the system explains why; the content improves; the same audience tests it again.

The product promise: **Rehearse before you publish.**

Read in this order before writing code:

1. `docs/product.md` — what we are and are not building
2. `docs/architecture.md` — the layers and the rules between them
3. `docs/api-contracts.md` — **the frozen contracts. This is the source of truth.**
4. `docs/simulation.md` — the engine you are extending
5. `docs/research.md` — why the stack is what it is

## 2. The operating loop

Every task, without exception:

```
READ → INSPECT → PLAN → IMPLEMENT → TEST → RUN → BROWSER VERIFY → REVIEW → COMMIT → REPORT
```

**Never claim something works without verification.** A passing build is not verification. Opening the app and using it is.

## 3. Hard rules

### 3.1 The contracts are frozen

`docs/api-contracts.md` is the interface between parallel worktrees. Changing a schema requires updating that file **first**, then the code, in the same commit. Never change a contract in code and leave the doc behind.

### 3.2 The core is pure

`src/core/` imports nothing from `app/`, `components/`, `server/`, `ingest/`, `providers/` or `engines/`. No IO, no network, no LLM, no framework, no `next/*`. It is the testable heart of the product and the reason the numbers can be trusted.

`engines/` and `providers/` may import from `core/`. They must never import from each other. `server/` is the only layer that composes.

### 3.3 Contracts are enforced by types, not discipline

Three literals protect product promises. Do not weaken them:

- `Metric.kind === 'simulated_estimate'` and `Metric.n` is required — no number exists without a sample size and a simulatated label.
- `Comparison.caveats` has `min(1)` — a caveat-free comparison cannot be constructed.
- `WhyReport.biggestSignal.evidence` has `min(1)` — an unexplained claim cannot be constructed.

If a design pressure makes one of these awkward, the design is wrong, not the constraint. Escalate.

### 3.4 Honesty is not negotiable

Never write, generate, or render:

> "100 people think this" · "predicted lift" · "expected conversion" · "accuracy: X%" · "guaranteed virality" · "X% of the market" · "statistically significant" · "margin of error"

Approved phrasings are in `docs/ui-ux.md` §7. Rationale is in `docs/validation.md` §6. Validation state is `'not_established'` and stays that way until real benchmarks exist in `evals/`.

### 3.5 Untrusted input stays untrusted

URLs, imported content, model output, API responses and persisted state are all hostile until validated:

- Every boundary validates with Zod. Never `JSON.parse` then cast.
- AI tasks wrap content in `<untrusted_content>` delimiters and state that the delimited region is data, never instructions.
- Streamed partial objects from AI SDK are deep-partial and **not schema-valid** — treat them as untrusted display data until the stream completes.
- No SSRF oracle: `URL_BLOCKED` and `IMPORT_FAILED` must be indistinguishable to the caller.
- Secrets are server-only, never `NEXT_PUBLIC_`, never logged, never echoed in errors.

### 3.6 No new dependency without a license row

Adding a runtime dependency requires adding a row to `docs/open-source.md` §1 with its license and a decision. A dependency with no license file means no rights — reject it.

### 3.7 Velloe is a fixture, not the domain

A case-insensitive grep for `velloe` outside `src/fixtures/velloe/`, `docs/demo.md`, `docs/product.md` and the pitch script is a bug.

### 3.8 Zero keys is a valid configuration

Every feature must work with no API keys, no network and no database. If your change breaks that, it is not done.

## 4. AI SDK version discipline — read this before writing any model code

Installed: `ai@7.0.116`. Most tutorials and training data show the **v4/v5** API, which is wrong here. Verified renames:

| Wrong (old) | Right (v7) |
|---|---|
| `generateObject({ schema })` | `generateText({ output: Output.object({ schema }) })` — `generateObject` is **deprecated** |
| `maxTokens` | `maxOutputTokens` |
| `system:` | `instructions:` |
| `providerMetadata` (input) | `providerOptions` |
| `fullStream` | `stream` |
| `onFinish` / `onStepFinish` | `onEnd` / `onStepEnd` |
| `experimental_output` | `output` |
| `result.toUIMessageStreamResponse()` | `createUIMessageStreamResponse({ stream: result.stream })` |

Also: `streamRetries` defaults to **0 (disabled)** — a mid-stream provider failure will not self-heal unless you set it. And there is **no built-in cross-provider fallback**; the provider chain in `src/providers/chain.ts` is ours and is required.

Do not write model code from memory. Query the installed types:

```bash
grep -n "partialOutputStream\|declare function streamText" node_modules/ai/dist/index.d.ts
```

## 5. Stack (frozen for tasks 001–013)

| Concern | Choice |
|---|---|
| Framework | Next.js 16.3.6 App Router, TypeScript strict, Node runtime |
| Styling | Tailwind v4.3.3 + shadcn/ui (vendored as source) |
| Animation | `motion` 13.4.4 — import from `motion/react`, **not** `framer-motion` |
| Icons | `lucide-react` |
| Room | own `d3-force` + canvas component (`d3-force`, `d3-selection` only — never full `d3`) |
| Charts | Recharts 3.10.1 (peer range verified to include React 19; no npm overrides needed) |
| AI | `ai@7` + `@ai-sdk/google` primary, `@ai-sdk/groq` fallback, fixtures last |
| Validation | Zod 4 — at every trust boundary |
| Persistence | `MemoryRunStore` default; `FileRunStore` local-dev only |
| Deploy | Vercel Hobby, `runtime = 'nodejs'`, `maxDuration = 120`, SSE not polling |

Changing any of these requires a documented reason in `docs/architecture.md` §9 — the section that already records deviations from the original brief.

## 6. Commands

```bash
npm run dev          # local dev
npm run build        # production build — must be zero-error
npm run typecheck    # tsc --noEmit
npm run lint
npm run test         # deterministic unit + contract + security tests
npm run test:watch
npm run eval         # AI capability evaluation against evals/*.json
npm run demo         # run the Velloe scenario headlessly, print stage timings
```

## 7. Browser verification — required for every UI task

Do not claim the UI works because it compiles. Open it and check all ten:

1. Landing page loads
2. Primary CTA works
3. Primary workflow completes end to end
4. Loading state appears and is specific
5. Error state works and is not a dead end
6. Result renders
7. Refresh does not corrupt the flow
8. Console has no unexpected errors
9. Desktop layout works (1440px)
10. Mobile layout does not obviously break (390px)

Record the outcome in the task report. "Compiles" is not one of the ten.

## 8. Git and parallel worktrees

```
main
├── worktree/foundation    (001, 002)
├── worktree/ingestion     (003, 004)
├── worktree/simulation    (005, 006, 007)
├── worktree/intelligence  (008, 009, 010, 011)
└── worktree/demo          (012, 013)
```

Rules:
- **Contracts first.** `docs/api-contracts.md` is the only shared mutable surface. Change it in `main`, then pull into worktrees.
- One task per branch. Commit at the end of each task.
- Never merge a worktree that leaves `npm run typecheck` or `npm run test` failing.
- `AGENTS.md`, `docs/`, `evals/` and `src/core/domain/` are shared. Treat any change to them as a coordination event: announce it in the task report.
- Do not start worktree work until the contracts exist, which they now do.

## 9. Task report format

Every task ends with exactly this:

```markdown
### Implemented
### Files changed
### Tests            (what was run, what passed, what was NOT verified)
### Browser verification   (the ten checks, with the actual outcome)
### Risks
### Next recommended task
```

Report failures faithfully. A skipped step must be named as skipped. "Tests pass" when some were not run is the single most damaging thing an agent can write in this repository.

## 10. Scope discipline

This is a hackathon vertical slice. Optimise for a compelling working demo of the thesis.

**Do not add:** Kubernetes, Kafka, Redis, Neo4j, microservices, an event bus, a custom agent framework, distributed infrastructure, auth, billing, teams, a design-system rewrite, or a general-purpose abstraction layer. The brief rules these out and research did not find one genuinely necessary.

**Do not build:** the OASIS adapter (deferred post-MVP), predictive-validity numbers (no data exists), or a durable run store (not needed for the demo).

If you believe something on these lists is necessary, say so in the task report with evidence. Do not build it unilaterally.

## 11. When blocked

Stop and report rather than guessing. Specifically: if a contract appears wrong, if a required dependency is unavailable, if browser verification cannot be completed, or if a task's acceptance criteria cannot be met within the stated constraints.

A precise report of a blocker is worth more than a plausible-looking workaround that will be discovered later.
