# 003 — Content Ingestion

## TASK

Build `ContentImporter` implementations and the SSRF-safe fetcher behind `/api/runs` ingest.

## CONTEXT

Research (`docs/research.md` §5) established that universal scraping does not exist. Instagram, LinkedIn and Facebook require app review plus tokens; X oEmbed returns only a blockquote; YouTube captions have no sanctioned no-auth path. So the honest design is: extract what is legitimately available, and make manual paste a **first-class source** whose editor is pre-filled with whatever partial metadata did resolve.

The security work in this task is not optional polish. A user-supplied URL fetched server-side is the classic SSRF vector, and Vercel provides no guard.

## OBJECTIVE

1. `ssrfSafeFetch(url)` implementing all twelve controls from `docs/research.md` §5.6.
2. `ContentImporter` interface with: `WebImporter`, `YouTubeImporter`, `VimeoImporter`, `XImporter`, `SpotifyImporter`, `TikTokImporter`, `ManualContentImporter`.
3. Importers return `partial: true` rather than throwing when only metadata resolves.
4. `POST /api/runs` accepting the three source types and emitting `ingest_resolved`.
5. `ImportStatus` UI: partial continuation and full-failure states, with the manual editor pre-filled.

## ACCEPTANCE CRITERIA

- [ ] Every SSRF case in `docs/validation.md` §3.2 passes.
- [ ] `URL_BLOCKED` and `IMPORT_FAILED` responses are byte-identical to the caller (no oracle).
- [ ] No upstream body, header, status text or DNS/TLS error ever reaches the client or a log.
- [ ] A 50 MB response is aborted at the cap without buffering it in full.
- [ ] Instagram, LinkedIn and Facebook URLs produce a clean `partial` path, **not** an error claiming they are supported.
- [ ] The manual editor is pre-filled with resolved title/thumbnail when `partial: true`.
- [ ] Every importer is covered by a test using a recorded fixture, not a live network call.
- [ ] Importers are registered in one registry; adding one requires no change elsewhere.

## CONSTRAINTS

- **Do not ship transcript fetching.** No sanctioned no-auth path exists and the unofficial routes violate YouTube's own `robots.txt`. Documented in `docs/research.md` §5.4.
- Do not claim support for Instagram, LinkedIn or Facebook anywhere in the UI or in code comments.
- `jsdom` must not be imported on the common path. Use OG/JSON-LD first, then **lazily** import `@mozilla/readability` + `linkedom` only when body text is actually missing.
- Node runtime only. Never `edge`.
- Cap import concurrency: Vercel shares 1,024 file descriptors across concurrent executions.
- Per-hop timeout 5–8s plus a total wall-clock budget; both configurable via env per `docs/deployment.md` §5.

## IMPLEMENTATION

1. `src/ingest/ssrf-safe-fetch.ts` — the security boundary. Order: parse with WHATWG `URL` → scheme allowlist → reject userinfo → port allowlist → reject parser-disagreement forms → resolve all A/AAAA → validate every address with `ip-address` → fetch with `redirect: 'manual'` → re-validate each hop (max 3) → stream the body with a size cap → Content-Type allowlist. Use `undici` with a custom `connect`/`lookup` for resolve-then-connect pinning; if pinning is not achievable, document the residual TOCTOU window explicitly in the module header rather than pretending it is closed.
2. `src/ingest/importers/*.ts` — each exports `match(url): boolean` and `import(url): Promise<ContentAsset>`. `open-graph-scraper` for OG/Twitter cards, `cheerio` for JSON-LD and oEmbed `<link>` discovery, provider endpoints from the verified table in `docs/research.md` §5.3.
3. `src/ingest/registry.ts` — ordered, first-match-wins; `web` is the catch-all.
4. `src/ingest/normalize.ts` — provider payload → `ContentAsset`, always computing `contentHash`.
5. `POST /api/runs` — validate with `CreateRunRequestSchema`, resolve ingest, stream `ingest_resolved`. `runtime = 'nodejs'`, `maxDuration = 120`.
6. UI: `ImportStatus` component per `docs/user-journey.md` §2 Station 1, using the approved copy verbatim.

## TESTS

- `tests/ssrf.test.ts` — the full §3.2 table. Assert on `ErrorCode`, never on an upstream message.
- `tests/importers/*.test.ts` — recorded HTML/JSON fixtures checked into `tests/fixtures/importers/`. **No live network calls in tests.**
- `tests/no-oracle.test.ts` — blocked and failed responses are indistinguishable.
- `tests/lazy-dom.test.ts` — assert `jsdom` never appears in the landing-route bundle and that `readability`/`linkedom` are dynamically imported.

## BROWSER VERIFICATION

All ten checks, specifically: partial-import continuation with a real blocked URL; complete import failure showing the paste path; and console clean in both.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification
### Risks            (must state the residual SSRF TOCTOU position)
### Next recommended task
```
