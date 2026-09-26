# Content Room — API Keys

## Short answer

**You need none.** The app runs completely without a key. One key upgrades the *wording* of the analysis; the score, the segments, the simulation and the comparison are computed by our own deterministic code either way.

## What to set, in priority order

| Priority | Key | Where | Cost | Verified |
|---|---|---|---|---|
| **1** | `GROQ_API_KEY` | https://console.groq.com/keys | Free tier | **Yes** — confirmed `mode: live`, `degraded: false` |
| 2 | `GOOGLE_GENERATIVE_AI_API_KEY` | https://aistudio.google.com/apikey | Free tier* | Partially — see the billing note below |
| 3 | `OPENROUTER_API_KEY` | https://openrouter.ai/keys | 50 req/day free | Not exercised |
| — | `YOUTUBE_API_KEY` | Google Cloud → enable "YouTube Data API v3" | 10k units/day | Not exercised |

\* Google's free tier uses your prompts to improve their products. Fine for public marketing content; worth knowing before pasting anything confidential.

Any OpenAI-compatible endpoint also works as a fourth tier if you set `CONTENT_ROOM_OPENAI_COMPATIBLE_*`.

## Verified model ids

These were checked against the live APIs on 2026-09-26, not chosen from memory. Both defaults were wrong before this check, and **a wrong model id fails silently** — the chain degrades to the deterministic tier and the run looks like it worked.

| Provider | Model | Note |
|---|---|---|
| Groq | `openai/gpt-oss-120b` | This key's list: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `allam-2-7b`. `llama-3.3-70b-versatile` is **not** available. |
| Google | `gemini-3.8-flash` | `gemini-2.5-flash` returns 404: "no longer available to new users". |

Override either with `CONTENT_ROOM_GROQ_MODEL` or `CONTENT_ROOM_GOOGLE_MODEL`.

### Groq needs strict schema mode off

Groq runs structured output in strict JSON-schema mode by default, which requires **every** property to appear in `required`. Our `ContentDNA` has an optional `span` field on frictions, so strict mode rejects the request outright:

```
invalid JSON schema for response_format: 'ContentDNA':
/properties/potentialFrictions/items/required:
The following properties must be listed in `required`: span
```

This is handled in `src/providers/live.ts` by passing `strictJsonSchema: false` for Groq. Nothing unvalidated gets through: the parsed object is still validated against the same Zod schema before it is returned.

## Setting a key

```bash
# local
echo "GROQ_API_KEY=your_key_here" >> .env.local

# production
vercel env add GROQ_API_KEY production
vercel --prod          # redeploy to pick it up
```

`.env.local` is gitignored. `scripts/preflight.ts` will fail if a key pattern ever reaches a tracked file.

## What happens with each combination

| Keys configured | Behaviour | Badge |
|---|---|---|
| None | Full journey, deterministic wording | **Demo mode: deterministic engine** |
| Groq only | Full journey, model-written analysis | **Live** |
| Groq + Google, Google working | Google serves, Groq is the fallback | **Live** |
| Groq + Google, Google out of credit | Google is quarantined, Groq serves | **Live** |
| All providers fail | Deterministic tier, journey still completes | **Demo mode** |

The badge is derived from which tier **actually served the run**, never from which keys are present — so a degraded run cannot be presented as live.

## A billing failure to be aware of

A Google API key can authenticate perfectly and still fail every request:

```
HTTP 402  "Your prepayment credits are depleted."
```

This happens when the Google Cloud project behind the key has **billing enabled and exhausted credits**. Such a project does not fall back to the free tier — it returns 402. Confirmed during development: the key listed models successfully via `?key=`, so it was valid, but every `generateContent` call returned 402.

**Fix:** either top up the project's credits, or create the key from a project with billing disabled, which uses the free tier instead.

This failure mode cost real debugging time, so two things now handle it:

1. **Provider quarantine.** `401`/`402`/`403` are provider-wide failures — auth, billing, permission — so the provider is removed for the rest of the run instead of being retried on every task.
2. **Not to be confused with a request-level failure.** `400`/`404`/`422` skip only that one request. An earlier version treated a `400` caused by one incompatible schema as provider-wide, which disabled a perfectly working provider and silently sent every task to the deterministic tier.

## What you do not need

- No database, no Supabase, no Postgres — run state is in memory by design
- No Redis, no queue, no Kafka
- No paid tier of anything; Vercel Hobby is sufficient
- No scraping service — URL import reads public metadata and article text directly
