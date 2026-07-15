# VisSim — agent guide

Spatial operations planning platform. Phase 0 prototype of the flagship loop in
`PRODUCT_PLAN.md` §6 (read §4 for the domain language before changing domain code).

## Commands

- `npm run dev` — dev server
- `npm run check` — typecheck + lint + format check + tests (run before considering work done)
- `npm run test` / `npm run test:watch` — Vitest
- `npm run smoke` — human-readable engine dump of the sample plan
- `npm run build` — typecheck + production build

## Architecture (dependency direction: components → state → domain)

- `src/domain/` — pure TypeScript. Types, the reservation/conflict/approver engine
  (`engine.ts`), scene lookup helpers (`scene.ts`), sample content (`sampleScene.ts`).
  **No React, no three.js imports allowed here.** Unit tests colocated (`*.test.ts`).
- `src/state/` — Zustand store (`store.ts`) and derived-state hooks (`selectors.ts`).
  Scene data flows through the store; never import `SAMPLE_SCENE` from components.
- `src/components/` — React + react-three-fiber. Rendering is a projection of the
  domain model, never a source of truth.

## Invariants to preserve

- Any plan edit bumps `revision` and clears approvals/published (approvals attach to a revision).
- Reservations are always derived from moves — never stored or hand-edited.
- Connector overlap ⇒ blocking conflict; zone overlap between different teams ⇒ warning;
  same-team zone overlap ⇒ not a conflict.
- Approvers = owners of touched resources minus the authoring team.
- Times are minutes-of-day (720 = 12:00). Geometry is 2D ground-plane (`Vec2 {x,z}`).

## Conventions

- Prettier + ESLint enforced (`npm run format`, `npm run lint`). CI runs the full gate.
- `import type` for type-only imports (lint-enforced).
- New domain logic requires unit tests; UI changes should keep `npm run check` green.

## Known limitations (intentional, documented in README)

- Path↔zone intersection is sample-based (240 samples) — replace with segment/rect
  clipping before supporting thin corridors.
- Single hardcoded scene; single-user approvals (you act as all reviewers).
