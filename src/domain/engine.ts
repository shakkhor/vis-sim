// Reservation & conflict engine — pure functions, no rendering, headless-runnable.
// Core mechanism of the product (PRODUCT_PLAN.md §4.3, §8.1).

import type { Conflict, Move, Rect, Reservation, Resource, Vec2 } from './types';

const SAMPLES = 240;

export function pathLength(path: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return len;
}

/** Point at a given distance along a polyline. */
export function pointAlong(path: Vec2[], dist: number): Vec2 {
  if (path.length === 0) return { x: 0, z: 0 };
  if (path.length === 1) return path[0];
  let remaining = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= seg && seg > 0) {
      const f = remaining / seg;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
    remaining -= seg;
  }
  return path[path.length - 1];
}

function inRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.z >= r.z && p.z <= r.z + r.d;
}

/**
 * Compute the reservations a move makes by sampling its path and mapping
 * arc-length fractions to the move's time window (constant-speed assumption).
 */
export function reservationsForMove(move: Move, resources: Resource[]): Reservation[] {
  const total = pathLength(move.path);
  const dur = move.tEnd - move.tStart;
  if (total === 0 || dur <= 0 || move.path.length < 2) return [];
  const out: Reservation[] = [];
  for (const r of resources) {
    let startFrac: number | null = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const frac = i / SAMPLES;
      const inside = inRect(pointAlong(move.path, frac * total), r.rect);
      if (inside && startFrac === null) startFrac = frac;
      const closing = startFrac !== null && (!inside || i === SAMPLES);
      if (closing) {
        const endFrac = inside ? frac : (i - 1) / SAMPLES;
        out.push({
          resourceId: r.id,
          moveId: move.id,
          t0: move.tStart + startFrac! * dur,
          t1: move.tStart + endFrac * dur,
        });
        startFrac = null;
      }
    }
  }
  return out;
}

export function allReservations(moves: Move[], resources: Resource[]): Reservation[] {
  return moves.flatMap((m) => reservationsForMove(m, resources));
}

/**
 * Conflicts: two reservations on the same resource with overlapping windows
 * from different moves. Connector overlaps are blocking; zone overlaps between
 * different teams are warnings. (Rules engine comes later — plan §4.3.)
 */
export function computeConflicts(
  reservations: Reservation[],
  resources: Resource[],
  moves: Move[],
): Conflict[] {
  const byResource = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const list = byResource.get(r.resourceId) ?? [];
    list.push(r);
    byResource.set(r.resourceId, list);
  }
  const moveById = new Map(moves.map((m) => [m.id, m]));
  const resourceMap = new Map(resources.map((r) => [r.id, r]));
  const conflicts: Conflict[] = [];
  for (const [resourceId, list] of byResource) {
    const resource = resourceMap.get(resourceId);
    if (!resource) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.moveId === b.moveId) continue;
        const t0 = Math.max(a.t0, b.t0);
        const t1 = Math.min(a.t1, b.t1);
        if (t0 >= t1) continue;
        const teamA = moveById.get(a.moveId)?.teamId;
        const teamB = moveById.get(b.moveId)?.teamId;
        const blocking = resource.kind === 'connector';
        // Same-team zone overlap is normal operations, not a conflict.
        if (!blocking && teamA === teamB) continue;
        conflicts.push({
          id: `${resourceId}:${a.moveId}:${b.moveId}`,
          resourceId,
          moveAId: a.moveId,
          moveBId: b.moveId,
          t0,
          t1,
          blocking,
        });
      }
    }
  }
  return conflicts.sort((a, b) => a.t0 - b.t0);
}

/** Teams whose resources the plan touches, minus the authoring team = required approvers. */
export function requiredApproverTeamIds(
  reservations: Reservation[],
  resources: Resource[],
  authorTeamId: string,
): string[] {
  const resourceMap = new Map(resources.map((r) => [r.id, r]));
  const ids = new Set<string>();
  for (const res of reservations) {
    resourceMap.get(res.resourceId)?.ownerTeamIds.forEach((t) => ids.add(t));
  }
  ids.delete(authorTeamId);
  return [...ids].sort();
}

/** Nominal position of a move's lead actor at time t, or null if not active. */
export function posAtTime(move: Move, t: number): Vec2 | null {
  if (t < move.tStart || t > move.tEnd) return null;
  const frac = (t - move.tStart) / (move.tEnd - move.tStart);
  return pointAlong(move.path, frac * pathLength(move.path));
}

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
