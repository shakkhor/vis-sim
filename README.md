# VisSim — Spatial Operations Planning Platform

Phase 0 prototype of the flagship loop described in [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) §6:
plan a movement on a 3D facility model → reservations are derived automatically → conflicts
surface → the affected teams approve → publish.

## Run

```bash
npm install
npm run dev      # open the printed localhost URL
npm run check    # typecheck + lint + format check + unit tests (CI runs the same gate)
npm run smoke    # human-readable engine dump of the sample plan
npm run build    # typecheck + production build
```

## What the prototype demonstrates

The default scene is a pharma plant: gowning and material airlocks feeding a **Grade C
corridor**, a **Grade B filling suite**, and a segregated waste route. A **scene switcher**
dropdown still offers the stadium slice (South Plaza → Gate 7 → concourses) and the warehouse
scene with a pedestrian-only walkway.

1. Press **Play** on the pharma plan. When the waste egress crosses the material ingress path
   in the Grade C corridor, the **separation rule** fires — retime the waste egress on the
   timeline to clear it, watch approvals derive (QA, Materials, Waste, and Maintenance if
   touched), then **Publish** and generate the **briefing pack**.
2. **Switch to the stadium scene** to see the classic conflict story: press Play and three
   preloaded moves animate — Block D spectator ingress, an F&B restock cart, and a security
   plaza sweep.
3. The F&B cart crosses Gate 7 while the ingress cohort occupies it → a **blocking conflict**
   is detected automatically (red band on the timeline, red flash on the gate).
4. **Drag the F&B bar** on the timeline to after the ingress clears — the conflict disappears.
5. The **Approvals** panel shows the auto-derived approvers (Block C, Security, F&B — every
   team whose zones/gates the plan touches, except the author). Approvals unlock once blocking
   conflicts are resolved; approving all enables **Publish**.
6. Any edit after approval resets approvals — plans are approved per revision.
7. **+ Draw move**: click waypoints on the ground, set actor/team/times, create your own move
   and watch reservations, conflicts, and the approver list update live.
8. **Switch scenes** from the dropdown. Scenes carry data-driven **rules**: in the warehouse,
   route a vehicle across the pedestrian-only walkway and a rule violation surfaces in the
   side panel and highlights in the 3D view.
9. **Edit scene**: select, drag, resize, add, duplicate, and delete zones/connectors on a
   snap grid with alignment guides; **New scene** starts a blank facility. Edits auto-save
   to browser localStorage per scene (with **Reset scene** to return to defaults) —
   **Export / Import** JSON remains the way to share a plan.
10. Keyboard shortcuts: **Space** play/pause, **Esc** cancels drawing/editing, **1/2/3**
    switch view modes, **Delete** removes the selected move, **Ctrl/Cmd+Z** undo,
    **Ctrl/Cmd+Shift+Z** or **Ctrl/Cmd+Y** redo, **Ctrl/Cmd+D** duplicates the selected
    resource in scene-edit mode.

## Architecture notes

- `src/domain/` — pure TypeScript, no rendering: types, the reservation/conflict/approver
  engine, data-driven rules, scene helpers and the scene registry (pharma + stadium + warehouse),
  plan JSON serialization. This is the product core (plan §8.1); unit tests are colocated
  (`*.test.ts`).
- `src/state/` — Zustand store + derived-state selectors; any plan edit bumps the revision
  and invalidates approvals. Scene data flows through the store, never via global imports.
- `src/components/` — React-Three-Fiber viewport, timeline, side panel, plan import/export
  controls. Rendering is a projection of the domain model, never the source of truth.
- `src/hooks/` — cross-cutting React hooks (keyboard shortcuts).
- `src/export/` — standalone document generation (HTML briefing).

Tooling: ESLint + Prettier + Vitest, enforced in CI (`.github/workflows/ci.yml`).
Conventions for AI-assisted work live in `CLAUDE.md`.
