// Reservation & conflict engine — pure functions, no rendering, headless-runnable.
// Core mechanism of the product (PRODUCT_PLAN.md §4.3, §8.1).

import type { Conflict, Move, Rect, Reservation, Resource, Vec2 } from './types';

/** Tolerance for merging adjacent arc-length intervals and dropping zero-measure grazes. */
const MERGE_EPS = 1e-9;

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

/**
 * Parametric interval [t0, t1] ⊆ [0, 1] of segment a→b inside rect r
 * (Liang–Barsky clipping against the closed rect), or null if disjoint.
 */
function clipSegmentToRect(a: Vec2, b: Vec2, r: Rect): [number, number] | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // (p, q) pairs for the four slab boundaries: left, right, near, far.
  const boundaries: Array<[number, number]> = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dz, a.z - r.z],
    [dz, r.z + r.d - a.z],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of boundaries) {
    if (p === 0) {
      if (q < 0) return null; // parallel to this boundary and outside its slab
      continue;
    }
    const t = q / p;
    if (p < 0) {
      // entering
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      // exiting
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Compute the reservations a move makes by exactly clipping each path segment
 * against each resource rect, merging contiguous arc-length intervals across
 * segments, and mapping arc-length fractions to the move's time window
 * (constant-speed assumption). Disjoint crossings of the same resource yield
 * separate reservations; zero-measure grazes (e.g. touching a corner) yield none.
 */
export function reservationsForMove(move: Move, resources: Resource[]): Reservation[] {
  const total = pathLength(move.path);
  const dur = move.tEnd - move.tStart;
  if (total === 0 || dur <= 0 || move.path.length < 2) return [];
  const out: Reservation[] = [];
  for (const r of resources) {
    // Arc-length-fraction intervals where the path lies inside this rect.
    const intervals: Array<[number, number]> = [];
    let cum = 0;
    for (let i = 1; i < move.path.length; i++) {
      const a = move.path[i - 1];
      const b = move.path[i];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen === 0) continue; // zero-length segment: contributes no arc length
      const clipped = clipSegmentToRect(a, b, r.rect);
      if (clipped) {
        intervals.push([(cum + clipped[0] * segLen) / total, (cum + clipped[1] * segLen) / total]);
      }
      cum += segLen;
    }
    // Segments are visited in path order, so intervals are already sorted by start.
    const merged: Array<[number, number]> = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + MERGE_EPS) {
        last[1] = Math.max(last[1], iv[1]);
      } else {
        merged.push([iv[0], iv[1]]);
      }
    }
    for (const [f0, f1] of merged) {
      if (f1 - f0 <= MERGE_EPS) continue; // corner/edge graze: no occupancy
      out.push({
        resourceId: r.id,
        moveId: move.id,
        t0: move.tStart + f0 * dur,
        t1: move.tStart + f1 * dur,
      });
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
 * different teams are warnings. (Tag-based rules live in rules.ts — plan §4.3.)
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
