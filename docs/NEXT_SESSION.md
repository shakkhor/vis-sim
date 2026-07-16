# Handoff — next session

Read CLAUDE.md first (commands, architecture, invariants). Gate: `npm run check` — but
NEVER run npm install/tests in this mounted folder from the Cowork sandbox (it corrupts
package extraction); sync `src`/`scripts` to a VM-local dir, install and run there,
copy fixed files back. Commit in logical groups with conventional messages.

## State (as of 2026-07-16 ~04:00 +06)

46 commits, 220 tests green, working tree clean. Waves shipped: domain engine
(reservations/conflicts/approvers), rules (forbidden-entry + separation), 3 scenes
(pharma default — modeled on the user's real GMP floor plans), plan JSON I/O,
scene editing (select/drag/resize/create/delete/duplicate, waypoints), undo/redo,
localStorage persistence, structural blocks as data, editor shell (tool rail,
collapsible docks, transport, hint bar), 2D/Iso label fix, GitHub Pages deploy
workflow (user still needs to push to GitHub themselves).

## Verify first (10 min)

Open preview.html in a real browser: 2D/Iso views must show the scene with small
fixed-size labels (regression check for the ortho fix). Editor shell: left rail
cycles with `[`, Edit scene toggles its tool group closed on second click.

## State update (2026-07-16 ~04:30 +06): 52 commits, 256 tests green, tree clean.
Shipped since first handoff: scene rename + team editor (with governance guards),
custom-scene deletion, Delete-key scoping fix (US-6), unidirectional-flow rule kind
(corridor-2 is one-way east in pharma), 2D/Iso label fix, preview regenerated.

## Backlog, in priority order (user direction: scene building > governance/permissions)

1. Block editing in scene mode (blocks are data but not editable in-app: select/move/
   add walls; consider auto-wall generation around a zone).
2. Inline dialogs replacing window.confirm (PRD deviation flagged by wave-4 master).
3. Rule editor UI (rules are data but only editable in JSON; scene card could list
   rules with add/remove for the three kinds).
4. Actor library polish: distinct meshes per actor kind, counts badge, path arrows
   showing direction (pairs with the unidirectional rule).
5. Per-reviewer scoped playback (approver sees their zones framed) — deferred
   governance, only after scene building satisfies the user.

## Known constraints

- Mounted-folder npm corruption (see top). Deletes in mount need the
  allow_cowork_file_delete permission (already granted this session, may need re-grant).
- Commits authored as shakkhor@monetizenow.io — user may want to reset author before push.
- preview.html is gitignored; regenerate via vite build + inline script (see git log
  or ask the user for the snippet in prior sessions).
