# 005 — Audience Engine

## TASK

Build contextual audience construction: AI-proposed segments expanded deterministically into a reproducible persona population.

## CONTEXT

A fixed taxonomy of students/creators/professionals is the wrong model (`docs/product.md` §7). The audience must be *derived from the content*. So this splits cleanly in two, along the project's central rule:

- **AI proposes** which segments are relevant to *this* content, each with a rationale.
- **Deterministic code expands** segments into personas with a seeded PRNG.

That split is what makes the "same audience" claim in task 010 mechanically true rather than a promise. The population hash produced here is asserted there.

## OBJECTIVE

1. `audience_segments` AI task returning segments with rationales grounded in the content.
2. `buildAudience()` expanding segments into `PersonaAgent[]` deterministically from a seed.
3. `audienceId` / `populationHash` computation with a documented field list.
4. `AudienceBuilder` UI: segment cards, then agents settling into clusters.
5. `persona_enrich` AI task (bios) that is optional — traits alone must suffice for the whole journey.

## ACCEPTANCE CRITERIA

- [ ] Same `(contentHash, audienceSeed, size)` ⇒ identical `populationHash`, across processes and across runs.
- [ ] No archetype is hard-coded as mandatory; all 19 are reachable, and the default set is content-derived.
- [ ] Segments come back with a non-empty `rationale` that references this content; a generic rationale fails the eval.
- [ ] Trait distributions are deliberately **varied** — a population where every agent shares a trait value within 0.05 fails the diversity assertion.
- [ ] `persona_enrich` failure degrades to trait-only personas; the journey completes unchanged.
- [ ] UI copy states "*N* synthetic audience agents" and never "people".
- [ ] The seed is displayed in a low-prominence detail line.
- [ ] Audience size respects `CONTENT_ROOM_MAX_AUDIENCE` and the contract's 6–60 range.

## CONSTRAINTS

- Determinism is the whole point. No `Math.random()`, no `Date.now()`, no `crypto.randomUUID()` anywhere in audience construction. Only `core/rng`.
- Archetypes are a **library, not segments** (`docs/product.md` §7). Do not map one archetype to one segment by default.
- Personas are heuristic-driven. Do not call a model per agent; that is 24+ calls for a population whose traits are structural anyway.
- Persona bios are cosmetic enrichment. Nothing in analytics may depend on them.
- Do not implement the simulation (006) or the room (007).

## IMPLEMENTATION

1. `src/providers/tasks/audience-segments.ts` — schema, instruction, fixture. Require `rationale` and `min(1)` archetypes per segment.
2. `src/core/domain/audience-factory.ts` — `buildAudience({ dna, segments, size, seed })`:
   - Assign segment sizes deterministically from proportions.
   - For each agent, derive traits from the archetype's prior distribution **plus seeded jitter**, so population members are not clones.
   - Per-agent RNG via `rngFor(seed, agentId, ...)` so personalities are stable regardless of generation order.
   - Compute `populationHash` over the ordered persona list; document exactly which fields enter the hash.
3. `src/core/ids/audience.ts` — `audienceId(seed, dnaHash, archetypeSet, size)`.
4. `src/providers/tasks/persona-enrich.ts` — batched bios, optional, 8,000-char cap.
5. `src/components/audience/AudienceBuilder.tsx` + `SegmentCard.tsx` — powered by `motion` from `motion/react`, staggered reveal, `prefers-reduced-motion` collapsing to direct state changes.
6. Extend `POST /api/runs` to emit `audience_ready`.

## TESTS

- `tests/audience-determinism.test.ts` — 1,000 generations from one seed: identical hash every time, zero collisions across different seeds.
- `tests/audience-diversity.test.ts` — trait variance across the population exceeds documented thresholds; no archetype dominates above a stated ceiling. A homogeneous synthetic audience is worthless, so this is a real assertion, not a smoke test.
- `tests/hash-fields.test.ts` — changing any hashed field changes `populationHash`; changing an unhashed field (e.g. `bio`) does not. This pins the contract that task 010 depends on.
- `tests/persona-optional.test.ts` — with bios disabled the full journey still completes.

## BROWSER VERIFICATION

All ten checks, plus: agent reveal animation completes within budget; 390px layout keeps segment cards readable; reduced-motion mode produces no animation.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification
### Risks
### Next recommended task
```
