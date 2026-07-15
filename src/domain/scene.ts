// Lookup helpers over a SceneDef. Pure; O(1) after first call per scene object.
import type { Resource, SceneDef, Team } from './types';

const teamCache = new WeakMap<SceneDef, Map<string, Team>>();
const resourceCache = new WeakMap<SceneDef, Map<string, Resource>>();

export function teamById(scene: SceneDef, id: string): Team | undefined {
  let map = teamCache.get(scene);
  if (!map) {
    map = new Map(scene.teams.map((t) => [t.id, t]));
    teamCache.set(scene, map);
  }
  return map.get(id);
}

export function resourceById(scene: SceneDef, id: string): Resource | undefined {
  let map = resourceCache.get(scene);
  if (!map) {
    map = new Map(scene.resources.map((r) => [r.id, r]));
    resourceCache.set(scene, map);
  }
  return map.get(id);
}

export function teamColor(scene: SceneDef, id: string): string {
  return teamById(scene, id)?.color ?? '#888888';
}
