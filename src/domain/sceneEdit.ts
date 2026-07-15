// Scene-mutation helpers for interactive scene editing (PRD US-2..US-7, US-9).
// Pure functions: every helper returns a NEW SceneDef/Move and never mutates its
// inputs. This is load-bearing — scene.ts memoizes teamById/resourceById lookups
// in WeakMaps keyed off SceneDef object identity, so an edited scene MUST be a
// fresh object (with fresh nested objects for anything that changed) to get
// fresh lookups instead of stale cached ones.
import type { Move, Rect, Resource, ResourceKind, SceneDef, Vec2 } from './types';

/** Ground-plane grid step: all edited geometry snaps to this (PRD §2.8). */
export const GRID = 0.5;

/** Minimum footprint width/depth for zones and connectors, in world units. */
const MIN_SIZE = 2;

/** Snap a scalar to the nearest GRID multiple. */
export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/** Snap a rect's corner and size to the grid. Returns a new Rect. */
export function snapRect(r: Rect): Rect {
  return { x: snap(r.x), z: snap(r.z), w: snap(r.w), d: snap(r.d) };
}

function mustFindResource(scene: SceneDef, resourceId: string): Resource {
  const found = scene.resources.find((r) => r.id === resourceId);
  if (!found) {
    throw new Error(`Unknown resource id: ${resourceId}`);
  }
  return found;
}

/** New scene with `resourceId`'s entry replaced by `update(old)`. Never mutates. */
function withResource(
  scene: SceneDef,
  resourceId: string,
  update: (r: Resource) => Resource,
): SceneDef {
  mustFindResource(scene, resourceId);
  return {
    ...scene,
    resources: scene.resources.map((r) => (r.id === resourceId ? update(r) : r)),
  };
}

/** Clamp a rect to the minimum footprint after snapping. */
function enforceMinSize(r: Rect): Rect {
  return { ...r, w: Math.max(MIN_SIZE, r.w), d: Math.max(MIN_SIZE, r.d) };
}

/** Translate a resource's footprint by (dx, dz), snapped to the grid (US-3). */
export function moveResource(
  scene: SceneDef,
  resourceId: string,
  dx: number,
  dz: number,
): SceneDef {
  return withResource(scene, resourceId, (r) => ({
    ...r,
    rect: { ...r.rect, x: snap(r.rect.x + dx), z: snap(r.rect.z + dz) },
  }));
}

/** Replace a resource's footprint; snaps to grid and enforces min w/d (US-4). */
export function resizeResource(scene: SceneDef, resourceId: string, rect: Rect): SceneDef {
  return withResource(scene, resourceId, (r) => ({
    ...r,
    rect: enforceMinSize(snapRect(rect)),
  }));
}

/** Add a new resource; snaps its rect and enforces min size. Throws on duplicate id (US-5). */
export function addResource(scene: SceneDef, resource: Resource): SceneDef {
  if (scene.resources.some((r) => r.id === resource.id)) {
    throw new Error(`Duplicate resource id: ${resource.id}`);
  }
  const added: Resource = { ...resource, rect: enforceMinSize(snapRect(resource.rect)) };
  return { ...scene, resources: [...scene.resources, added] };
}

/** Remove a resource. Throws on unknown id (US-6/US-7; reservation impact is the caller's job). */
export function removeResource(scene: SceneDef, resourceId: string): SceneDef {
  mustFindResource(scene, resourceId);
  return { ...scene, resources: scene.resources.filter((r) => r.id !== resourceId) };
}

/**
 * Update a resource's name / owner teams / tags (US-2). Owner team ids must
 * exist in scene.teams — throws naming the first unknown team.
 */
export function updateResourceMeta(
  scene: SceneDef,
  resourceId: string,
  meta: { name?: string; ownerTeamIds?: string[]; tags?: string[] },
): SceneDef {
  if (meta.ownerTeamIds) {
    const known = new Set(scene.teams.map((t) => t.id));
    for (const teamId of meta.ownerTeamIds) {
      if (!known.has(teamId)) {
        throw new Error(`Unknown team id: ${teamId}`);
      }
    }
  }
  return withResource(scene, resourceId, (r) => ({
    ...r,
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    ...(meta.ownerTeamIds !== undefined ? { ownerTeamIds: [...meta.ownerTeamIds] } : {}),
    ...(meta.tags !== undefined ? { tags: [...meta.tags] } : {}),
  }));
}

/** New Move with waypoint `index` replaced by `p` snapped to the grid (US-9). */
export function moveWaypoint(move: Move, index: number, p: Vec2): Move {
  if (!Number.isInteger(index) || index < 0 || index >= move.path.length) {
    throw new Error(`Waypoint index ${index} out of bounds for move ${move.id}`);
  }
  const path = move.path.map((w, i) => (i === index ? { x: snap(p.x), z: snap(p.z) } : w));
  return { ...move, path };
}

/** Smallest `${kind}-${n}` (n >= 1) not already used by a resource in the scene. */
export function makeResourceId(scene: SceneDef, kind: ResourceKind): string {
  const used = new Set(scene.resources.map((r) => r.id));
  let n = 1;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

/**
 * Copy a resource under a freshly generated id, name suffixed ' copy', and the
 * footprint offset by +2/+2 (snapped). Throws on unknown id.
 */
export function duplicateResource(scene: SceneDef, resourceId: string): SceneDef {
  const source = mustFindResource(scene, resourceId);
  const copy: Resource = {
    ...source,
    id: makeResourceId(scene, source.kind),
    name: `${source.name} copy`,
    rect: snapRect({ ...source.rect, x: source.rect.x + 2, z: source.rect.z + 2 }),
    ownerTeamIds: [...source.ownerTeamIds],
    ...(source.tags !== undefined ? { tags: [...source.tags] } : {}),
  };
  return { ...scene, resources: [...scene.resources, copy] };
}

/**
 * Grid-snap `rect`, then magnetically snap its edges to the nearest edges of
 * other resources within `threshold` world units. Both min and max edges are
 * candidates on both axes; the rect is translated (never resized), at most once
 * per axis (nearest candidate wins). `movingId` names the resource being
 * dragged so its own edges are ignored (`null` = new rect, exclude nothing).
 * `guides` reports the neighbor edge lines that were snapped to, for rendering.
 */
export function snapRectToNeighbors(
  resources: Resource[],
  movingId: string | null,
  rect: Rect,
  threshold = 1,
): { rect: Rect; guides: Array<{ axis: 'x' | 'z'; value: number }> } {
  const snapped = snapRect(rect);
  const neighbors = resources.filter((r) => r.id !== movingId);
  const result: Rect = { ...snapped };
  const guides: Array<{ axis: 'x' | 'z'; value: number }> = [];

  for (const axis of ['x', 'z'] as const) {
    const sizeKey = axis === 'x' ? 'w' : 'd';
    const movingEdges = [snapped[axis], snapped[axis] + snapped[sizeKey]];
    let best: { delta: number; value: number; dist: number } | null = null;
    for (const neighbor of neighbors) {
      const edges = [neighbor.rect[axis], neighbor.rect[axis] + neighbor.rect[sizeKey]];
      for (const edge of edges) {
        for (const movingEdge of movingEdges) {
          const dist = Math.abs(edge - movingEdge);
          if (dist <= threshold && (best === null || dist < best.dist)) {
            best = { delta: edge - movingEdge, value: edge, dist };
          }
        }
      }
    }
    if (best !== null) {
      result[axis] = snapped[axis] + best.delta;
      guides.push({ axis, value: best.value });
    }
  }

  return { rect: result, guides };
}
