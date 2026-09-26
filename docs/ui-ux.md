# Content Room — UI / UX Direction

## 1. The feeling

A **premium AI research control room**. The user is conducting an experiment, not filling in a form. The interface should feel like instrumentation: precise, quiet, confident, and dense with real information.

Desired qualities: premium · minimal · cinematic but restrained · high information density · excellent typography · strong hierarchy · dark-first · responsive · fast · polished · original.

**Inspiration, not imitation:** Linear's precision and restraint, Apple's typographic confidence, Notion's content clarity, Perplexity's answer-first hierarchy, modern research interfaces for data density. Do not clone any of them. The original element is the room itself.

**The single most important visual idea:** the content sits at the centre of the frame and the audience surrounds it. The product is a *room*, and the layout should make the content feel like the thing being examined.

## 2. Design principles

1. **Information density over decoration.** Every pixel either carries information or creates space that helps it read.
2. **Motion means state change.** Animation communicates that the simulation advanced. It is never ambient or decorative.
3. **The numbers are the interface.** Metrics are the hero typography, set in a monospaced face so digits align down a column.
4. **Hierarchy through weight and space, not colour.** Colour is reserved for state: reaction valence, delta direction, mode badges.
5. **Dark-first, light-supported.** Dark is the primary design target. Light mode must work but need not be equally tuned.
6. **Honesty is visible.** The demo badge, the "Simulated" labels and the validation note are designed elements, not apologetic footnotes.
7. **Progressive, specific loading.** "Reading the content…", "Constructing the audience…" — never a bare spinner.

## 3. Design tokens

Tailwind v4 `@theme` in `src/app/globals.css`. OKLCH, no hex literals in components.

```
Background   --bg           oklch(0.15 0.005 260)     near-black, faintly cool
Surface      --surface      oklch(0.19 0.006 260)     panels
Surface-2    --surface-2    oklch(0.23 0.007 260)     raised / hover
Border       --border       oklch(0.30 0.008 260)
Text         --fg           oklch(0.97 0.002 260)
Text-muted   --fg-muted     oklch(0.72 0.006 260)
Text-subtle  --fg-subtle    oklch(0.58 0.008 260)

Accent       --accent       oklch(0.72 0.15 250)      cool blue — the room's light
Positive     --positive     oklch(0.75 0.14 160)
Negative     --negative     oklch(0.68 0.17 25)
Caution      --caution      oklch(0.80 0.14 85)

Chart 1..5   --chart-1..5   consumed by Recharts via shadcn chart tokens
```

Agent stage colours (the room's grammar — must be used consistently everywhere stages appear):

| Stage | Token | Reads as |
|---|---|---|
| exposure | `--fg-subtle` | dim, asleep |
| attention | `--accent` at 60% | waking |
| interpretation | `--accent` | reading |
| response | `--caution` | feeling |
| decision | `--accent` at full + pulse | deciding |
| action | by valence: `--positive` / `--negative` / `--fg-muted` | committed |

## 4. Typography

| Role | Face | Treatment |
|---|---|---|
| UI / body | **Geist Sans** via `next/font` | 14–16px body, 1.55 line-height |
| **Numerals and metrics** | **Geist Mono** | tabular, so digit columns align. Non-negotiable for the metrics panel and comparison table. |
| Headings | Geist Sans | tight tracking (−0.02em), weight 500–600, generous space above |
| Micro-labels | Geist Mono | 11–12px, uppercase, +0.08em tracking, `--fg-subtle` |

Scale: 12 / 13 / 14 / 16 / 20 / 26 / 34 / 48. No sizes off the scale.

## 5. The Room — visual specification

The centrepiece. ~24 agents racing a full journey. This must be legible in three seconds and worth watching for thirty.

```
             ○       ●       ○
        ●                       ●
                  ┌───────────┐
        ○         │  CONTENT  │         ○
                  └───────────┘
        ●                       ○
             ○       ●       ●

   WATCHING → INTERPRETING → REACTING → DECIDING
```

**Implementation.** A hand-rolled `d3-force` simulation rendering to **canvas** inside a React client component (`src/components/room/TheRoom.tsx`). 24–100 nodes is CPU-trivial; canvas avoids 100 DOM nodes re-laying out per frame. Import `d3-force` and `d3-selection` only — never the full `d3` bundle.

**Encoding — three channels, no more:**

| Channel | Meaning |
|---|---|
| **Fill** | stage (table in §3) |
| **Halo radius + opacity** | `intensity` |
| **Proximity / soft grouping** | segment (a cluster hint only — never a hard boundary or label) |

**Force layout:** `forceCenter` on the content card, `forceCollide` to prevent overlap, `forceX`/`forceY` weak pull toward the agent's segment centroid, and a `forceLink` only for following relationships. Never a hairball.

**Motion budget:**
- Stage change: 220ms fill transition, 140ms halo ease-out. Nothing slower.
- Action: a single 400ms ring pulse, then the agent settles into its terminal colour for the round.
- Round advance: a brief 300ms coordinated settle, not a re-scatter. Re-scattering every round destroys the sense of continuity and reads as chaos.
- `prefers-reduced-motion`: no motion at all; states switch directly and the reaction feed carries the narrative. This is a supported mode, not a degraded one.

**The reaction feed** sits beside the room and shows a *selective* stream — high-`intensity` events, `REJECT`s, and disagreement — each a short excerpt plus agent archetype and action badge. **Explicitly not a wall of 100 messages.** (Brief §15.) Feed entries append and dedupe by event id.

**Live counters** above the room: agents active per stage, and a running action tally. Monospaced, tabular.

**Mobile:** the room collapses to a compact cluster strip; the reaction feed and counters become the primary narrative. The room must never be the reason a phone user cannot use the product.

## 6. Layout

- **Shell:** fixed left rail on desktop (`≥1024px`), top bar below. Single scrolling column, `max-width: 1100px` for text panels, full-bleed for the room.
- **The content card is pinned** from Station 1 onward — everything downstream is about it.
- **Progressive disclosure:** metrics read at a glance; `n` and `method` appear on hover/expand. Density without a wall of caveats up front, but the detail is always one interaction away.
- **Comparison table:** monospaced, two value columns and a delta column, with rows sorted by absolute delta so the biggest change is at the top.

## 7. Copy guide

**Approved phrasings:**

| Context | Copy |
|---|---|
| Audience description | "24 synthetic audience agents simulated" |
| Audience origin | "Constructed from this content" |
| Metric label | "Simulated estimate" |
| Comparison label | "Simulated change" |
| Validation | "Validation benchmark: being established" |
| Data quality | "Not representative of any real population" |
| Controlled re-test | "Same synthetic audience · population hash verified" |
| Resampled re-test | "Same synthetic audience · reactions resampled" |
| Regenerated audience | "Audience was regenerated — not a controlled comparison" |
| Demo mode badge | "Demo mode: deterministic fixtures" |
| Degraded badge | "Degraded: fallback model" |
| Live badge | "Live" |
| Partial import | "We got the headline and thumbnail. Add the caption text for a sharper rehearsal." |
| Failed import | "We couldn't read that one. Paste the content and we'll take it from here." |

**Forbidden:** "100 people think…", "predicted lift", "expected conversion", "accuracy: X%", "guaranteed virality", "X% of the market", "statistically significant", "margin of error". Full list and rationale in `docs/validation.md` §6.

Tone: precise, calm, unhurried. No exclamation marks. No hype adjectives. The product's confidence comes from the precision of its language, and one overclaimed number would cost more credibility than every good design decision buys.

## 8. Accessibility

- Body text ≥ 4.5:1 against its background; muted text ≥ 4.5:1 for anything carrying information (decorative micro-labels may be 3:1).
- Never colour-only encoding: every stage and valence also carries a shape, icon, or text label. The room's fill channel is backed by the reaction feed and counters.
- Full keyboard path: input → submit → advance through stations → expand metric detail.
- Live region (`aria-live="polite"`) announcing stage transitions and run completion, so the room is usable without watching it.
- `prefers-reduced-motion` honoured throughout.
- Focus rings visible on the dark surface (`--accent`, 2px offset).

## 9. Performance budget

| Budget | Target |
|---|---|
| Landing page LCP | < 1.5s |
| Room frame time during simulation | < 16ms with 60 agents |
| Client JS on landing | < 120 KB gzip (the room is dynamically imported, never on the landing route) |
| Server-sent event → visible UI | < 100ms |
| Layout shift | 0 — the room and panels have reserved dimensions |

The room component is `next/dynamic` with `ssr: false`, loaded only when a run starts, so the landing page stays fast. `d3-force`, Recharts and `motion` are all kept off the landing route.
