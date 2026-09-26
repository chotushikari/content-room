# Content Room — Open-Source Research

**Status:** complete for the pre-implementation phase
**Research date:** 2026-09-26
**Method:** primary sources only — npm registry, PyPI JSON API, GitHub REST API, official docs, live HTTP probes.
**Rule for this document:** every claim carries a source. Anything not confirmable from a primary source is marked **UNVERIFIED** and must not be treated as a fact.

Version and license facts below were re-verified independently by direct registry/API calls on 2026-09-26, not taken from summaries.

---

## 0. Executive summary

1. **OASIS cannot be the primary runtime.** Every agent action is an LLM call, it requires Python 3.10/3.11 only, and it pulls a full PyTorch stack. It is an excellent *optional* higher-fidelity engine behind an adapter, and a terrible hackathon critical path.
2. **Its event log shape is worth copying anyway.** OASIS emits a `trace(user_id, created_at, action, info)` table. Content Room should emit the same shape so engines are swappable without touching aggregation.
3. **MiroFish is prior art and an architecture reference, not a dependency.** AGPL-3.0, Vue 3 frontend, requires Zep Cloud + an LLM key, and has no re-test/counterfactual mechanism — which is Content Room's core differentiator.
4. **No open-source project does same-audience before/after re-simulation.** That is genuine whitespace and should be stated explicitly in the pitch.
5. **Universal URL ingestion is impossible.** Instagram/LinkedIn/Facebook require app review plus tokens; X oEmbed works but returns only a blockquote; YouTube captions have no sanctioned no-auth path. Manual paste must be a first-class source, not an error state.
6. **Build the simulator ourselves; own the abstraction.** No maintained, lightweight, permissively-licensed "synthetic user panel → metrics" library exists.
7. **Vercel Hobby gives 300s function duration**, which is ample for a 30–60s streaming simulation. Streaming (not polling) is the correct pattern because detached background work has nowhere durable to live on the free tier.

---

## 1. Verified version matrix (2026-09-26)

Independently verified via `npm view` and `curl https://pypi.org/pypi/<pkg>/json`.

### Node / TypeScript

| Package | Version | Note |
|---|---|---|
| `node` (local) | 24.19.0 | AI SDK 7 requires `>=22` — satisfied |
| `npm` (local) | 11.17.0 | no pnpm/yarn/bun installed |
| `next` | 16.3.6 | |
| `react` | 19.3.0 | |
| `ai` | 7.0.116 | `engines: { node: '>=22' }` verified |
| `@ai-sdk/google` | 4.0.82 | |
| `zod` | 4.6.5 | |
| `tailwindcss` | 4.3.3 | v4 is the shadcn default |
| `shadcn` (CLI) | 4.21.0 | |
| `motion` | 13.4.4 | `framer-motion` is the deprecated mirror |
| `recharts` | 3.10.1 | peer `react: ^19.0.0` verified — no override needed |
| `d3-force` | 3.0.0 | |
| `open-graph-scraper` | 6.12.0 | |
| `lucide-react` | 1.48.0 | |

### Python (for the deferred OASIS adapter only)

| Package | Version | Constraint |
|---|---|---|
| `camel-oasis` | 0.2.5 | **`requires_python: <3.12,>=3.10.0`** verified |
| local default Python | 3.13.5 (anaconda) | **INCOMPATIBLE** — would need 3.10/3.11 |

Key transitive pins from PyPI metadata (verified verbatim): `camel-ai==0.2.78`, `sentence-transformers==3.0.0` (pulls `torch`), `igraph==0.11.6`, `cairocffi==1.7.1`, `unstructured==0.13.7`, `pandas==2.2.2`, `neo4j==5.23.0`, `requests_oauthlib==2.0.0`.

**Consequence:** `pip install camel-oasis` on this machine fails outright (Python 3.13), and even on 3.11 it pulls PyTorch plus native cairo. This is not a hackathon install.

---

## 2. Candidate reviews

### 2.1 OASIS (camel-ai/oasis)

| Field | Value | Source |
|---|---|---|
| URL | https://github.com/camel-ai/oasis | |
| License | **Apache-2.0** | GitHub API `license.spdx_id`; PyPI `license: Apache-2.0` |
| Stars | 5,195 | GitHub API |
| Last push | 2026-09-20 | GitHub API |
| Archived | false | GitHub API |
| PyPI package | `camel-oasis` | PyPI |
| PyPI freshness | 0.2.5 — **stale relative to git `main`** | PyPI |

**Problem it solves.** Multi-agent social-interaction simulation at scale: agents with profiles, a recommendation/feed system, a defined social action space, and a SQLite event log. Conceptually this is the closest thing that exists to what Content Room needs.

**Relevant components.**
- `ActionType` enum: `CREATE_POST`, `LIKE_POST`, `DISLIKE_POST`, `REPOST`, `QUOTE_POST`, `CREATE_COMMENT`, `FOLLOW`, `MUTE`, `SEARCH_POSTS`, `TREND`, `REFRESH`, `DO_NOTHING`, `PURCHASE_PRODUCT`, `INTERVIEW`, group actions. Content Room maps these to audience reactions (`LIKE`, `SHARE`, `SAVE`, `FOLLOW`, `CLICK`, `BUY`, `REJECT`).
- `RecsysType`: `random` | `twitter` | `reddit` | `twhin` — a pluggable feed recommender.
- `trace(user_id INTEGER, created_at DATETIME, action TEXT, info TEXT)` — **the integration surface worth imitating**.
- `AgentGraph` built from a CSV/JSON profile file; `agent_id` assigned by file order.
- Model backend via CAMEL `ModelFactory` / `ModelPlatformType`, which includes `OPENROUTER`, `GEMINI`, `OLLAMA`, and `OPENAI_COMPATIBLE_MODEL`, and accepts a custom `url=`.

**Can it be reused?** Yes, in principle — it is a proper importable async library: `generate_twitter_agent_graph(...)` → `oasis.make(...)` → `env.reset()` / `env.step(actions)` / `env.close()`, with `database_path` required to end in `.db`.

**Runtime requirements — the disqualifying detail.** Python 3.10/3.11 only; PyTorch via `sentence-transformers`; native cairo via `cairocffi`; async-only API; official container is Linux (`python:3.10-bookworm`). A locale-dependent encoding bug in the SQL schema loaders that breaks Windows was fixed on git `main` in 2026-08 but is **not in the 0.2.5 PyPI release**.

**Cost.** Not free-running, but cheap per small run. OASIS's own README benchmark: 100 agents, activation probability 1, 1 timestep ≈ 335,600 input tokens. Extrapolated to a 20-agent × 3-round demo that is ~200K input tokens — cents. Note the benchmark's `activation_probability` is documented only in the README, **not as a verified public API parameter**.

**Decision: `ADAPT THROUGH AN ADAPTER` (deferred, optional, out-of-process).**
Rationale: Apache-2.0 makes it safe; the domain match is the best available; but it cannot satisfy the no-API-key requirement, is install-hostile on this machine, and would put a PyTorch + native-cairo dependency on the critical path of a hackathon demo. Sits behind `SimulationEngine` as `OasisSimulationEngine`, gated on an API key and a Python 3.10/3.11 environment, never imported by application code.

---

### 2.2 MiroFish (666ghj/MiroFish)

| Field | Value | Source |
|---|---|---|
| URL | https://github.com/666ghj/MiroFish | |
| License | **AGPL-3.0** | GitHub API + LICENSE file |
| Stars | 74,772 | GitHub API |
| Last push | 2026-09-16 | GitHub API |
| Stack | Python/Flask backend, **Vue 3** frontend | repo |
| Hard deps | LLM key **and** `ZEP_API_KEY` (Zep Cloud) | README |

**What it actually is.** Not a flocking/boids simulation despite the name — "swarm" means a swarm of LLM agents, "Miro" means mirror. The pipeline is: seed document → Zep GraphRAG knowledge graph → one LLM persona per entity → **parallel dual-platform (Twitter + Reddit) OASIS simulation** → a `ReportAgent` writes a prediction report → you can interview agents.

**Crucially: it uses `camel-oasis==0.2.5` as its engine.** MiroFish is validation that the OASIS-shaped approach is a real product category.

**What it does NOT have.** No re-test / counterfactual / A-B mechanism. No per-agent state view, no cluster view, no charts. Its "simulation" UI is a monitoring dashboard with a two-column event feed polled every 2–3s. There is no "same audience, new content" comparison anywhere in the project.

**License implication.** AGPL-3.0 §13 is network copyleft: a modified version offered to remote users must offer Corresponding Source. Fine for an open demo; **not** fine to copy into a closed-source product.

**Decision: `USE AS REFERENCE` — explicitly do not copy code.**
What to reimplement as patterns (not lines): the 5-stage pipeline shape; the persona JSON schema with its individual-vs-institution prompt split; `ReportAgent`'s outline → per-section ReAct → assemble flow with `outline.json` / `progress.json` / `agent_log.jsonl` sidecars; the cursor-based incremental polling + append/dedupe-by-id event feed; the outline-with-completion-states report UI. Cite it in the README as prior art — 74k stars of validation is a strength in the pitch, not a weakness.

---

### 2.3 Adjacent simulation engines

| Project | License | Stars / last push | Fit | Decision |
|---|---|---|---|---|
| [TinyTroupe](https://github.com/microsoft/TinyTroupe) | MIT | 7,570 / 2026-07-03 | Best permissive persona-panel engine; no feed/recommender mechanics | `USE AS REFERENCE` |
| [Concordia](https://github.com/google-deepmind/concordia) | Apache-2.0 | 1,734 / 2026-09-23 | General generative social sim; no engagement metrics; heavier conceptual model | `USE AS REFERENCE` |
| [AgentSociety](https://github.com/tsinghua-fib-lab/AgentSociety) | Apache-2.0 **except a `commercial` folder** | 1,309 / 2026-09-24 | Most complete permissive platform *with a React frontend*; note the carved-out non-Apache folder | `USE AS REFERENCE` |
| [ai-town](https://github.com/a16z-infra/ai-town) | MIT | 10,549 / 2026-08-26 | TypeScript live-agent-world UI; it is a game town, not an audience | `USE AS REFERENCE` |
| [sotopia](https://github.com/sotopia-lab/sotopia) | MIT | 334 / 2026-06-05 | Evaluation methodology for social interaction | `USE AS REFERENCE` |
| [generative_agents](https://github.com/joonspk-research/generative_agents) | Apache-2.0 | 22,147 / **2024-08-05** | Canonical memory/reflection architecture; unmaintained ~2 yrs | `USE AS REFERENCE` |
| [CAMEL](https://github.com/camel-ai/camel) | Apache-2.0 | 17,776 / 2026-09-20 | Its `ModelPlatformType` backend layer is genuinely useful | `USE AS REFERENCE` |
| [BettaFish](https://github.com/666ghj/BettaFish) | **GPL-2.0** | 42,294 | Upstream seed generator for MiroFish | `DO NOT USE` (license) |

**Conclusion: there is no well-maintained, lightweight, permissively-licensed library that turns a content asset into a synthetic-audience metrics report.** We build `simulation-core`. This is the honest finding, and it is also why the project is worth building.

---

### 2.4 "Synthetic audience" product category

Searched directly. Every direct hit is a zero-traction personal project — reported honestly rather than padded: `ReelLab-AI` (MIT, 0★), `ai-video-ad-simulation-core` (0★), `TweetViralitySimulator` (Apache-2.0, 1★), `SAPIENT-Framework` (no license → reject), `consumer_intelligence_platform` (no license → reject), `FocusGroup` (R, 0★). One project (`Hasnain91169/ATLAS`) already repurposes MiroFish for audience-reaction prediction, which is weak third-party evidence that the use case is real.

**Decision for the whole category: `USE AS REFERENCE` at most.** No dependency exists to adopt.

---

## 3. AI orchestration — Vercel AI SDK

### 3.1 Version and hard constraints (verified)

`ai@7.0.116`, `engines: { node: '>=22' }`. All AI SDK packages are ESM-only in v7. Local Node is 24.19.0, so this is satisfied.

### 3.2 Structured output — API verified by reading the shipped types

This is the single highest-risk API detail, so it was verified by installing `ai@7.0.116` and reading `dist/index.d.ts` plus a runtime export probe, not by trusting docs.

- **`generateObject` / `streamObject` are deprecated.** The shipped type declaration carries, verbatim: `@deprecated Use generateText with an output setting instead.` Both are still exported and functional.
- **The current shape is `generateText` / `streamText` with `output`:**

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: google('gemini-flash-latest'),
  output: Output.object({ schema: ContentDNASchema, name: 'ContentDNA' }),
  instructions: '...',   // `system` still works but is the legacy name
  prompt: '...',
});
```

- `Output` is exported at runtime with exactly these members: `object`, `array`, `choice`, `json`, `text`. **Verified by runtime probe.**
- `Output.object({ schema, name?, description? })` returns `Output<OBJECT, DeepPartial<OBJECT>, never>`. The **complete** output is validated against the schema at runtime; **streamed partials are deep-partial and are explicitly not schema-valid** — the UI must treat partial objects as untrusted until the stream completes.
- `Output.array({ element, minItems?, maxItems? })` exposes `elementStream`, where each emitted element *is* complete and validated. This is the right primitive for "one agent reacts at a time".
- Result surfaces on `streamText`: `partialOutputStream` (current), `experimental_partialOutputStream` (deprecated), `elementStream`, `stream` (replaced `fullStream`).
- Failure throws `NoObjectGeneratedError` (exported, verified) exposing `cause`, `text`, `response`, `usage`. `repairText` exists for salvage; `extractJsonMiddleware` strips markdown fences.

### 3.3 Parameter renames that will bite (verified against types/docs)

| Change | Version |
|---|---|
| `maxTokens` → `maxOutputTokens` | 5.0 |
| input `providerMetadata` → `providerOptions` | 5.0 |
| `CoreMessage` → `ModelMessage`; tool `parameters` → `inputSchema` | 5.0 |
| `generateObject`/`streamObject` deprecated | 6.0 |
| `experimental_output` → `output`; `system` → `instructions`; `fullStream` → `stream`; `onFinish` → `onEnd`; `onStepFinish` → `onStepEnd` | 7.0 |
| `toUIMessageStreamResponse()` deprecated in favor of standalone `createUIMessageStreamResponse({ stream: result.stream })` | 7.0 |

Most third-party tutorials and LLM training data show the v4/v5 API (`generateObject`, `maxTokens`, `system`). **Code written from memory will be wrong.** This table is the antidote.

### 3.4 Provider abstraction

Packages: `@ai-sdk/google` (default export `google`, key `GOOGLE_GENERATIVE_AI_API_KEY`), `@ai-sdk/openai`, `@ai-sdk/groq`, `@ai-sdk/openai-compatible` (`createOpenAICompatible({ name, apiKey, baseURL, headers, supportsStructuredOutputs })`), community `@openrouter/ai-sdk-provider`, `ollama-ai-provider-v2`.

Swap strategies: `createProviderRegistry({ google, groq })` plus `registry.languageModel('google:...')`, or `customProvider({ languageModels })` to name an app-level model alias like `'room:reasoner'`. Both verified in the runtime export list.

Note `createOpenAICompatible` requires `supportsStructuredOutputs: true` to get schema-validated JSON.

### 3.5 Fallback — there is none built in

**Verified by inspecting the full runtime export list:** the SDK ships middleware `extractReasoningMiddleware`, `extractJsonMiddleware`, `simulateStreamingMiddleware`, `defaultInstructionsMiddleware`, `defaultSettingsMiddleware`, `addToolInputExamplesMiddleware`. There is **no cross-provider error-fallback wrapper**. `RetryError` exists as an error type only.

So fallback must be hand-rolled as an explicit chain, which is exactly what the product requires anyway:

```
live provider → alternate provider → deterministic fixture provider
```

Retry semantics, verified from the type docs: `maxRetries` defaults to **2** and covers errors while *starting* a model call; `streamRetries` is new in v7, defaults to **0 (disabled)**, and covers provider errors received *after* streaming has begun. Leaving `streamRetries` at its default is the reason a mid-stream failure will not self-heal — set it deliberately.

Community option: `ai-fallback@3` targets AI SDK v7. Hand-rolling is preferred here because the third tier is not a model at all, it is a fixture provider.

### 3.6 Streaming to the browser

Server: `streamText({ output: Output.object({ schema }) })` then consume `partialOutputStream`, and return `createUIMessageStreamResponse({ stream: result.stream })`.
Client: `useObject({ api, schema })` from `@ai-sdk/react`, returning `{ object, submit, stop, error, isLoading, clear }`.

### 3.7 Server-side batch

Supported: the official Node quickstart is a plain Node script. For ~50 agents the practical pattern is `Promise.all` over `generateText(...)` behind a concurrency limiter. There is no official 50-way orchestration primitive (**UNVERIFIED as a documented pattern**); the SDK's experimental Batch API is provider-specific.

---

## 4. Model access — free-tier reality check

| Provider | Free tier | Limits | Source |
|---|---|---|---|
| **Google Gemini** | Yes, key required | Free tier exists for Gemini 3.x Flash/Pro. **Per-model free RPM/TPM/RPD is no longer published** — docs defer to AI Studio and state limits are per project, reset midnight PT, and are not guaranteed. Free-tier content is used to improve Google's products. Batch/Flex are paid-only. | https://ai.google.dev/gemini-api/docs/pricing , https://ai.google.dev/gemini-api/docs/rate-limits |
| **Groq** | Yes, key required | Free plan per model ≈ 30 RPM / 1K RPD / 8K TPM for `gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`. Limits are org-level, first-hit wins. | https://console.groq.com/docs/rate-limits |
| **OpenRouter** | Yes, key required | **20 RPM always; 50 requests/day** until ≥~10 credits purchased all-time, then 1,000/day. Tier is set by all-time credits. ~21 of ~458 models are at zero price. | https://openrouter.ai/docs/api-reference/limits |
| **Ollama** | Free, no key | Local only. Verified sizes: `qwen3:0.6b` 523 MB, `qwen3:1.7b` 1.4 GB, `qwen3:4b` 2.5 GB, `llama3.2:1b` 1.3 GB, `llama3.2:3b` 2.0 GB. Native structured outputs via `format` JSON Schema. **Not installed on this machine.** | https://ollama.com/blog/structured-outputs |
| **Deterministic fixtures** | Free, no key, offline | Our own. The only tier that satisfies the hard requirement. | — |

**Verdict.** Primary = **Gemini** (best quality, native structured output, best free throughput for a 50-agent run). Fallback = **Groq** (fast, ~3K requests/day across three models, but watch the 8K TPM ceiling: 50 agents × ~800 tokens ≈ 40K tokens ≈ ~5 minutes of pacing). Optional local tier = **Ollama**, which by definition can never run on deployed Vercel serverless. Final tier = deterministic fixtures.

**UNVERIFIED:** exact Gemini free-tier per-model quotas (removed from docs); Ollama CPU-only tokens/sec (no official benchmark — and Ollama is not installed here, so this cannot be measured locally without a download).

---

## 5. Content ingestion

### 5.1 The honest framing

Universal scraping does not exist. The **only** sanctioned free no-auth surface is oEmbed + OpenGraph/JSON-LD metadata, plus the YouTube Data API with a key. Even working importers return metadata only — never the full post body or caption.

Therefore: **`ManualContentImporter` is a first-class source, not an error state.** The manual editor should be pre-filled with whatever partial metadata did resolve, so the fallback reads as a continuation rather than a failure.

### 5.2 Metadata extraction packages (verified)

| Package | Version | License | Last publish | Verdict |
|---|---|---|---|---|
| `open-graph-scraper` | 6.12.0 | MIT | 2026-06-26 | **USE** — primary. Fetches and parses OG/Twitter cards. `engines: >=20`. Serverless-safe, pure JS. |
| `cheerio` | 1.2.0 | MIT | 2026-01-23 | **USE** — for JSON-LD and oEmbed `<link rel="alternate" type="application/json+oembed">` discovery. |
| `metascraper` + presets | 5.58.1 | MIT | 2026-09-17 | **ADAPT** — fallback only; `engines: >=22`. |
| `unfurl.js` | 6.4.0 | ISC | 2024-02-13 | `DO NOT USE` — stale ~2.5 years |
| `oembed-parser` | 3.1.6-rc1 | MIT | 2022-12-01 | `DO NOT USE` — unmaintained, stuck on an RC |
| `html-metadata-parser` | 2.0.4 | MIT | 2021-12-29 | `DO NOT USE` — abandoned |

### 5.3 oEmbed reality, probe-tested today

| Platform | Endpoint | Auth | Observed result |
|---|---|---|---|
| YouTube | `youtube.com/oembed?format=json` | none | **200 JSON** — `title`, `author_name`, `thumbnail_url`. **No description field.** |
| Vimeo | `vimeo.com/api/oembed.json` | none | **200 JSON** for embeddable videos; **404** for removed/non-embeddable — treat 404 as normal |
| X / Twitter | `publish.twitter.com/oembed` → 301 → `publish.x.com/oembed` | none | **200 JSON — still working.** Returns only a blockquote + `author_name`. **No thumbnail, no media.** |
| Spotify | `open.spotify.com/oembed` | none | Registered provider |
| TikTok | `tiktok.com/oembed` | none | Registered, but our probe hit a geo-redirect (302). Treat as best-effort with visible degradation. |
| Instagram | `graph.facebook.com/.../instagram_oembed` | **token** | **400 OAuthException** — requires a Meta app |
| Facebook | `graph.facebook.com/.../oembed_*` | **token** | requires a Meta app |
| LinkedIn | `linkedin.com/oembed` | — | **HTTP 404.** LinkedIn is absent from the oEmbed provider registry. Not supported. |

ToS findings (verified from live text): Instagram's `robots.txt` prohibits automated collection without express written permission; YouTube's ToS prohibits automated access outside robots.txt-permitted public search engines.

**Ship as working:** generic web URL (OG/JSON-LD/Readability), YouTube, Vimeo, X (metadata only), Spotify, TikTok (best-effort).
**Do not claim working:** Instagram, LinkedIn, Facebook, and any timeline or comment scraping on any platform.

### 5.4 YouTube specifics

- Sanctioned no-key path: oEmbed (title/author/thumbnail only).
- Watch-page HTML exposes `ytInitialPlayerResponse.shortDescription` — this is scraping and violates the ToS clause above.
- **Captions/transcripts have no sanctioned no-auth path.** Official `captions.download` requires OAuth and permission to edit the video; unofficial libraries hit `/api/timedtext` or `/youtubei/`, both of which YouTube's own `robots.txt` disallows. **Recommendation: do not ship transcript fetching.** If ever demoed, label it unofficial-and-may-fail.
- Sanctioned path with a key: YouTube Data API v3 `videos.list?part=snippet` = 1 unit against a default 10,000 units/day.

### 5.5 Article extraction

| Package | Version | License | Verdict |
|---|---|---|---|
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | **USE** — 155 KB, zero dependencies |
| `linkedom` | 0.18.13 | ISC | **USE** — lighter DOM (888 KB), lazy-imported only on the article path |
| `jsdom` | 30.1.1 | MIT | **ADAPT** — 7 MB / 665 files; opt-in upgrade only, never the default |

Pattern: OG/JSON-LD first (cheap, common path), then **lazily import** Readability + linkedom only when body text is actually missing, so the heavy DOM never loads on the common path.

### 5.6 SSRF — this is our problem, Vercel does not help

No Vercel documentation promising an egress/SSRF guard was found; Vercel Functions use dynamic outbound IPs by default on the free tier, and destination-side allowlisting is paid. No maintained drop-in SSRF guard exists for undici/`fetch` (`request-filtering-agent` targets `http.Agent`, not undici; `got-ssrf` is LGPL-3.0 — avoid).

Required checklist (OWASP SSRF Prevention Cheat Sheet plus additions):

1. Protocol allowlist: `http`/`https` only. Reject `file:`, `gopher:`, `data:`, `ftp:`, `dict:`.
2. Reject parser-disagreement URLs (e.g. `http://example.com\@evil.com`).
3. Reject embedded credentials/userinfo; allowlist ports.
4. Resolve **all** A and AAAA records and validate every address.
5. Block IPv4 `127/8`, `0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (incl. IMDS `169.254.169.254`), `100.64/10`, `198.18/15`, `224/4`, `240/4`; IPv6 `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `::ffff:0:0/96`. Use `ip-address` (MIT) for the math.
6. DNS rebinding: native `fetch` exposes no socket hook, so true resolve-then-connect pinning requires `undici` with a custom `connect`/`lookup`. Document the residual TOCTOU window if not pinned.
7. `redirect: 'manual'`, re-validate every hop, cap at ~3 hops.
8. `AbortSignal.timeout(5000–8000)` per hop plus a total wall-clock budget.
9. Cap response size (~1–2 MB) by streaming the body and aborting past the cap.
10. Content-Type allowlist: `text/html`, `application/xhtml+xml`, `text/plain`, `application/json`.
11. Never echo upstream bodies, headers, status text, or DNS/TLS errors back to the client — no blind-SSRF oracle.
12. Rate-limit per client and cap concurrency (Vercel shares 1,024 file descriptors across concurrent executions).

---

## 6. UI stack

| Concern | Decision | Reason |
|---|---|---|
| Components | **shadcn/ui** (`shadcn@4.21.0` CLI, MIT) with **Tailwind v4** | Radix primitives we own as source; `--chart-N` tokens integrate with Recharts |
| Animation | **`motion`** 13.4.4 (import from `motion/react`) | `framer-motion` is now a deprecated compatibility mirror, 4.7 MB vs 741 KB |
| Icons | **`lucide-react`** 1.48.0 | Already shadcn's default; tree-shaken named imports |
| Room visualization | **own `d3-force` + `d3-selection` canvas component** | 30–100 nodes is CPU-trivial; full control over state encoding; ISC license; no React-19 peer risk |
| Comparison charts | **Recharts** 3.10.1 | Peer range verified to include React 19 → no overrides; wrapped by shadcn's chart component |
| Typography | **Geist Sans + Geist Mono** via `next/font` | Self-hosted at build time, no browser request to Google; OFL |

Rejected for the room view: `react-force-graph` (235 KB gzip and drags in 3D/VR/AR deps; known fiber-reuse issue), `cytoscape.js` (137 KB gzip for eye-candy; built for static network diagrams), `React Flow` (a DAG editor, not a swarm), `nivo` (slower cadence, no live force layout). `sigma.js` is the correct *upgrade path* only if we ever exceed ~1,000 agents.

Note: **Recharts 3.x peers already accept React 19**, so the historical `react-is` npm override is unnecessary. If a peer conflict appears it will be from another package.

---

## 7. Deployment — Vercel Hobby

| Constraint | Value | Source |
|---|---|---|
| Function duration, Hobby | default **300s**, max **300s** (>300s requires Pro/Ent) | https://vercel.com/docs/functions/limitations |
| Edge runtime | must begin responding within 25s, then may stream up to 300s; `runtime = 'edge'` is **deprecated** in Next.js 16.3 | https://vercel.com/docs/functions/runtimes/edge |
| Request/response body | max **4.5 MB** | https://vercel.com/docs/functions/limitations |
| Memory | 2 GB / 1 vCPU; bundle 250 MB uncompressed; 1,024 shared file descriptors | same |
| Vercel Cron, Hobby | **minimum interval once per day**; sub-daily expressions fail deployment; scheduling precision ±59 min | https://vercel.com/docs/cron-jobs/usage-and-pricing |
| Background work | `waitUntil` / `after()` share the invocation deadline — **promises are cancelled when the function times out** | https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package |
| Cold start | Low impact: Fluid compute on by default, bytecode caching in production, deployment pre-warming. The *first* request is not cached — warm the route before judging. | https://vercel.com/docs/fluid-compute |

**Is a single 30–60s streaming simulation feasible on free? Yes.** 300s budget with large headroom, and streaming keeps the response alive.

**Recommended pattern: SSE via a streaming route handler, not polling.** On Hobby there is nowhere durable for a detached job to live — cron is once-per-day and `waitUntil` work dies with the invocation. So the simulation must run *inside* the request that the browser is already streaming.

```ts
// app/api/room/route.ts
export const runtime = 'nodejs';   // edge is deprecated and adds a 25s TTFB rule
export const maxDuration = 120;    // ≤300 on Hobby
// stream events as they are produced; emit heartbeats so intermediaries don't close idle connections
```

Two caveats: emit progress/heartbeat events during long silences (Vercel only sends HTTP/2 `PING` frames, so HTTP/1.1 idle connections can be closed), and if the client disconnects mid-run, work is aborted unless finalization is handed to `after()`.

**UNVERIFIED:** Vercel AI Gateway monthly included-credit amount; whether Vercel explicitly documents the absence of an SSRF guard (corroborated only by absence).

---

## 8. Recommended reuse map

```
OASIS (Apache-2.0)            → REFERENCE for the trace event-log schema;
                                ADAPT later as an optional out-of-process engine
MiroFish (AGPL-3.0)           → REFERENCE ONLY for pipeline + report UI patterns.
                                No code copied.
shadcn/ui (MIT)               → USE   UI primitives
Tailwind v4                   → USE   styling
motion (MIT)                  → USE   animation
lucide-react (ISC)            → USE   icons
d3-force (ISC)                → USE   the live room
Recharts (MIT)                → USE   before/after comparison
Vercel AI SDK (Apache-2.0)    → USE   orchestration + structured output
Zod (MIT)                     → USE   runtime validation at every boundary
open-graph-scraper (MIT)      → USE   metadata extraction
cheerio (MIT)                 → USE   JSON-LD + oEmbed discovery
@mozilla/readability (Apache) → USE   article body
linkedom (ISC)                → USE   lightweight DOM (lazy)
ip-address (MIT)              → USE   SSRF range math
Gemini free tier              → USE   primary model
Groq free tier                → USE   fallback model
Ollama                        → USE   optional local tier (never on Vercel)
deterministic fixtures        → BUILD the final fallback tier ourselves
simulation-core               → BUILD
analytics / validation layer  → BUILD
```

---

## 9. Consolidated UNVERIFIED list

These were not confirmed from a primary source and must not be asserted as fact in the product, the pitch, or any doc without further checking:

1. Exact Gemini free-tier per-model RPM/TPM/RPD (removed from official docs; defers to AI Studio).
2. Groq rate-limit page last-updated date (values are a live snapshot).
3. Ollama CPU-only tokens/sec (no official benchmark; not installed locally).
4. Whether `ModelPlatformType.STUB` in CAMEL could satisfy OASIS's tool-calling requirement.
5. Number of internal LLM calls per agent per OASIS tick (only the 100-agent token benchmark is verified).
6. Whether `activation_probability` is a public OASIS API parameter (README-only).
7. Whether `cairocffi` actually fails at import time on Windows.
8. Per-component licenses inside OASIS's `licenses/` directory, its HuggingFace dataset, and Twhin-BERT weights.
9. Vercel AI Gateway monthly free-credit amount.
10. Whether Vercel documents the absence of SSRF egress filtering (corroborated by absence only).
11. TikTok oEmbed response body (geo-blocked from this network).
12. `streamdown` and `vis-timeline` license terms (both report `NOASSERTION`).
13. Whether `generateObject`/`streamObject` are removed in AI SDK v8 (deprecated, not removed, in 7.0.116).

## 10. Change-log discipline

Every fact in this document has a date and a source. Providers, free tiers, and AI SDK majors move fast. **Re-verify §1, §3, and §4 before the demo**, and update this file rather than silently depending on a stale fact.
