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

## Backlog, in priority order (user direction: scene building > governance/permissions)

1. Custom scene management: delete a custom scene from the picker; rename scenes;
   currently New scene ids persist in localStorage forever (flagged concern).
2. Teams editor for custom scenes (blank scenes have hardcoded ops/partner teams —
   can't add teams from UI; blocks the "build your own facility" story).
3. Block editing in scene mode (blocks are data but not editable in-app: select/move/
   add walls; consider auto-wall generation around a zone).
4. Inline dialogs replacing window.confirm (PRD deviation flagged by wave-4 master).
5. Delete-key scoping: in scene mode with a resource selected, Delete should delete
   the resource, not the selected move (PRD US-6 deviation).
6. Unidirectional-flow rule kind (user's GMP reference drawings show directional
   personnel/material flows; rules can't express direction yet).
7. Per-reviewer scoped playback (approver sees their zones framed) — deferred
   governance, only after scene building satisfies the user.

## Known constraints

- Mounted-folder npm corruption (see top). Deletes in mount need the
  allow_cowork_file_delete permission (already granted this session, may need re-grant).
- Commits authored as shakkhor@monetizenow.io — user may want to reset author before push.
- preview.html is gitignored; regenerate via vite build + inline script (see git log
  or ask the user for the snippet in prior sessions).
