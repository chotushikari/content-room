# Security

## Reporting a vulnerability

Open a private security advisory on GitHub, or contact the maintainer directly
rather than filing a public issue.

Please include the request or input that triggers the problem, what you expected,
and what happened. This repository treats a false claim in its own documentation
as in scope, not just memory-safety style bugs.

## Security model

The threat surface is small by design, but two areas are treated as hostile.

### 1. User-supplied URLs

A URL fetched server-side is the classic SSRF vector, and Vercel provides no
guard. `src/ingest/index.ts` is the security boundary and implements:

- scheme allowlist (`http`/`https` only — `file:`, `gopher:`, `data:`, `ftp:` rejected)
- rejection of embedded credentials and unconventional ports
- rejection of zero-width and bidi characters used to smuggle a host past validation
- full `A` **and** `AAAA` resolution with every address validated before connecting
- blocking of loopback, RFC1918, link-local (including the `169.254.169.254`
  cloud metadata endpoint), CGNAT, benchmarking, multicast and reserved ranges,
  in both IPv4 and IPv6 including IPv4-mapped forms
- `redirect: 'manual'` with **every hop re-validated from scratch**, capped at 3
- per-hop and total timeouts, and a streamed response size cap so a 50 MB page
  cannot be buffered

**No SSRF oracle.** `URL_BLOCKED` and `IMPORT_FAILED` are indistinguishable to
the caller — same message, same status — so the endpoint cannot be used to probe
the internal network by comparing failure modes.

### 2. Imported content and model output

Imported text is untrusted and is never treated as instructions:

- every AI task wraps content in `<untrusted_content>` delimiters and states that
  the delimited region is data to analyse, never directions to follow
- model output is validated against its Zod schema before it is trusted. This
  holds even with provider strict-mode disabled, because the provider validates
  the parsed object against the same schema itself
- streamed partial objects are treated as untrusted display data until the stream
  completes, since partials are not schema-valid by construction

### Secrets

- Server-only environment variables. Nothing is prefixed `NEXT_PUBLIC_`, so no
  key can reach a client bundle.
- `.env.local` is gitignored, and the negation for `.env.example` is ordered last
  because a later `.env*` pattern would otherwise silently re-ignore the template.
- CI fails the build if a credential pattern appears in a tracked file, or if
  `.env.local` is ever tracked.
- Keys are never logged and never included in an error payload.

### Deliberate non-features

The product refuses to fetch Instagram, LinkedIn and Facebook at all. Their terms
prohibit automated reading, and requesting a login wall to scrape it would be both
a terms violation and useless. Importing from those platforms returns the
manual-paste path immediately.

## Known limitations

Stated rather than left implicit:

- **DNS rebinding** is mitigated by resolving and validating all addresses before
  connecting, but true resolve-then-connect pinning requires holding a socket open
  against a specific validated IP. Native `fetch` exposes no such hook, so a
  residual TOCTOU window exists and is documented in the ingest module rather
  than described as closed.
- Any credential pasted into an issue, a chat, or a commit is compromised. Rotate
  it — do not rely on deletion.
