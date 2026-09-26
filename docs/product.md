# Content Room — Product

> **Rehearse before you publish.**

## 1. The problem

Teams produce content and publish it into the world with no way to rehearse the response. The available pre-publication signals are weak: internal opinion, a founder's intuition, a focus group that costs weeks. So they publish, and then they learn.

Content Room inverts that. It puts content in front of a relevant simulated audience *before* publishing, and answers three questions:

1. **What might happen?** — an estimated audience response, as structured events and aggregate metrics.
2. **Why might it happen?** — explanations grounded in the specific reactions that produced the numbers.
3. **What should change?** — a concrete improved version, re-tested on the *same* audience for a controlled before/after.

## 2. What it is, precisely

Content Room is an **AI-powered synthetic-audience rehearsal environment**.

It is not a virality predictor. It is not a survey. It is not a replacement for real user research. It is a rehearsal room: a private place to find out what happens when you say a thing, before you say it in public.

**One sentence for the pitch:** *Content goes in. A relevant audience forms. The audience reacts. The system explains why. The content improves. The same audience tests it again.*

## 3. Who it is for

| User | Job to be done |
|---|---|
| Creator / solo marketer | "Which of these two hooks do I post?" |
| Brand / agency strategist | "Will this land with the audience we're actually targeting?" |
| Product marketer | "Is our launch announcement clear, or does it bury the point?" |
| Founder | "Does this message work for someone who has never heard of us?" |
| Content team lead | "Where will we get pushback, and can we pre-empt it?" |

## 4. Scope: any content, not one platform

Supported content kinds are enumerated in `docs/api-contracts.md` §1: social posts, videos, reels, shorts, ads, campaigns, product announcements, landing pages, emails, articles, scripts, brand messaging, launch concepts, creative concepts, marketing ideas.

**Velloe is a demo fixture, not the domain model.** The product must remain generic. Velloe appears in exactly three places: `src/fixtures/velloe/`, `docs/demo.md`, and the pitch script. No domain type, engine, or provider may reference Velloe. A grep for `velloe` outside those places is a bug.

## 5. Product promises and honesty constraints

These are promises to the user, and each maps to a mechanism in the code, not just a good intention:

| Promise | Mechanism |
|---|---|
| Numbers are labelled as simulated | `Metric.kind` is the literal `'simulated_estimate'`; the UI cannot render a metric without its label |
| No fabricated precision | `Metric.n` and `Metric.method` are required fields |
| Comparisons are labelled | `Comparison.caveats` has `min(1)`; a caveat-free comparison cannot be constructed |
| Explanations are grounded | `WhyReport.biggestSignal.evidence` has `min(1)` |
| Same audience means same audience | `populationHash` equality is asserted, and `controlMode` is surfaced in the UI |
| No fake validation | `ValidationStatus` reports `'not_established'` until real benchmarks exist |
| No fake virality or conversion claims | The metric set is intent and response only — there is no "predicted reach", "expected conversions", or "virality score" anywhere in the contract |

**Never write "100 people think this."** Write *"100 synthetic audience agents simulated."* The UI copy guide in `docs/ui-ux.md` §7 holds the approved phrasings.

## 6. The core loop

```
ANY CONTENT → UNDERSTAND → CONTENT DNA → BUILD CONTEXTUAL AUDIENCE → SIMULATE
     → WHAT HAPPENED? → WHY? → IMPROVE → VERSION B
     → SAME AUDIENCE → RE-SIMULATE → COMPARE
```

The loop is the product. Every screen is a station on it, and the interface is designed to communicate the order: **CONTENT → AUDIENCE → ROOM → INTELLIGENCE → STRATEGY → COMPARISON**.

## 7. Audience construction is contextual, not a fixed list

A fixed taxonomy of "students / creators / professionals" is the wrong model. The audience is constructed *from the content*: the topic, the implied target, the product context, the intent, and the behavioral signals in the DNA.

The system therefore does two things in sequence:
1. **AI proposes** which segments are relevant to *this* content, with a rationale for each.
2. **Deterministic code expands** those segments into a population of personas using a seeded PRNG, choosing from a 19-entry archetype library (skeptic, power user, casual scroller, trend follower, creator, early adopter, price-sensitive, practical, community builder, professional, student, entertainer, researcher, brand loyalist, curious explorer, busy user, value seeker, social sharer, silent consumer).

The archetypes are a **library, not mandatory segments**. The seed is recorded so the population is reproducible and can be held constant across versions.

## 8. What makes this different

Research (`docs/research.md`, `docs/open-source.md`) established that open source contains strong agent-simulation foundations — OASIS, MiroFish and others — but **no project does same-audience before/after re-simulation.** They simulate a world and produce a report. None holds an audience fixed and re-tests improved content against it as a controlled comparison.

That is the differentiator, and it is why the audience identity mechanism (`AudienceRef` with `populationHash` and `controlMode`) is a core contract rather than an implementation detail.

Secondary differentiators: it works with zero API keys; every number is traceable to events; and the explanation is evidence-linked rather than a paragraph of plausible prose.

## 9. Explicit non-goals

Named so they do not quietly become scope:

- Predicting real-world performance, reach, revenue or virality.
- Statistical representativeness of any real population.
- Replacing surveys, A/B tests or user research.
- Scraping platforms that forbid it (Instagram, LinkedIn, Facebook — see `docs/research.md` §5.3).
- A general-purpose agent framework or a world simulator.
- Multi-user accounts, teams, billing, or auth.
- Training or fine-tuning models.
- Being the source of truth for a content calendar.

## 10. Success criteria

**The demo succeeds if** a judge understands within seconds: content goes in, a relevant audience forms, the audience reacts, the system explains why, the content improves, and the same audience tests it again.

**The build succeeds if** the vertical slice runs end-to-end with no network, no API key and no database, still produces every screen with honest labels, and the deterministic core has tests proving the numbers are stable.
