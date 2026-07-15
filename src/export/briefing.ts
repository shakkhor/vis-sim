// Printable briefing export — precursor to the Training Package (PRODUCT_PLAN.md §5.6).
// Pure: no DOM/window access; the caller decides how to display or print the document.

import { fmtTime, requiredApproverTeamIds, reservationsForMove } from '../domain/engine';
import type { Move, Reservation, SceneDef, Team } from '../domain/types';

const ACTOR_LABELS: Record<Move['actorKind'], string> = {
  cohort: 'Spectator cohort',
  staff: 'Staff',
  vehicle: 'Vehicle',
  material: 'Material',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Resource names a move traverses, in traversal order (deduplicated). */
function traversedResourceNames(scene: SceneDef, reservations: Reservation[]): string[] {
  const nameById = new Map(scene.resources.map((r) => [r.id, r.name]));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const res of [...reservations].sort((a, b) => a.t0 - b.t0)) {
    if (seen.has(res.resourceId)) continue;
    seen.add(res.resourceId);
    names.push(nameById.get(res.resourceId) ?? res.resourceId);
  }
  return names;
}

function movesForTeam(
  team: Team,
  moves: Move[],
  reservationsByMove: Map<string, Reservation[]>,
  scene: SceneDef,
): Move[] {
  const ownedResourceIds = new Set(
    scene.resources.filter((r) => r.ownerTeamIds.includes(team.id)).map((r) => r.id),
  );
  return moves
    .filter(
      (m) =>
        m.teamId === team.id ||
        (reservationsByMove.get(m.id) ?? []).some((res) => ownedResourceIds.has(res.resourceId)),
    )
    .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
}

function sectionForTeam(
  team: Team,
  teamMoves: Move[],
  reservationsByMove: Map<string, Reservation[]>,
  scene: SceneDef,
): string {
  const rows = teamMoves
    .map((m) => {
      const where = traversedResourceNames(scene, reservationsByMove.get(m.id) ?? []);
      return `<tr>
        <td class="time">${fmtTime(m.tStart)}–${fmtTime(m.tEnd)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(ACTOR_LABELS[m.actorKind])} × ${m.count}</td>
        <td>${escapeHtml(where.join(' → '))}</td>
      </tr>`;
    })
    .join('\n');
  return `<section>
    <h2><span class="swatch" style="background:${escapeHtml(team.color)}"></span>${escapeHtml(team.name)}</h2>
    <table>
      <thead>
        <tr><th>Time</th><th>Move</th><th>Actor</th><th>Where</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </section>`;
}

/**
 * Generate a complete standalone, print-friendly HTML briefing document:
 * one section per team that executes moves or must approve the plan, each
 * with a chronological table of the moves relevant to that team.
 */
export function generateBriefingHtml(scene: SceneDef, moves: Move[], planName: string): string {
  const reservationsByMove = new Map(
    moves.map((m) => [m.id, reservationsForMove(m, scene.resources)]),
  );
  const allReservations = [...reservationsByMove.values()].flat();
  const approverIds = new Set(
    requiredApproverTeamIds(allReservations, scene.resources, scene.authorTeamId),
  );
  const executingIds = new Set(moves.map((m) => m.teamId));
  const teams = scene.teams.filter((t) => executingIds.has(t.id) || approverIds.has(t.id));

  const sections = teams
    .map((t) => {
      const teamMoves = movesForTeam(t, moves, reservationsByMove, scene);
      return sectionForTeam(t, teamMoves, reservationsByMove, scene);
    })
    .join('\n');

  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(planName)} — Briefing</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #1a1a1a;
    margin: 0 auto;
    max-width: 800px;
    padding: 32px;
    line-height: 1.4;
  }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 13px; margin: 0 0 24px; }
  section { margin-bottom: 28px; page-break-inside: avoid; }
  h2 {
    font-size: 16px;
    border-bottom: 2px solid #ddd;
    padding-bottom: 4px;
    margin: 0 0 8px;
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    margin-right: 8px;
    vertical-align: baseline;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
  th { color: #555; font-weight: 600; border-bottom: 2px solid #ccc; }
  td.time { white-space: nowrap; font-variant-numeric: tabular-nums; }
  @media print {
    body { padding: 0; }
    section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(planName)} — Team briefing</h1>
<p class="meta">Generated ${escapeHtml(generatedAt)} · Scene: ${escapeHtml(scene.name)}</p>
${sections}
</body>
</html>`;
}
