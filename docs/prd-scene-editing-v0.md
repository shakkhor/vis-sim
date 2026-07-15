# PRD — Interactive Scene Editing v0

**Status:** Draft · **Owner:** Product · **Target:** next feature wave (Phase 0 prototype)
**References:** PRODUCT_PLAN.md §4 (domain model), §5.1 (Scene Builder), §6 (flagship loop), §9.2 (time-to-first-scene risk)

## 1. Problem & goal

Today the 3D scene is read-only: zones, connectors, and blocks are hardcoded in
`sampleScene.ts` / `warehouseScene.ts`. Every conversation with a design partner starts with
"can I make it look like *my* facility?" — and the answer is "edit TypeScript." That is fatal
for the §9.2 risk we committed to measuring relentlessly: **time-to-first-scene**. The Scene
Builder (§5.1) is a pillar of the vision ("build a 3D model with no CAD skills"), and Phase 0
has validated everything *except* it.

**Goal:** a planner can reshape an existing scene — rename, re-own, move, resize, create, and
delete zones/connectors, and adjust move paths — directly in the viewport, and watch
reservations, conflicts, and approvers recompute live. Scene editing must *feed* the
reservation engine, not sit beside it: the live-recompute ribbon is the product's signature.

**Non-goal:** a full Scene Builder. v0 edits the resource layer (zones/connectors) and move
waypoints only; walls, levels, and parametric blocks remain out of scope.

## 2. Scope

### In scope (v0)

1. Click-to-select a zone or connector in the viewport.
2. Inspector panel for the selected resource: edit **name**, **owner teams**, **tags**.
3. Drag a selected resource to move it (footprint `Rect` translation).
4. Drag a corner handle to resize a selected resource.
5. Create a new zone or connector by drawing a rectangle on the ground plane.
6. Delete a selected resource.
7. Drag individual waypoints of a selected move's path.
8. All geometry snaps to the existing 0.5-unit grid.

### Explicitly out of scope (v0)

- Undo/redo (accepted risk; deletion gets a confirm instead).
- Walls, floors, levels, parametric blocks, asset library (§5.1 later phases).
- Multi-select and marquee selection.
- Snapping beyond the 0.5 grid (no edge/center alignment guides).
- Scene save/versioning — plan JSON export/import already persists everything the prototype needs.
- Per-team edit permissions (single-user prototype).

## 3. User stories & acceptance criteria

**US-1 — Select a resource.**
Given the viewport in Edit-scene mode, When I click a zone or connector, Then it is visually
highlighted and the inspector shows its name, kind, owner teams, and tags; When I click empty
ground or press ESC, Then the selection clears.

**US-2 — Edit resource metadata.**
Given a selected resource, When I change its name, toggle owner teams, or edit tags in the
inspector, Then the change applies immediately, the plan `revision` bumps, and the approver
list recomputes (owners of touched resources minus the authoring team).

**US-3 — Move a resource.**
Given a selected resource, When I drag it across the ground plane, Then its footprint follows
snapped to the 0.5 grid, and on release all reservations, conflicts, and rule violations
recompute from the moves (reservations are derived, never stored).

**US-4 — Resize a resource (signature moment).**
Given a selected resource, When I drag a corner handle, Then the rect resizes live on the 0.5
grid, and reservations recompute immediately: growing a zone under an existing move's path
adds a reservation (and its owners as approvers) without any other action; shrinking it away
from all paths removes them. Recompute must feel instant (synchronous, per §8.1).

**US-5 — Create a resource.**
Given Edit-scene mode with the "draw zone" or "draw connector" tool armed, When I drag a
rectangle on the ground, Then a new resource is created with a default name, no tags, and a
prompt-to-assign owner team in the inspector; Then any move path crossing it immediately
produces a reservation for it.

**US-6 — Delete an unreferenced resource.**
Given a selected resource that no move currently reserves, When I press Delete or click
Delete in the inspector, Then it is removed after a lightweight confirm and the revision bumps.

**US-7 — Delete a reserved resource (governance edge case).**
Given a selected resource that one or more moves currently reserve, When I delete it, Then I
see a warning naming the affected moves ("3 moves reserve Gate 7") and must confirm; after
confirming, reservations, conflicts (e.g. a connector-overlap block that involved it), and the
approver set all recompute — a team whose only touched resource was deleted drops off the
approver list.

**US-8 — Edits invalidate approvals (governance edge case).**
Given a plan that is approved, in review, or published, When any scene edit in this PRD
touches a resource that plan's reservations include (move, resize, retag, re-own, delete),
Then the plan reverts to draft state: `revision` bumps, all approvals clear, published status
clears, and the UI states why ("scene changed — re-approval required").

**US-9 — Edit move waypoints.**
Given a selected move, When I drag one of its waypoints, Then the path updates snapped to the
grid and reservations/conflicts/approvers recompute on release; a rerouted path that no longer
crosses a connector clears that connector's blocking conflict without any other action.

**US-10 — Rules stay live.**
Given a scene with data-driven rules (e.g. warehouse pedestrian-only walkway), When I retag or
resize a rule-relevant zone so a move now violates (or no longer violates) a rule, Then the
violation appears/disappears in the side panel and viewport immediately.

**US-11 — Edits survive export/import.**
Given a scene I have edited, When I export the plan JSON and re-import it, Then edited/created
resources and moved waypoints round-trip intact (serialization covers scene resources).

**US-12 — Mode isolation.**
Given I am in Edit-scene mode, When I try planning actions (draw move, drag timeline, play),
Then they are unavailable or clearly deferred; When I exit Edit-scene mode, Then planning
behaves exactly as before this feature.

## 4. UX decisions

- **Distinct "Edit scene" mode**, entered from a toolbar toggle. Planning view modes (1/2/3)
  and shortcuts are untouched; Edit mode adds its own tool strip (select / draw zone / draw
  connector). No mixed-mode ambiguity: you are planning or editing the scene, never both.
- **ESC** exits: first clears the active drawing/drag, then the selection, then the mode
  (consistent with the existing ESC-cancels-drawing convention).
- **Selected resource is visibly highlighted** (outline + inspector focus); corner handles
  render only on selection.
- **Camera orbit is disabled while dragging** a resource, handle, or waypoint — pointer-down
  on an editable object captures the gesture; orbit resumes on release.
- Delete confirms are inline dialogs, not browser `confirm()`.
- All new logic lands in `src/domain/` (pure, unit-tested); components stay projections.

## 5. Success signals (prototype, design-partner oriented)

- In a demo, a design partner can reshape the sample scene into a rough version of *their*
  gate/corridor/dock layout in **under 10 minutes**, unassisted after one walkthrough.
- Partners visibly react to the signature moment: resizing a zone and watching approvers and
  conflicts change live ("so if I widen the staging area, Security has to sign off?").
- Demos stop opening with an apology for the hardcoded scene; sessions produce partner-shaped
  scenes we keep as JSON fixtures.
- No engine-invariant regressions: `npm run check` stays green; approval-invalidation and
  derived-reservation invariants hold under editing (covered by new unit tests).

## 6. Open questions (deliberately deferred)

- **Scene versioning vs. plan pinning** (§5.1): production needs plans pinned to scene
  versions with impact warnings; v0 mutates the live scene and invalidates approvals instead.
  When does the prototype need real version pinning to test the review story honestly?
- **Per-team edit permissions:** who may edit a zone another team owns? Likely RBAC-scoped
  (builder role per site/team) — irrelevant while single-user, decisive for MVP.
- **Undo/redo:** deferred here, but the event-sourced direction (§8.1) suggests edit
  operations should be command-shaped now so undo is cheap later. Confirm before Phase 1.
- **Connector semantics:** connectors gain capacity attributes in the full model (§4.1) —
  does the inspector grow capacity fields in v0.1, or wait for the rules engine to consume them?
