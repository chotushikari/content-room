# 002 — Design System

## TASK

Build the dark-first visual foundation: Tailwind v4 theme tokens, typography, shadcn/ui primitives, and the app shell.

## CONTEXT

The product must feel like a premium AI research control room — `docs/ui-ux.md` §1. Station 3 (the Room) is being designed in parallel by task 007, and it will need tokens that already exist. Every later UI task depends on this one, so the tokens and type scale must be settled here and not improvised later.

## OBJECTIVE

1. Tailwind v4 `@theme` tokens in `src/app/globals.css` exactly as specified.
2. Geist Sans + Geist Mono wired via `next/font`, tabular numerals enabled for mono.
3. shadcn/ui initialised with the primitives the product needs.
4. The app shell: left rail (≥1024px) / top bar, single scrolling column, pinned content-card slot.
5. Shared primitives: `MetricValue`, `DensityPanel`, `StationHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `DemoBadge` (static for now).

## ACCEPTANCE CRITERIA

- [ ] Every token in `docs/ui-ux.md` §3 exists and is used; no hex literal appears anywhere in `src/components/`.
- [ ] Type scale is exactly 12 / 13 / 14 / 16 / 20 / 26 / 34 / 48 — no off-scale sizes.
- [ ] Geist Mono renders numerals tabular; verified by rendering a column of numbers and confirming digit alignment in a screenshot.
- [ ] `DemoBadge` renders all three states (Live / Degraded / Demo) from a prop; no logic yet.
- [ ] `prefers-reduced-motion` is honoured by every transition used.
- [ ] All interactive elements have visible focus rings on the dark surface.
- [ ] Light mode does not break layout (need not be equally tuned).

## CONSTRAINTS

- Tailwind v4 (`@theme`, OKLCH, `tw-import-css` patterns) — **not** v3 idioms. shadcn's v3 docs will mislead you; follow the v4 page.
- Use the `shadcn@4.21.0` CLI; components are vendored into the repo as source we own.
- Do not build the Room (task 007), the metrics panel (008), or any data-bound component.
- Do not add a component library beyond shadcn/ui. No MUI, Chakra, Ant, or a bespoke design system.
- Bundle discipline per `docs/ui-ux.md` §9: `motion`, `d3-force` and Recharts must not be imported on the landing route.
- Copy in this task is placeholder and must not contain any forbidden phrase from `docs/validation.md` §6.

## IMPLEMENTATION

1. Install `tailwindcss@4`, `@tailwindcss/postcss`, `class-variance-authority`, `tailwind-merge`, `tw-animate-css`.
2. `npx shadcn@latest init`. Then `add`: `button`, `input`, `textarea`, `card`, `badge`, `separator`, `tabs`, `tooltip`, `collapsible`, `skeleton`, `sonner`.
3. `globals.css`: `@import "tailwindcss"`, `@import "tw-animate-css"`, then `@theme` with the full token table. Include the six agent-stage tokens as CSS custom properties so `TheRoom` can read them without duplicating colour values.
4. `src/app/layout.tsx`: Geist Sans + Geist Mono via `next/font/google`; mono declared with `variable` so `font-mono` maps to it.
5. `src/components/shell/AppShell.tsx`, `LeftRail.tsx`, `StationHeader.tsx`.
6. Shared primitives in `src/components/primitives/`. `MetricValue` takes a `Metric` shape and renders value plus an on-demand `n`/`method` disclosure — this is where the "simulated" label discipline lands visually, so get it right here rather than repeating it in 008.
7. `src/app/page.tsx`: the Home station layout with a static input and a disabled CTA. Task 003 wires behaviour.

## TESTS

- `tests/design-tokens.test.ts` — parses `globals.css` and asserts every token from `docs/ui-ux.md` §3 is present. This catches a silent token rename.
- `tests/no-hex.test.ts` — greps `src/components/**` and fails on `#rrggbb` or `#rgb` literals.
- `tests/copy-guard.test.ts` — greps all user-facing strings for forbidden phrases from `docs/validation.md` §6. Keep this test forever; it is cheap and it protects the product's credibility.

## BROWSER VERIFICATION

All ten checks from `AGENTS.md` §7 at 1440px and 390px, plus: focus rings visible while tabbing through the whole shell, and a screenshot of the mono numeral column confirming digit alignment.

## FINAL REPORT

```markdown
### Implemented
### Files changed
### Tests
### Browser verification
### Risks
### Next recommended task
```
