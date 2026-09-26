# Changelog

Notable changes only. Entries record what was **measured** and what turned out to
be **wrong**, because that is the part a future reader cannot reconstruct from the
diff.

## [Unreleased]

### Live model tier verified end to end

A full production run is now served by the model across all four analysis tasks —
`content_dna`, `audience_segments`, `why_report`, `creative_brief` — with
`degraded=false` throughout, in roughly 11 seconds. Getting there exposed four
distinct silent failures.

**Fixed — stale model ids fail silently.** `gemini-2.5-flash` authenticates and
still appears in the models list, but returns 404 on `generateContent` ("no longer
available to new users"). `llama-3.3-70b-versatile` is not in the current Groq
model list at all. Because the provider chain degrades to the deterministic tier,
a wrong model id looks exactly like a successful run. Defaults are now verified
against the live APIs.

**Fixed — provider schema strictness.** Groq's strict mode requires every property
to be listed in `required`; one optional field made every request fail with a 400.
Handled with `strictJsonSchema: false`, which is still safe because the parsed
object is validated against the same Zod schema before it is returned.

**Fixed — failures were misclassified.** A 400 caused by one incompatible schema
was treated as provider-wide, quarantining a working provider for an entire run.
Classification is now: `401`/`402`/`403` quarantine the provider (auth, billing,
permission); `400`/`404`/`422` skip only that request; a stochastic *generation*
failure is retried, while a schema *definition* failure is not.

**Fixed — the schemas asked the model to do the wrong job.** `WhyReport` and
`CreativeBrief` required the model to reproduce computed structures — `audienceSplit`
with exact spread values, `top3Changes` with evidence objects — and failed with
`No object generated: response did not match schema`. That was a design error twice
over: it asked a language model to echo numbers already computed, and it made a
schema violation likely on every call. The model now writes prose only; a composer
assembles the strict report. `ContentDNA` received the same treatment. This is the
project's own rule — AI handles language, code handles every number — applied to
the tasks that had drifted furthest from it.

**Fixed — nested retries.** The AI SDK's own `maxRetries` default of 2 combined
with the chain's retry produced up to four attempts and ~14 seconds on a path that
was going to fail anyway. Disabled in the SDK so one place owns retry policy.

**Measured, and contrary to expectation:** spreading the four tasks across three
different Groq models did **not** improve reliability. That is how the limit was
confirmed to be org-level rather than per-model. Reducing per-call input budgets is
what fixed it — `content_dna` was being sent 20,000 characters for a single read.

### URL ingestion hardened

Four bugs found by testing real URLs rather than fixtures:

- the metadata extractor required `name` to precede `content`, so attribute order
  decided whether a description was found. Replaced with an attribute parser.
- `decodeEntities` handled only a few named entities, so a Facebook page rendered
  raw `&#x92a;&#x930;` escapes into the UI. Numeric and hex references now decode,
  and invisible control and bidi characters are stripped.
- Instagram, LinkedIn and Facebook are no longer fetched at all — their terms
  prohibit it, and fetching produced nothing useful anyway.
- article extraction was planned but never implemented, so Wikipedia — which ships
  no meta description whatsoever — returned a title and an empty body. Added
  lazily-loaded Readability + linkedom behind a link-density gate.

The link-density gate took measurement to get right. A first attempt scored prose by
sentence punctuation and average word length, which could not separate the two
failure modes: `bbc.com/news` returned 6,800 characters of navigation and MDN
returned 20,000 characters of code, and their terminator density was **identical**
at 1.3 per 1,000 characters. Link density separates them cleanly and has an obvious
meaning. Results: Wikipedia 0 → 12,000 characters, MDN 157 → 12,000.

### Verdict-first interface

The previous output was built for an analyst: twelve metrics, a segment breakdown,
an evidence index, a live agent room and a raw event console all at once. Every part
was defensible; together they were unusable. Twelve numbers are not more informative
than one — they move the work onto the reader.

The default view now answers five questions: is it good, will they like it, what do
you think, what do I change, will it spread. The room, the metric tables, the
evidence chain and the event console remain, behind **Show detail**. Both views are
projections of one reducer state, so they cannot disagree.

### Stateless re-simulation

Run A then re-simulation worked in production, but only because Vercel happened to
route both requests to the same instance. Serverless instances do not share memory,
so a cold start or a pause between the two steps would have broken the demo mid-run.
The re-simulation request now carries the context it received from the server, and
the population hash is still re-derived and asserted server-side. Verified in
production with a deliberately bogus run id.

## [0.1.0] — initial build

Deterministic simulation engine, contextual audience construction, event-sourced
interface, evidence-linked explanations, controlled same-audience re-test,
SSRF-guarded ingestion, and 133 tests covering determinism, contract obligations,
security boundaries and model sensitivity.

Licensed MIT. Dependency set is MIT / ISC / Apache-2.0 throughout; no copyleft code
was copied, including from the projects used as architectural references.
