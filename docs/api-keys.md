# Content Room — API Keys Required

Short answer: **you need one key, and the app runs with zero.**

Everything works without any key. Keys only upgrade the *wording* — the analysis, simulation, scoring and comparison are produced by our own deterministic code either way. The score you see is identical with or without keys; what changes is how well the written verdict reads.

## What to give me, in priority order

| Priority | Key | Where to get it | Cost | What it improves |
|---|---|---|---|---|
| **1 — give me this** | `GOOGLE_GENERATIVE_AI_API_KEY` | https://aistudio.google.com/apikey | Free tier | Best quality. Writes the Content DNA, the verdict wording, the improvements, and the rewrite. |
| 2 — optional backup | `GROQ_API_KEY` | https://console.groq.com/keys | Free tier | Used automatically if Gemini fails or rate-limits. Very fast. |
| 3 — optional | `OPENROUTER_API_KEY` | https://openrouter.ai/keys | Free tier, 50 req/day | Access to many models through one key. |
| 4 — optional | `YOUTUBE_API_KEY` | Google Cloud console, enable "YouTube Data API v3" | Free, 10k units/day | Better YouTube imports (description + stats). Without it, YouTube gives title/author/thumbnail only. |

## Exactly what I need from you

**Just the Gemini key.** Paste it and I'll wire it in. That unlocks the full live path.

If you'd rather not paste a key into the chat, add it yourself:

```bash
# local
echo "GOOGLE_GENERATIVE_AI_API_KEY=your_key_here" >> .env.local

# production (Vercel)
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production
vercel --prod          # redeploy to pick it up
```

## What happens with each combination

| Keys configured | Behaviour | Badge shown |
|---|---|---|
| None | Full journey, deterministic wording | **Demo mode: deterministic engine** |
| Gemini only | Full journey, model-written analysis | **Live** |
| Gemini + Groq | Full journey, automatic failover | **Live**, or **Degraded** if Groq served it |
| Any key that then fails | Falls through, run still completes | **Degraded** or **Demo** |

The badge is derived from which tier *actually served* the run, never from which keys are merely present — so a degraded run can never be presented as live.

## What you do NOT need

- No database, no Supabase, no Postgres. Run state is in memory by design.
- No Redis, no queue, no Kafka.
- No paid tier of anything. Vercel Hobby is sufficient.
- No scraping service. URL import reads public metadata directly.

## One caveat worth knowing

Google's free tier for Gemini uses your prompts to improve their products. Fine for public marketing content; worth knowing before pasting anything confidential. The app notes this in `.env.example`.
