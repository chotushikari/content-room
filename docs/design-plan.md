# Content Room — Design Plan

**Subject:** you are about to hit publish. A hundred synthetic people read your post and disagree about it.

**The memorable moment:** the split. It is the product's whole thesis and the thing nothing else shows you, so the boldness goes there and everything else stays quiet.

Reference concept art: `public/images/ui/*.png`.

---

## 1. Three moves away from where the interface is now

The current design sits on two well-worn defaults: near-black plus a single blue accent, and roughly sixty instances of a 10px tracked-uppercase mono label. Both are the generic "AI product" register, and the second one is also the main reason the UI is hard to read.

**1. Palette → an auditorium with the lights down.** Deep plum-ink instead of neutral near-black. Warmer, less like every terminal, and it lets the reaction colours sit forward.

**2. Type → Bricolage Grotesque + Inter Tight, retiring Geist.** Bricolage for headlines and the verdict, where its editorial wonk suits opinionated commentary. Inter Tight for body and UI. Mono is **demoted** to the event log, agent IDs and numerals — it is no longer the voice of the interface.

**3. Kill the uppercase eyebrow label.** This is the single highest-impact change and it does most of the "make it understandable" work:

| | Before | After |
|---|---|---|
| Minimum text size | 10px | **12.5px** |
| Case | TRACKED UPPERCASE | Sentence case |
| Count | ~60 instances | 0 |
| Hierarchy | label louder than value | **value louder than label** |

Labels stay small and muted, but they become *words a person says*, not shouted codes. "Archetype", not "ARCHETYPE:".

## 2. The reaction spectrum

Five states, one meaning each, used identically everywhere — room, roster, bars, charts. Colour is a **channel for data**, never decoration.

```
ignored   oklch(0.52 0.02 300)   desaturated. They left. It should recede.
rejected  oklch(0.66 0.17 25)    clay red. Active disapproval.
weighing  oklch(0.72 0.04 300)   neutral. Reading, deciding, not yet moved.
liked     oklch(0.78 0.15 155)   green. Positive.
shared    oklch(0.82 0.17 130)   brighter green. The strongest signal there is.
```

Note what is **not** red: `IGNORE` and `STOP`. Most content is scrolled past, and rendering that as alarm made a merely-ignored piece look like a disaster. Only `REJECT` is alarming.

Segment identity uses a separate six-hue ramp (`src/components/room/palette.ts`) so a group keeps one colour across every panel.

## 3. Tokens

```
SURFACES (plum-ink)                    BORDERS
--bg        oklch(0.14 0.014 300)      --line        oklch(0.30 0.014 300)
--surface   oklch(0.18 0.015 300)      --line-soft   oklch(0.24 0.012 300)
--surface-2 oklch(0.22 0.016 300)      --line-strong oklch(0.38 0.018 300)
--surface-3 oklch(0.26 0.017 300)

TEXT                                   SIGNAL
--fg        oklch(0.97 0.004 300)      --accent   oklch(0.74 0.13 300)   plum-bright
--muted     oklch(0.76 0.010 300)      --live     oklch(0.80 0.16 150)   "room is live"
--subtle    oklch(0.60 0.012 300)      --caution  oklch(0.82 0.13 85)

RADII 4 / 6 / 10        MOTION 120ms state · 200ms reveal · 400ms action pulse
```

Elevation is semantic, not decorative: `--surface` is a panel, `--surface-2` is a thing inside a panel, `--surface-3` is a thing inside that. No shadows anywhere — depth comes from surface lightness and a 1px border, which is what keeps a dense dark UI from going muddy.

## 4. Type scale

| Role | Face | Size / weight | Tracking |
|---|---|---|---|
| Display | Bricolage | 44 / 600 | −0.03em |
| Verdict | Bricolage | 34 / 600 | −0.02em |
| Title | Inter Tight | 19 / 600 | −0.015em |
| Lead | Inter Tight | 15 / 400 | — |
| Body | Inter Tight | 13.5 / 400, 1.55 | — |
| Label | Inter Tight | 12.5 / 500 | +0.01em, muted |
| Meter | JetBrains Mono | 15 / 500, tabular | — |
| Log | JetBrains Mono | 11.5 / 400, tabular | — |

Numerals are always tabular, in mono, so digits align down a column. Comparing Version A against Version B by eye depends on it.

## 5. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ Content Room            ● Room is live      Verdict Agents …  │  56px
├──────────────────────────────────────────────────────────────────┤
│  Content ─ Audience ─ Room ─ Intelligence ─ Strategy ─ Compare   │  40px, only in a run
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  primary (fluid)         │  │  rail (340px)                │ │
│  │  the room, the verdict   │  │  inspector · console · log   │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **`/` — landing.** The hero is a live, self-running canvas of ~60 agents cycling through reactions on a loop, driven by a deterministic script (no API call). Then the three-step flow, then an honesty panel that treats "these are simulated" as a confident design element rather than a footnote.
- **`/app` — the tool.** Same shell, so the product feels like one place rather than a form and then a report.
- Two columns at `≥1280px`, single column below.
- Max width 1440px. Once a run exists the content never centres narrower than 1100px — this is an instrument, not an article.

## 6. Per-view redesign

| View | Change |
|---|---|
| **Landing** | New. Live agent canvas, three-step explainer, honesty panel. |
| **Verdict** | Score becomes the largest thing on the page. **What to change** moves *above* the segment table — it is what the user came for. Segments become a diverging bar chart showing the split, which is the signature visual. |
| **Comparison** | Its own view. Monospaced A/B/delta table with the control-mode statement above the numbers, never below. |
| **Agents** | Roster with segment hues; inspector uses label/value fields with the confidence figure keeping its inline `(Simulated Estimate, n=…)`. |
| **Room** | Ring of segment clusters, elliptical guides, content at the centre. Three channels only: hue = segment, brightness = journey progress, halo = intensity. |

## 7. What does not change

These are product promises, not styling, and they survive the redesign:

- Every number keeps its `simulated` / `(Simulated Estimate, n=…)` label.
- The control-mode caveat stays **above** the comparison.
- `STOP` and `IGNORE` are grey. Only `REJECT` is red.
- `prefers-reduced-motion` removes animation entirely; the feed carries the narrative.
- Body contrast ≥ 4.5:1. Labels ≥ 4.5:1 too now, since they carry real information at 12.5px.
