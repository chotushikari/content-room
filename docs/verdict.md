# Content Room — The Verdict

## 1. Why this layer exists

The first version of this product showed twelve metrics, a per-segment breakdown, an evidence index, a live agent simulation, and a raw event console. Every one of those is defensible engineering. Together they are unusable: the user is left to form their own judgement from raw material, which is the job they came here to have done.

Twelve numbers are not more informative than one. They just move the work onto the reader.

So there are now two views over the same event-sourced state:

| View | Audience | Content |
|---|---|---|
| **Verdict** (default) | the user | one score, one paragraph of opinion, one list of changes, viral read |
| **Detail** | anyone who wants to check the reasoning | the room, per-metric tables, evidence chain, raw event console |

Both are projections of one reducer state, so they cannot disagree. The detail view is one click away and is the justification, not the product.

## 2. The five questions the verdict answers

| Question | Where it comes from |
|---|---|
| **Is it good?** | `performanceScore` → 0-100 plus a band: Weak / Mixed / Solid / Strong |
| **Will they like it?** | per-segment score, banded, with a note naming that segment's specific gap |
| **What do you think?** | `read` — two or three sentences of plain opinion |
| **What do I change?** | `improvements` — three items, each with the rewritten text and a copy button |
| **Will it spread?** | `viralPotential` → Low / Moderate / High with a one-line reason |

Produced by `src/core/summary.ts` — pure, deterministic, no model, no clock. The same run always yields the same verdict.

## 3. How the score is computed

```
score = 0.30·positiveResponse
      + 0.20·trust
      + 0.15·clarity
      + 0.15·amplification      (share×3, save×2, comment×1.5, follow×1.5, capped at 100)
      + 0.10·attention
      + 0.10·(100 − ignoreRate − negativeResponse)
```

Response quality dominates, because whether people liked it matters more than whether they clicked. Amplification is weighted meaningfully but not dominantly. Drag subtracts.

The intent metrics are scaled because they are naturally small percentages — a 12% share intent is strong for real content — and unscaled they would silently contribute almost nothing.

Bands: `<35` Weak, `<55` Mixed, `<72` Solid, otherwise Strong.

## 4. How viral potential is computed

Each signal is normalised against a stated "high" anchor rather than multiplied by a flat factor:

```
shareN   = min(100, shareIntent / 25 × 100)
saveN    = min(100, saveIntent / 25 × 100)
commentN = min(100, commentIntent / 25 × 100)
positiveN = positiveResponse            (already 0-100; ~80 is excellent)

viral = 0.42·shareN + 0.24·saveN + 0.16·commentN + 0.18·positiveN
      − penalty (content most people scrolled past does not spread)
```

Forwarding is weighted highest because it is the only real evidence of spread. Liking is necessary but weak on its own.

An earlier version multiplied raw percentages by a flat factor, which let a 12% share intent alone nearly max the scale. A test caught it.

## 5. The honesty line, and why it is not negotiable

The score is labelled **simulated** wherever it appears, and it is described as the simulation's own estimate of how a synthetic audience responded — never as a forecast of real-world performance, reach, or revenue.

This is a design decision, not a hedge. The score is real in the sense that it is a deterministic function of simulated reactions, and it is genuinely useful for *ranking* two versions of the same content against the same audience. It is not evidence about the real world, because nothing here has ever been compared against a real outcome. `ValidationStatus` reports `'not_established'` on every run for exactly that reason.

A number that looks authoritative but is not measured would be worse than no number, because people act on it. So we show the number and label it.

None of this limits what the product can say. "This is strong, the audience trusts it, and they would pass it on" is a complete, confident verdict. It just is not a promise about reality.

## 6. Prohibited phrasings

Enforced by `tests/copy-guard`-style checks and `scripts/preflight.ts`. Never rendered:

> "guaranteed virality" · "will go viral" · "predicted lift" · "expected conversion" · "statistically significant" · "margin of error" · "X% of the market" · "100 people think"

## 7. Tests

`tests/summary.test.ts` asserts: band thresholds are monotonic across the full range; the score stays in 0-100; deliberately strong content outranks deliberately weak content; the score rises with better response and falls with a higher ignore rate; viral bands land correctly at Low / Moderate / High; the verdict is deterministic across runs of the same content; every segment note is distinct (identical notes across segments are what make a summary read as machine-generated); each improvement is short, specific, and names the metric it should move; and no verdict text contains a prohibited phrase.
