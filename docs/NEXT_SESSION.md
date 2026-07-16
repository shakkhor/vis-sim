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

## State update (wave 8, 2026-07-16 ~13:00 +06): 306 tests green.
Shipped: in-app block editing (select/drag/resize/add wall+box/delete, block
inspector with kind/height/elevation/color), inline ConfirmDialog replacing all
window.confirm, rule editor UI (add/remove all three rule kinds), path direction
arrows, per-kind actor meshes. Repo is on GitHub (github-personal:shakkhor/vis-sim).

Known deviation (accepted): Delete/Backspace shortcut deletes without the inline
confirm dialog (undoable via Ctrl+Z, so low risk; PRD US-6 wanted a confirm —
revisit if a design partner trips on it).

## State update (wave 9): 311 tests green. Shipped per-reviewer scoped playback —
eye icon on approver/author rows focuses that team: camera frames their zones,
their reservations highlight with a team-color ring, everything else dims;
Esc exits (outermost escape layer); "Viewing as <team>" banner in the panel.

## Backlog, in priority order

1. Design-partner feedback pass — user is showing the app to an ops person; their
   feedback reorders everything below.
2. Auto-wall generation around a zone (one click walls a room).
3. Custom scene: connector capacity fields + capacity rule kind.
4. Multi-user backend (Phase 1→2 boundary — architecture decision, not a wave).

## Known constraints

- Mounted-folder npm corruption (see top). Deletes in mount need the
  allow_cowork_file_delete permission (already granted this session, may need re-grant).
- Commits authored as shakkhor@monetizenow.io — user may want to reset author before push.
- preview.html is gitignored; regenerate via vite build + inline script (see git log
  or ask the user for the snippet in prior sessions).
