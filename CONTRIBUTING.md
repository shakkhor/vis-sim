# Contributing to VisSim

Thanks for contributing. This guide covers the workflow; the project invariants and
domain rules live in [CLAUDE.md](./CLAUDE.md) — read it before touching domain code.

## Dev setup

```bash
npm install
npm run dev    # dev server, open the printed localhost URL
```

## Quality gate

Before opening a PR, run:

```bash
npm run check
```

This runs typecheck, ESLint, Prettier format check, and the Vitest suite. CI
(`.github/workflows/ci.yml`) enforces the same gate plus a production build on every
push and pull request — a PR that fails `npm run check` locally will fail CI.

Auto-fix helpers: `npm run format` and `npm run lint`.

## Architecture rule

Dependencies flow one way: **components → state → domain**.

- `src/domain/` is pure TypeScript — **no React or three.js imports**, ever.
- `src/state/` (Zustand store + selectors) is the only path scene data takes to the UI;
  never import sample scene data directly from components.
- `src/components/` renders a projection of the domain model; it is never a source of truth.

See CLAUDE.md for the full list of invariants (revision bumps, derived reservations,
conflict rules, approver derivation) — do not violate them.

## Testing

- New domain logic requires unit tests, colocated with the code (`src/domain/*.test.ts`),
  run with Vitest (`npm run test` / `npm run test:watch`).
- UI changes must keep `npm run check` green.
- `npm run smoke` prints a human-readable engine dump of the sample plan — useful for
  sanity-checking engine changes.

## Commit style

Use Conventional Commits with a scope:

```
feat(domain): derive connector capacity from owner set
fix(state): clear approvals on waypoint edit
docs(readme): clarify smoke script output
chore(ci): bump node to 22
test(engine): cover same-team zone overlap
```

Types: `feat`, `fix`, `docs`, `chore`, `test`.

## Domain language

Use the ubiquitous language from [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) §4 in code,
commits, and PRs: **Move**, **Reservation**, **Conflict**, **Connector** (and the other
§4 terms). Don't invent synonyms — a "gate booking" is a Reservation, a "route" is a
Move's path, a "door" is a Connector.
