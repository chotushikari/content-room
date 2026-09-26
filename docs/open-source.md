# Content Room — Open-Source Reuse Decisions

Companion to `docs/research.md` (which holds the evidence and URLs). This file holds the **decisions** and the reasoning, using the twelve-question template.

## Decision vocabulary

- **USE** — adopt as a dependency, unmodified.
- **ADAPT** — adopt through an adapter, or reimplement a pattern in our own code.
- **REFERENCE** — read it for architecture/UX ideas; copy no code.
- **REJECT** — do not use, with a stated reason.

---

## 1. Decision matrix

| Candidate | License | Decision | What we take | What we do not take |
|---|---|---|---|---|
| **OASIS** (`camel-oasis`) | Apache-2.0 | **ADAPT** (deferred, optional) | The `trace(user_id, created_at, action, info)` event shape; the action vocabulary; the pluggable-recommender idea | Python on the critical path; PyTorch/native-cairo install; async-only embedding |
| **MiroFish** | **AGPL-3.0** | **REFERENCE only** | Pipeline shape, persona schema shape, report/outline UI patterns, incremental event-feed polling pattern | Any source code (copyleft); Vue components; Zep dependency |
| **Vercel AI SDK** | Apache-2.0 | **USE** | `generateText`/`streamText` with `Output.object`; `partialOutputStream`; provider registry | Deprecated `generateObject`; reliance on built-in fallback (does not exist) |
| **Zod** | MIT | **USE** | Runtime validation at every trust boundary | — |
| **shadcn/ui** | MIT | **USE** | Components vendored as source we own | — |
| **Tailwind CSS v4** | MIT | **USE** | Styling + design tokens | — |
| **motion** | MIT | **USE** | Animation (`motion/react`) | `framer-motion` mirror |
| **lucide-react** | ISC | **USE** | Icons | — |
| **d3-force** | ISC | **USE** | The live room force layout | Full `d3` bundle |
| **Recharts** | MIT | **USE** | Before/after comparison charts | — |
| **open-graph-scraper** | MIT | **USE** | OG/Twitter-card metadata | — |
| **cheerio** | MIT | **USE** | JSON-LD + oEmbed `<link>` discovery | — |
| **@mozilla/readability** | Apache-2.0 | **USE** | Article body extraction (lazy-loaded) | — |
| **linkedom** | ISC | **USE** | Lightweight DOM for Readability | `jsdom` as default (7 MB, opt-in only) |
| **ip-address** | MIT | **USE** | SSRF address-range math | — |
| **react-force-graph** | MIT | **REJECT** | — | 235 KB gzip, heavy transitive deps, fiber-reuse bug |
| **cytoscape.js** | MIT | **REJECT** | — | 137 KB gzip; built for static network diagrams, not live agent state |
| **React Flow** | MIT | **REJECT** | — | A node-graph *editor*, wrong primitive for a swarm |
| **nivo** | MIT | **REJECT** | — | No live force layout; slow release cadence |
| **vis-timeline** | NOASSERTION | **REJECT** | — | License not clearly asserted |
| **got-ssrf** | **LGPL-3.0** | **REJECT** | — | License risk; `got`-only; does not fit undici `fetch` |
| **unfurl.js / oembed-parser / html-metadata-parser** | mixed | **REJECT** | — | Unmaintained (2021–2024) |
| **TinyTroupe / Concordia / AgentSociety / ai-town / sotopia / generative_agents** | MIT / Apache-2.0 | **REFERENCE** | Persona and memory patterns | No dependency; all are LLM-only and none emits engagement metrics |
| **BettaFish** | **GPL-2.0** | **REJECT** | — | Copyleft; not needed |
| **No-license synthetic-audience repos** | none | **REJECT** | — | A repository without a license grants no rights |

---

## 2. The twelve questions, answered for the two candidates that matter

### OASIS

| # | Question | Answer |
|---|---|---|
| 1 | What problem does it solve? | Multi-agent social simulation with a real feed/recommender and a defined action space. |
| 2 | Is it useful to Content Room? | Conceptually yes — closest domain match in open source. |
| 3 | Usable as a dependency? | Only in a Python 3.10/3.11 process; the app is TypeScript. |
| 4 | Adaptable code? | Apache-2.0 permits it, but OASIS is Python and our app is TS — adaptation means an out-of-process adapter, not copied code. |
| 5 | License? | Apache-2.0. Permissive. No commercial restriction in project metadata. |
| 6 | Runtime requirements? | Python 3.10/3.11 only, PyTorch via `sentence-transformers`, native cairo via `cairocffi`, async-only API, Linux-oriented container. |
| 7 | Requires paid APIs? | Yes in practice — every agent action is an LLM call. |
| 8 | Can it run locally? | Not on this machine: local Python is 3.13.5, and `camel-oasis` requires `<3.12`. |
| 9 | Hackathon-viable? | No, not as a critical-path dependency. |
| 10 | What happens if it fails? | Nothing, **provided** it is behind `SimulationEngine` and never imported by app code. This is the whole point of the adapter. |
| 11 | Actively maintained? | Yes on GitHub (pushed 2026-09-20). The PyPI release is stale (0.2.5). |
| 12 | What should we actually reuse? | The **event-log schema** (`trace`), the **action vocabulary**, and the **recommender abstraction**. Not the runtime. |

### MiroFish

| # | Question | Answer |
|---|---|---|
| 1 | What problem does it solve? | Seed document → knowledge graph → persona agents → OASIS social simulation → prediction report. |
| 2 | Is it useful? | Yes, as category validation and as a UI/architecture reference. |
| 3 | Usable as a dependency? | No — a Flask + Vue application, not a library. |
| 4 | Adaptable code? | Legally awkward (AGPL-3.0) and technically mismatched (Vue 3 vs our React). |
| 5 | License? | **AGPL-3.0** — network copyleft under §13. |
| 6 | Runtime requirements? | Python 3.11–3.12, `uv`, an LLM key, **and `ZEP_API_KEY`**, plus OASIS underneath. |
| 7 | Requires paid APIs? | Yes — LLM plus Zep Cloud. |
| 8 | Can it run locally? | Yes but heavy; the README itself warns to keep runs under 40 rounds. |
| 9 | Hackathon-viable? | As a second product to stand up alongside ours — no. |
| 10 | What happens if it fails? | Irrelevant, since it is not a dependency. |
| 11 | Actively maintained? | Yes — 74,772 stars, pushed 2026-09-16. |
| 12 | What should we actually reuse? | **Patterns only:** the 5-stage pipeline; individual-vs-institution persona prompt split; outline → per-section ReAct → assemble report agent with `outline.json`/`progress.json`/`agent_log.jsonl`; the incremental event feed; the report outline UI with per-section completion state. Reimplemented in TypeScript; no code copied. |

---

## 3. License risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Copying MiroFish code would trigger AGPL-3.0 §13 network copyleft | **High** | Reference-only. No MiroFish source enters this repository. Cite it as prior art in `README.md`. |
| BettaFish is GPL-2.0 | Medium | Not used. |
| `got-ssrf` is LGPL-3.0 | Medium | Hand-roll ~40 lines of SSRF validation instead. |
| OASIS `licenses/` directory, its HuggingFace user dataset, and Twhin-BERT weights have individually unverified terms | Medium | We reuse only the *schema shape* and *enums concept*, which are not copyrightable expression. If OASIS is ever adopted as a real engine, audit those separately first. |
| `AgentSociety` ships a `commercial` folder that is **not** Apache-2.0 granted | Medium | Reference only; if ever adopted, exclude that path. |
| Any dependency added without a license check | Medium | Rule: no new runtime dependency without a license recorded in this file. |
| Copyleft contamination through transitive dependencies | Low | All runtime deps chosen above are MIT / ISC / Apache-2.0. |

**Standing rule:** this file is the allow-list. Adding a runtime dependency requires adding a row here with its license. Do not add a dependency that has no license file — "no license" means "no rights".

---

## 4. What we deliberately build ourselves

Research found no library that does these. They are the product:

| Component | Why it cannot be bought or borrowed |
|---|---|
| `simulation-core` — deterministic persona engine emitting structured reaction events | No permissively-licensed, maintained library exists. All candidates are LLM-only, so none can serve the no-key requirement. |
| The **same-audience** re-simulation mechanism | **No open-source project does this at all** — verified absence across OASIS, MiroFish and the synthetic-audience category. This is the product's differentiator. |
| Deterministic aggregation / metrics / comparison | Must be pure functions over events so results are reproducible and testable. Borrowing would make the numbers unauditable — the opposite of what a rehearsal tool needs. |
| Evidence-linked "WHY" reporting | Requires provenance from metric → segment → event → excerpt, which no library models. |
| Provider fallback chain ending in deterministic fixtures | The final tier is not a model; nothing off-the-shelf provides it. |

That list is short and specific on purpose. Everything not on it is a dependency.
