# Content Room — User Journey & Screen Inventory

## 1. The journey

```
CONTENT → AUDIENCE → ROOM → INTELLIGENCE → STRATEGY → COMPARISON
```

Six stations. The interface is a single continuous surface that advances through them rather than six disconnected pages, because the product's argument *is* the sequence: the strategy is only credible if you watched the room produce the evidence.

## 2. Station by station

### Station 0 — Home

```
CONTENT ROOM

Rehearse before you publish.

Put any piece of content in front of a
simulated audience and see what happens.

[ Paste a URL or drop your content... ]

Social Post · Video · Ad · Campaign
Landing Page · Email · Script · Launch

[ Put it in the Room ]
```

- Primary input: one field accepting a URL or pasted content.
- Secondary: a one-tap demo scenario (Velloe) so the flow can be shown without typing.
- A capability line listing content kinds sets expectations that this is generic, not social-only.
- **States:** empty, URL detected, pasted text detected, submitting, invalid input.

### Station 1 — Content

The content is resolved and displayed as the room's subject.

- Imported content renders with its source badge: title, author, thumbnail, body excerpt.
- If `partial: true`, show an inline, non-alarming continuation: *"We got the headline and thumbnail. Add the caption text for a sharper rehearsal."* with the manual editor **pre-filled** with what did resolve.
- If import failed entirely: *"We couldn't read that one. Paste the content and we'll take it from here."* — the same editor, never a dead end.
- The content card stays pinned for the rest of the journey, because everything downstream is about *this* content.

### Station 2 — Audience

Segments appear first (AI-proposed, each with a rationale tied to this content), then resolve into a population.

- Segment cards: label, rationale, size, archetype chips.
- Agent field: personas materialise and settle into clusters.
- Copy is precise: *"24 synthetic audience agents, constructed from this content."* Never *"24 people."*
- The seed is shown in a small, low-prominence detail line so the population's reproducibility is visible and honest.

### Station 3 — The Room (the live simulation)

The centrepiece. See `docs/ui-ux.md` §5 for the visual specification.

```
THE ROOM IS LIVE

          ○       ○       ○
     ○                       ○

           ┌───────────┐
           │  CONTENT  │
           └───────────┘

     ○                       ○
          ○       ○       ○

WATCHING → INTERPRETING → REACTING → DECIDING
```

Requirements:
- Each agent is one visual object whose state is encoded in its appearance (stage → colour, intensity → halo, cluster → proximity/grouping).
- Rounds advance visibly: exposure → attention → interpretation → response → decision → action.
- A reaction feed shows a **selective** stream — meaningful excerpts, disagreement, and notable reactions. **Not 100 fake chat messages.** (Brief §15.)
- Live aggregate counters update as the room runs.
- If the demo-mode badge is active, it is visible here and in every other station.

### Station 4 — Intelligence (What happened, and why)

**What happened** — the metrics panel: attention, ignore rate, clarity, trust, positive/negative, share/save/comment/follow/click/purchase intent. Each metric shows its value, its `n`, and its `method` on demand.

**Why** — the explanation panel:

```
BIGGEST SIGNAL
The opening creates curiosity, but the value
proposition arrives too late.

AUDIENCE SPLIT
Curious users       81%
Skeptical users     46%
Practical users     63%

TOP FRICTIONS
1. Hook delays payoff
2. CTA requires interpretation
3. Proof appears too late
```

Every claim links to its evidence: click a friction, see the events, segments and excerpts that produced it. The evidence trail is the feature — an explanation you cannot audit is just another opinion.

### Station 5 — Strategy (Creative Director + Version B)

- **Creative Director:** strongest signal, biggest risk, highest-impact change, top 3 changes, recommended hook, recommended CTA, strategy.
- **Version B:** the improved asset beside an A→B diff, change by change, each with its reason.
- The recommended hook and CTA are shown as distinct, copyable assets — these are the things a user actually takes away.

### Station 6 — Comparison (Same audience, new content)

```
SAME AUDIENCE · NEW CONTENT

DID THE ROOM CHANGE?

                 VERSION A    VERSION B
Attention            64           79
Clarity              51           74
Trust                53           68
Share intent         27           41
Save intent          31           46
```

- Every row is labelled **Simulated change**.
- The control mode is stated explicitly: *"Same synthetic audience (population hash ✓), both runs reproducible."* or the resampled/regenerated caveat.
- A visible re-simulation of the room runs against Version B so the comparison is *watched*, not just tabulated.
- Deltas are directional and colour-coded, but never labelled "lift" or "improvement" without the simulation qualifier.

## 3. Cross-cutting behaviours

| Behaviour | Requirement |
|---|---|
| Refresh safety | A run's record is fetchable by id; refresh restores the last completed stage rather than corrupting state. On serverless without a durable store, a mid-run refresh restarts the run — and the UI says so instead of showing a broken half-state. |
| Demo mode | Badge visible in every station: **Live** / **Degraded: fallback model** / **Demo mode: deterministic fixtures**. |
| Error states | Every station has one, and none is a dead end. There is always a next action. |
| Loading | Progressive and specific ("Reading the content…", "Constructing the audience…"), never a bare spinner. |
| Works offline | With no network, the whole journey completes in demo mode. |
| Reduced motion | Animation is decorative; `prefers-reduced-motion` collapses the room to state changes without motion. |
| Mobile | The room degrades to a compact cluster view; all text panels remain fully readable. |

## 4. Screen inventory (build order)

| # | Screen / component | Station | Task |
|---|---|---|---|
| 1 | `HomeInput` — URL/paste entry + demo shortcut | 0 | 003 |
| 2 | `ImportStatus` — partial / failed / manual continuation | 1 | 003 |
| 3 | `ContentCard` — pinned subject | 1 | 002 |
| 4 | `DnaPanel` | 1 | 004 |
| 5 | `AudienceBuilder` — segment cards | 2 | 005 |
| 6 | `TheRoom` — agent field, states, clusters | 3 | 007 |
| 7 | `ReactionFeed` — selective, meaningful | 3 | 007 |
| 8 | `MetricsPanel` — values, n, method | 4 | 008 |
| 9 | `WhyPanel` — evidence-linked | 4 | 008 |
| 10 | `BriefPanel` — Creative Director | 5 | 009 |
| 11 | `VersionBDiff` | 5 | 010 |
| 12 | `ComparisonPanel` — before/after + caveats | 6 | 010 |
| 13 | `DemoBadge` — mode honesty | all | 012 |
| 14 | `ValidationStatusNote` — "being established" | 6 | 011 |
