# Content Room — Simulation Model

**Status:** specification for `DeterministicSimulationEngine` (task 006)
**Read this first:** the model below is a **hand-authored heuristic**, not a calibrated predictive model. Nothing here is validated against real-world outcomes. See §8 and `docs/validation.md`.

---

## 1. What the simulation must produce

Only one thing: a stream of `AgentEvent`s (see `docs/api-contracts.md` §5). Everything else — metrics, splits, disagreement, explanations — is deterministic aggregation over those events.

This is the most important architectural property in the system. The engine's job is to emit events; it never computes a percentage, never decides what a metric means, and never writes prose.

## 2. The journey being modelled

```
CONTENT EXPOSURE → ATTENTION → INTERPRETATION → EMOTIONAL/COGNITIVE RESPONSE → DECISION → ACTION
```

Modelled as six sequential stages per agent per round. An agent may exit at any stage; exiting early is itself a recorded, meaningful outcome (it is how `IGNORE` and `STOP` arise).

| Stage | Question the agent is answering | Possible exits |
|---|---|---|
| `exposure` | Did I encounter it? | never exits |
| `attention` | Do I keep looking? | → `STOP` |
| `interpretation` | What is this actually saying? | → `IGNORE` |
| `response` | How do I feel about it? | → `IGNORE` |
| `decision` | What, if anything, do I do? | → any action |
| `action` | Committed | terminal for the round |

Actions (from `ReactionActionSchema`): `STOP`, `IGNORE`, `LIKE`, `COMMENT`, `SHARE`, `SAVE`, `FOLLOW`, `CLICK`, `BUY`, `REJECT`.

`REJECT` is deliberately distinct from `IGNORE`: ignoring is *not engaging*, rejecting is *actively negative*. Conflating them is how a simulation flatters a piece of content.

## 3. Deterministic feature extraction

Features are computed **from the text deterministically** — no model call — so the engine works in demo mode and produces identical features every time.

```ts
type ContentFeatures = {
  hookStrength: number;      // 0..1  question/number/curiosity markers, first-sentence brevity
  clarity: number;           // 0..1  explicit value proposition, sentence length, jargon density
  promisePosition: number;   // 0..1  1 = value proposition in the opening, 0 = buried at the end
  ctaClarity: number;        // 0..1  imperative verb + specific, single action
  proofPresence: number;     // 0..1  numerals, named entities, social-proof markers
  emotionalCharge: number;   // 0..1  affect-bearing vocabulary
  lengthPenalty: number;     // 0..1  normalised against kind-specific target length
  topicTokens: string[];     // for interest overlap with personas
};
```

Implementation: `src/core/features/extract.ts`, pure, unit-tested with golden inputs. Every feature has a documented keyword/rule set and a test asserting monotonicity (e.g. moving the value proposition earlier must not decrease `promisePosition`).

When a `ContentDNA` is available it enriches the *reasons* strings; it must **never** be required by the engine. Contract: `run()` works with `text features only`.

## 4. The reaction model

Per agent `i`, per round `r`, scores are computed then sampled.

```
hookPull     = hookStrength · (0.5 + 0.5·noveltySeeking_i)
clarityGain  = clarity · (1 − 0.4·domainKnowledge_i)
trustGate    = (1 − skepticism_i) · (0.4 + 0.6·proofPresence)
valueFit     = promisePosition · emotionalCharge-weighted
interestFit  = |topicTokens ∩ interests_i| / |topicTokens|
frictionDrag = Σ frictionSeverity over DNA.potentialFrictions
```

Stage transitions, each a logistic in the inputs with documented coefficients (`src/engines/deterministic/coefficients.ts`, all named constants, no magic numbers inline):

```
P(keepAttention) = σ( a0 + a1·hookPull + a2·attentionBudget_i + a3·interestFit − a4·lengthPenalty )
P(positive)      = σ( b0 + b1·clarityGain + b2·valueFit + b3·trustGate + b4·interestFit
                        − b5·skepticism_i − b6·frictionDrag )
P(engage)        = σ( c0 + c1·P(positive) + c2·socialPropensity_i )
```

Then, conditional on engaging, an action is drawn from a per-action weight vector:

| Action | Primary drivers |
|---|---|
| `SHARE` | `P(positive)` × `socialPropensity` |
| `SAVE` | `P(positive)` × `domainKnowledge` × (1 − `priceSensitivity`) |
| `COMMENT` | `P(positive)` × `socialPropensity` × `emotionalCharge` |
| `FOLLOW` | `P(positive)` × `interestFit` |
| `CLICK` | `ctaClarity` × `P(positive)` |
| `BUY` | `P(positive)` × (1 − `priceSensitivity`) × content-kind relevance |
| `LIKE` | `P(positive)` (residual, quiet approval) |
| `REJECT` | (1 − `P(positive)`) × `skepticism` × `emotionalCharge` |

`intensity` = the winning driver's magnitude, clamped to `0..1`. It drives halo size on the agent object in the UI, so it must be meaningful, not decorative.

**Coefficients are hypotheses, not truths.** They are calibrated only by intuition, must be labelled as such, and must be varied in `evals/` to show sensitivity rather than being tuned to flatter the Velloe demo. A model tuned until the demo looks good is a rigged demo.

## 5. Reproducibility mechanism

The engine must be reproducible **independently of iteration order**, because events are streamed and may be produced concurrently.

So the engine does not use one sequential PRNG stream. It derives a value per `(runSeed, agentId, round, stage)`:

```ts
function rngFor(runSeed: number, agentId: string, round: number, stage: JourneyStage): () => number
// internally: mulberry32(hash32(runSeed, agentId, round, stage))
```

Consequences: events are order-independent and reproducible; replaying a run produces byte-identical output; and a targeted fix to one agent's model does not shift every other agent's results. This is specified in `src/core/rng/`.

`EngineCapabilities.reproducible` is `true` for this engine, which sets `SimulationRun.reproducibility = 'deterministic'` and drives the comparison caveat text.

## 6. Rounds, and what a round means

A round is one pass of the audience over the content. Default 3, max 6 (contract).

- Round 1 — first exposure, dominated by `hookStrength` and `attentionBudget`.
- Round 2 — interpretation deepens; `frictionDrag` and `skepticism` bite; `IGNORE` rises if the promise is buried.
- Round 3+ — social effects: an agent's `socialPropensity` is nudged by the aggregate positive response of its cluster in the previous round (a bounded, deterministic reinforcement), which is how `SHARE` cascades emerge.

Social reinforcement is **bounded** (`≤ ±0.15` on any trait) so a run cannot spiral into implausible unanimity. Monoculture is a failure mode, not a success: disagreement is a product feature.

## 7. Clusters, segments and disagreement

- **Segment** — assigned at audience construction, stable across rounds.
- **Cluster** — a spatial grouping in the room view computed from trait proximity in the UI layer only. It is a *view*, never a domain concept, and must not leak into analytics.

Disagreement is computed in `core/analytics`, not the engine:

```
Disagreement.spread = max(segment metric value) − min(segment metric value)
```

It is reported **per metric with its `bySegment` breakdown**, never as a single "polarisation score". A score would hide which segments disagree and about what, which is the actually useful information.

## 8. Honest limitations (must be surfaced in the UI, not buried)

1. **Not calibrated.** Coefficients are authored by hand from reasoning about the journey. There is no fitted relationship to real outcomes.
2. **Not representative.** Synthetic agents do not constitute a sample of any real population. No margin of error, no confidence interval, no significance test applies.
3. **Text heuristics are crude.** `clarity` and `hookStrength` are keyword-and-structure proxies, and are wrong about fresh or unusual formats.
4. **Cross-round social effects are modelled, not observed.**
5. **Excerpts are generated, not quoted.** Reaction excerpts in the deterministic engine are composed from templates over DNA fragments and traits. They are illustrative synthetic fragments and must never be presented as things anyone said.
6. **The deterministic rewrite and the deterministic analyser share a feature model.** This is the most important caveat to state plainly: `heuristicRewrite` moves forward the sentence that `extractFeatures` identifies as the value proposition, and the metrics score the same features. So part of Version B's improvement is *guaranteed by construction* rather than discovered. The live model path does not share this circularity, and the size of the effect is visible in the comparison rows (a rewrite that improved everything would be a warning sign of exactly this). It is a property of the offline tier, and it is why the offline tier is labelled as heuristic rather than validated.

The user-facing consequence is the copy discipline in `docs/ui-ux.md` §7 and the `ValidationStatus` of `'not_established'` on every run.

### 8.1 A metric worth reading carefully

`attention` counts agents that reached the interpretation stage **in any round**. Because an agent that drops at the hook in round 1 can still engage in round 2, this metric is much less discriminative than a per-round hook-pass rate. It answers "did this audience engage at all", not "did the opening work". Both are useful; they are not the same question, and the current metric answers only the first.

## 9. The OASIS engine (deferred, post-MVP)

`OasisSimulationEngine` implements the same interface so it can be added without touching analytics.

| Aspect | Detail |
|---|---|
| Transport | **Out of process.** A small Python service the Next.js app calls over HTTP. OASIS must never be imported into the app process. |
| Python | 3.10 or 3.11 only (`camel-oasis` declares `>=3.10.0,<3.12`). Local default is 3.13.5 — a 3.11 environment via `uv` is required. |
| Config | `ModelPlatformType` supports `GEMINI`, `OPENROUTER`, `OLLAMA`, `OPENAI_COMPATIBLE_MODEL` with a custom `url=`. |
| Mapping | OASIS `trace(user_id, created_at, action, info)` → `AgentEvent`: `agentId↔user_id`, `round` from the tick counter, `action` mapped from `LIKE_POST`/`REPOST`/`QUOTE_POST`/`FOLLOW`/`PURCHASE_PRODUCT`/`DO_NOTHING` into our vocabulary, and the structured remainder into `reasons`/`excerpt`. |
| Reproducibility | `capabilities().reproducible === false`, so `SimulationRun.reproducibility = 'sampled'` and comparisons carry the resampled caveat. |
| Availability | Registry-registered only when the service health check passes. Its absence must be indistinguishable from a normal run for every other layer. |

Because OASIS is LLM-only and requires a key, it can never satisfy the demo-mode requirement — which is why the deterministic engine is the default rather than a fallback.
