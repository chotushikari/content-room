# Content Room — Deployment

## 1. Target

Vercel, free (Hobby) tier. Next.js 16.3.6 App Router. Node runtime only.

## 2. Verified platform constraints

Independently verified from Vercel's docs on 2026-09-26 (sources in `docs/research.md` §7):

| Constraint | Hobby value | Consequence for us |
|---|---|---|
| Function duration | default **300s**, max **300s** (>300s needs Pro/Ent) | A 30–60s run has large headroom. Set `maxDuration = 120`. |
| Request/response body | **4.5 MB** | Our payloads are small; the 20,000-char content cap is far below this. |
| Memory | 2 GB / 1 vCPU | Fine. Concurrency is not a CPU problem at 24–60 agents. |
| Bundle (uncompressed) | 250 MB | Largest single item is `jsdom` at 7 MB, and it is lazy-loaded. |
| File descriptors | 1,024 shared across concurrent executions | Cap SSRF fetch concurrency; do not hold many sockets. |
| Cron | **minimum once per day**; sub-daily expressions fail deployment | Scheduled background work is unusable. Do not plan around cron. |
| `waitUntil` / `after()` | share the invocation deadline; **cancelled when the function times out** | No durable detached jobs. Work must live inside the streaming request. |
| Edge runtime | must begin responding within 25s; `runtime = 'edge'` is **deprecated** in Next.js 16.3 | Use `nodejs` everywhere. |
| Cold start | Fluid compute on by default; bytecode caching in production; deploy pre-warming | Low impact. The first request after deploy is not bytecode-cached — **warm the route before judging.** |

## 3. Route configuration

```ts
// app/api/runs/route.ts        and        app/api/runs/[id]/resimulate/route.ts
export const runtime = 'nodejs';   // required: edge is deprecated and adds a 25s TTFB rule
export const dynamic = 'force-dynamic';
export const maxDuration = 120;    // ≤300 on Hobby
```

Why `nodejs`: `cheerio`, `open-graph-scraper`, `undici`, `@mozilla/readability` and `linkedom` all need Node, and the AI SDK requires Node ≥ 22 (local Node is 24.19.0). The edge runtime would also impose a 25s time-to-first-byte rule, which conflicts with a long ingest-then-simulate pipeline.

## 4. Why streaming, not polling

On the free tier there is **nowhere durable for a detached job to live**: cron cannot run sub-daily, and `waitUntil` work is cancelled at the invocation deadline. A poll-based architecture would therefore require either a paid tier or an external queue — both of which the brief rules out unless research proves them necessary. It does not.

So the simulation runs **inside the request the browser is already consuming**:

```
browser ──POST /api/runs──► route handler
                              ├─ ingest
                              ├─ DNA
                              ├─ audience
                              ├─ simulate (streams agent_event)
                              ├─ metrics
                              ├─ why
                              └─ brief + versionB
        ◄── text/event-stream ── one RunEvent per data: line
```

Two consequences that must be implemented, not merely noted:

1. **Heartbeats are mandatory.** Vercel sends HTTP/2 `PING` frames but an idle HTTP/1.1 connection can be closed by an intermediary. Emit a `heartbeat` event whenever a stage is silent for >5s.
2. **Client disconnect must abort work.** Pass an `AbortSignal` down through providers and engines. A disconnected browser must not leave a 60-second model fan-out running.

## 5. Environment variables

`.env.example` (committed, no secrets):

```
# Live model tiers — all optional. With none set, the app runs in demo mode.
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_API_KEY=

# Local-only tier. Cannot work on deployed Vercel serverless.
OLLAMA_BASE_URL=http://localhost:11434/api

# Optional: YouTube Data API v3, raises metadata quality from oEmbed-only.
YOUTUBE_API_KEY=

# Runtime
CONTENT_ROOM_MAX_AUDIENCE=120
CONTENT_ROOM_RUN_STORE=memory        # memory | file   (file is LOCAL ONLY)
CONTENT_ROOM_FETCH_TIMEOUT_MS=8000
CONTENT_ROOM_MAX_RESPONSE_BYTES=2000000
```

Rules:
- Server-only. None is prefixed `NEXT_PUBLIC_`, so none can enter a client bundle.
- Never logged, never echoed in an error payload.
- `.env.local` is git-ignored; `.env.example` is committed.
- **Zero keys must be a valid configuration**, not a broken one. This is asserted by a test in `evals/`.

## 6. Persistence reality

Vercel's serverless filesystem is read-only apart from `/tmp` and is not durable. There is therefore **no persistent run history on the free tier**, and this is accepted deliberately rather than worked around:

- `MemoryRunStore` is the default and always works — this is what satisfies the brief's "database unavailable" requirement.
- `FileRunStore` writes `.data/runs/*.json` for **local development and tests only**. It must refuse to run when `process.env.VERCEL` is set, and log why.
- Consequence for the user: the demo is a single uninterrupted session, and a mid-run page refresh restarts that run. The UI states this rather than showing a broken half-state. Runs are short and re-runnable by design, which is the mitigation.
- A durable hosted store (Vercel Blob, KV, or Postgres) is a **post-MVP decision**, not a hackathon task.

## 7. Deploy sequence

Deploy early — immediately after the first vertical slice works (task 007), not at the end.

```bash
vercel link
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production   # optional
vercel --prod
```

Then verify **in production**, not locally:

| Check | Why |
|---|---|
| Landing page loads cold | first request after deploy is not bytecode-cached |
| Full run streams end to end | confirms SSE survives Vercel's proxy |
| Run with **no keys set** | confirms the demo-mode contract on the real platform |
| Duration stays under 300s | `maxDuration = 120` plus a real network |
| `maxDuration` accepted | a value >300 is silently a Hobby violation |
| URL ingest works from Vercel's egress IP | geo-blocking and egress differences are real (TikTok blocked us in testing) |
| CORS | same-origin only; no cross-origin API surface should exist |
| No secret in client bundle | grep the built output for key prefixes |
| Cold-start latency measured | know the number before a judge sees it |

## 8. Known deployment risks

| Risk | Mitigation |
|---|---|
| Sub-daily cron silently fails deployment | Never add a cron. Not needed by the architecture. |
| Long idle SSE connection closed | Mandatory heartbeats. |
| Provider rate limits during a live demo | Prefer the deterministic engine for the live demo; keep live mode for a recorded take. |
| Gemini free tier is used to improve Google's products | Fine for public content; note it before anyone pastes something confidential. |
| Dynamic egress IPs on free tier (no static IP option) | Some origins may behave differently than locally. Test the actual demo URL in production. |
| Ollama cannot run on Vercel serverless | Documented; the local tier is for local demos only. |
| Cold start on the demo URL | Warm the route immediately before presenting. |
| `jsdom` cold-start cost if ever promoted from lazy | Keep it lazy; `linkedom` is the default DOM. |
