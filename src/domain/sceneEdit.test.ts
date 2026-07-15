import { describe, expect, it } from 'vitest';
import { resourceById, teamById } from './scene';
import {
  GRID,
  addResource,
  duplicateResource,
  makeResourceId,
  moveResource,
  moveWaypoint,
  removeResource,
  resizeResource,
  snap,
  snapRect,
  snapRectToNeighbors,
  updateResourceMeta,
} from './sceneEdit';
import type { Move, Rect, Resource, SceneDef } from './types';

function makeScene(): SceneDef {
  return {
    id: 'test-scene',
    name: 'Test Scene',
    teams: [
      { id: 'team-ops', name: 'Operations', color: '#3388ff' },
      { id: 'team-sec', name: 'Security', color: '#ff8833' },
    ],
    resources: [
      {
        id: 'zone-1',
        name: 'Staging',
        kind: 'zone',
        rect: { x: 0, z: 0, w: 4, d: 4 },
        ownerTeamIds: ['team-ops'],
      },
      {
        id: 'connector-1',
        name: 'Gate 7',
        kind: 'connector',
        rect: { x: 6, z: 0, w: 2, d: 4 },
        ownerTeamIds: ['team-sec'],
        tags: ['gate'],
      },
    ],
    authorTeamId: 'team-ops',
    dayStart: 6 * 60,
    dayEnd: 22 * 60,
  };
}

function makeMove(): Move {
  return {
    id: 'move-1',
    name: 'Morning cohort',
    actorKind: 'cohort',
    count: 20,
    teamId: 'team-ops',
    path: [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 5 },
    ],
    tStart: 720,
    tEnd: 780,
  };
}

/** Assert `edit` returned a new scene and left the input byte-for-byte untouched. */
function expectImmutable(edit: (scene: SceneDef) => SceneDef): SceneDef {
  const scene = makeScene();
  const snapshot = structuredClone(scene);
  const next = edit(scene);
  expect(scene).toEqual(snapshot);
  expect(next).not.toBe(scene);
  return next;
}

describe('snap / snapRect', () => {
  it('snaps scalars to the nearest 0.5 grid step', () => {
    expect(GRID).toBe(0.5);
    expect(snap(0.74)).toBe(0.5);
    expect(snap(0.76)).toBe(1);
    expect(snap(-1.2)).toBe(-1);
    expect(snap(2.5)).toBe(2.5);
  });

  it('snaps every rect component and returns a new object', () => {
    const rect = { x: 0.3, z: -0.3, w: 3.24, d: 4.76 };
    const snapped = snapRect(rect);
    expect(snapped).toEqual({ x: 0.5, z: -0.5, w: 3, d: 5 });
    expect(snapped).not.toBe(rect);
    expect(rect).toEqual({ x: 0.3, z: -0.3, w: 3.24, d: 4.76 });
  });
});

describe('moveResource', () => {
  it('translates the footprint snapped to the grid', () => {
    const next = expectImmutable((s) => moveResource(s, 'zone-1', 1.3, -0.7));
    expect(resourceById(next, 'zone-1')?.rect).toEqual({ x: 1.5, z: -0.5, w: 4, d: 4 });
  });

  it('leaves untouched resources reference-equal (structural sharing)', () => {
    const scene = makeScene();
    const next = moveResource(scene, 'zone-1', 2, 0);
    expect(resourceById(next, 'connector-1')).toBe(resourceById(scene, 'connector-1'));
  });

  it('throws naming an unknown resource id', () => {
    expect(() => moveResource(makeScene(), 'zone-99', 1, 1)).toThrow(/zone-99/);
  });
});

describe('resizeResource', () => {
  it('replaces the rect snapped to the grid', () => {
    const next = expectImmutable((s) =>
      resizeResource(s, 'zone-1', { x: 1.2, z: 1.2, w: 6.3, d: 5.7 }),
    );
    expect(resourceById(next, 'zone-1')?.rect).toEqual({ x: 1, z: 1, w: 6.5, d: 5.5 });
  });

  it('clamps width and depth to the minimum size of 2', () => {
    const next = resizeResource(makeScene(), 'zone-1', { x: 0, z: 0, w: 0.5, d: 1 });
    expect(resourceById(next, 'zone-1')?.rect).toEqual({ x: 0, z: 0, w: 2, d: 2 });
  });

  it('throws naming an unknown resource id', () => {
    expect(() => resizeResource(makeScene(), 'nope', { x: 0, z: 0, w: 3, d: 3 })).toThrow(/nope/);
  });
});

describe('addResource', () => {
  const draft: Resource = {
    id: 'zone-2',
    name: 'New zone',
    kind: 'zone',
    rect: { x: 10.2, z: 0.3, w: 1.1, d: 3.4 },
    ownerTeamIds: [],
  };

  it('appends the resource with a snapped, min-clamped rect', () => {
    const next = expectImmutable((s) => addResource(s, draft));
    expect(next.resources).toHaveLength(3);
    expect(resourceById(next, 'zone-2')?.rect).toEqual({ x: 10, z: 0.5, w: 2, d: 3.5 });
  });

  it('does not mutate the passed-in resource', () => {
    const before = structuredClone(draft);
    addResource(makeScene(), draft);
    expect(draft).toEqual(before);
  });

  it('throws naming a duplicate id', () => {
    expect(() => addResource(makeScene(), { ...draft, id: 'zone-1' })).toThrow(/zone-1/);
  });
});

describe('removeResource', () => {
  it('removes the resource and nothing else', () => {
    const next = expectImmutable((s) => removeResource(s, 'connector-1'));
    expect(next.resources.map((r) => r.id)).toEqual(['zone-1']);
  });

  it('throws naming an unknown resource id', () => {
    expect(() => removeResource(makeScene(), 'connector-9')).toThrow(/connector-9/);
  });
});

describe('updateResourceMeta', () => {
  it('applies name, ownerTeamIds, and tags', () => {
    const next = expectImmutable((s) =>
      updateResourceMeta(s, 'zone-1', {
        name: 'Staging West',
        ownerTeamIds: ['team-sec'],
        tags: ['clean'],
      }),
    );
    const r = resourceById(next, 'zone-1');
    expect(r?.name).toBe('Staging West');
    expect(r?.ownerTeamIds).toEqual(['team-sec']);
    expect(r?.tags).toEqual(['clean']);
  });

  it('leaves omitted fields unchanged', () => {
    const next = updateResourceMeta(makeScene(), 'connector-1', { name: 'Gate 8' });
    const r = resourceById(next, 'connector-1');
    expect(r?.name).toBe('Gate 8');
    expect(r?.ownerTeamIds).toEqual(['team-sec']);
    expect(r?.tags).toEqual(['gate']);
  });

  it('throws naming an owner team id missing from scene.teams', () => {
    expect(() =>
      updateResourceMeta(makeScene(), 'zone-1', { ownerTeamIds: ['team-ops', 'team-ghost'] }),
    ).toThrow(/team-ghost/);
  });

  it('throws naming an unknown resource id', () => {
    expect(() => updateResourceMeta(makeScene(), 'zone-42', { name: 'x' })).toThrow(/zone-42/);
  });
});

describe('moveWaypoint', () => {
  it('replaces the waypoint snapped to the grid without mutating the move', () => {
    const move = makeMove();
    const snapshot = structuredClone(move);
    const next = moveWaypoint(move, 1, { x: 4.7, z: 0.2 });
    expect(move).toEqual(snapshot);
    expect(next).not.toBe(move);
    expect(next.path).not.toBe(move.path);
    expect(next.path[1]).toEqual({ x: 4.5, z: 0 });
    expect(next.path[0]).toBe(move.path[0]);
    expect(next.path[2]).toBe(move.path[2]);
  });

  it('throws on out-of-bounds or non-integer indices', () => {
    const move = makeMove();
    expect(() => moveWaypoint(move, -1, { x: 0, z: 0 })).toThrow(/-1/);
    expect(() => moveWaypoint(move, 3, { x: 0, z: 0 })).toThrow(/3/);
    expect(() => moveWaypoint(move, 1.5, { x: 0, z: 0 })).toThrow(/1.5/);
  });
});

describe('makeResourceId', () => {
  it('returns the smallest unused kind-numbered id', () => {
    const scene = makeScene(); // has zone-1 and connector-1
    expect(makeResourceId(scene, 'zone')).toBe('zone-2');
    expect(makeResourceId(scene, 'connector')).toBe('connector-2');
  });

  it('skips over gaps until the id is unique', () => {
    let scene = makeScene();
    scene = addResource(scene, {
      id: 'zone-2',
      name: 'z2',
      kind: 'zone',
      rect: { x: 20, z: 0, w: 2, d: 2 },
      ownerTeamIds: [],
    });
    expect(makeResourceId(scene, 'zone')).toBe('zone-3');
    expect(makeResourceId({ ...scene, resources: [] }, 'zone')).toBe('zone-1');
  });
});

describe('duplicateResource', () => {
  it('appends a copy with a generated id, " copy" name, and rect offset by +2/+2', () => {
    const next = expectImmutable((s) => duplicateResource(s, 'zone-1'));
    expect(next.resources).toHaveLength(3);
    const copy = resourceById(next, 'zone-2');
    expect(copy).toBeDefined();
    expect(copy?.name).toBe('Staging copy');
    expect(copy?.kind).toBe('zone');
    expect(copy?.rect).toEqual({ x: 2, z: 2, w: 4, d: 4 });
    expect(copy?.ownerTeamIds).toEqual(['team-ops']);
  });

  it('deep-copies ownerTeamIds and tags so the copy shares no arrays with the source', () => {
    const scene = makeScene();
    const next = duplicateResource(scene, 'connector-1');
    const source = resourceById(next, 'connector-1');
    const copy = resourceById(next, 'connector-2');
    expect(copy?.tags).toEqual(['gate']);
    expect(copy?.tags).not.toBe(source?.tags);
    expect(copy?.ownerTeamIds).not.toBe(source?.ownerTeamIds);
  });

  it('snaps the offset rect to the grid', () => {
    let scene = makeScene();
    scene = addResource(scene, {
      id: 'zone-2',
      name: 'Offgrid',
      kind: 'zone',
      rect: { x: 0.5, z: 0.5, w: 2.5, d: 2 },
      ownerTeamIds: [],
    });
    const next = duplicateResource(scene, 'zone-2');
    expect(resourceById(next, 'zone-3')?.rect).toEqual({ x: 2.5, z: 2.5, w: 2.5, d: 2 });
  });

  it('throws naming an unknown resource id', () => {
    expect(() => duplicateResource(makeScene(), 'zone-77')).toThrow(/zone-77/);
  });
});

describe('snapRectToNeighbors', () => {
  // makeScene neighbors: zone-1 x∈[0,4] z∈[0,4]; connector-1 x∈[6,8] z∈[0,4].
  const bare = (id: string, rect: Rect): Resource => ({
    id,
    name: id,
    kind: 'zone',
    rect,
    ownerTeamIds: [],
  });

  it('snaps the min edge to a nearby neighbor edge and reports a guide', () => {
    const { rect, guides } = snapRectToNeighbors(
      makeScene().resources,
      null,
      { x: 4.3, z: 20, w: 2, d: 2 }, // grid-snaps to x=4.5, then edge 4.5 → 4
    );
    expect(rect).toEqual({ x: 4, z: 20, w: 2, d: 2 });
    expect(guides).toEqual([{ axis: 'x', value: 4 }]);
  });

  it('snaps the max edge too (rect translated, never resized)', () => {
    const { rect, guides } = snapRectToNeighbors(
      makeScene().resources,
      null,
      { x: -2.7, z: 20, w: 2, d: 2 }, // grid-snaps to x=-2.5, max edge -0.5 → 0
    );
    expect(rect).toEqual({ x: -2, z: 20, w: 2, d: 2 });
    expect(guides).toEqual([{ axis: 'x', value: 0 }]);
  });

  it('snaps both axes independently with one guide per axis', () => {
    const { rect, guides } = snapRectToNeighbors(makeScene().resources, null, {
      x: 4.3,
      z: 3.7,
      w: 2,
      d: 2,
    });
    expect(rect).toEqual({ x: 4, z: 4, w: 2, d: 2 });
    expect(guides).toContainEqual({ axis: 'x', value: 4 });
    expect(guides).toContainEqual({ axis: 'z', value: 4 });
    expect(guides).toHaveLength(2);
  });

  it('the nearest candidate wins when several edges are in range', () => {
    const neighbors = [
      bare('a', { x: 0, z: 0, w: 9.75, d: 2 }),
      bare('b', { x: 10, z: 0, w: 5, d: 2 }),
    ];
    const { rect, guides } = snapRectToNeighbors(neighbors, null, { x: 9.5, z: 20, w: 2, d: 2 });
    // min edge 9.5 is 0.25 from a's max edge (9.75) and 0.5 from b's min edge (10).
    expect(rect.x).toBe(9.75);
    expect(guides).toEqual([{ axis: 'x', value: 9.75 }]);
  });

  it('excludes the moving resource from the neighbor set', () => {
    const only = [bare('solo', { x: 0, z: 0, w: 4, d: 4 })];
    const { rect, guides } = snapRectToNeighbors(only, 'solo', { x: 4.3, z: 0, w: 2, d: 2 });
    expect(rect).toEqual({ x: 4.5, z: 0, w: 2, d: 2 }); // grid snap only
    expect(guides).toEqual([]);
  });

  it('null movingId excludes nothing', () => {
    const only = [bare('solo', { x: 0, z: 0, w: 4, d: 4 })];
    const { rect } = snapRectToNeighbors(only, null, { x: 4.3, z: 0, w: 2, d: 2 });
    expect(rect.x).toBe(4);
  });

  it('leaves the rect grid-snapped when no edge is within the threshold', () => {
    const { rect, guides } = snapRectToNeighbors(
      makeScene().resources,
      null,
      { x: 4.3, z: 20, w: 2, d: 2 },
      0.25, // edge 4.5 is 0.5 away from 4 — out of range
    );
    expect(rect).toEqual({ x: 4.5, z: 20, w: 2, d: 2 });
    expect(guides).toEqual([]);
  });

  it('reports an alignment guide when an edge already matches exactly', () => {
    const { rect, guides } = snapRectToNeighbors(makeScene().resources, null, {
      x: 4,
      z: 20,
      w: 2,
      d: 2,
    });
    expect(rect).toEqual({ x: 4, z: 20, w: 2, d: 2 });
    expect(guides).toEqual([{ axis: 'x', value: 4 }]);
  });

  it('does not mutate the input rect or resources', () => {
    const resources = makeScene().resources;
    const snapshot = structuredClone(resources);
    const input: Rect = { x: 4.3, z: 3.7, w: 2, d: 2 };
    snapRectToNeighbors(resources, null, input);
    expect(input).toEqual({ x: 4.3, z: 3.7, w: 2, d: 2 });
    expect(resources).toEqual(snapshot);
  });
});

describe('immutability feeds the scene.ts identity cache', () => {
  // scene.ts memoizes lookups per SceneDef object (WeakMap keyed on identity).
  // Because edits return new objects, the edited scene gets fresh lookup maps
  // instead of the stale cached ones — this test proves the point.
  it('moveResource result yields fresh resourceById/teamById lookups', () => {
    const scene = makeScene();
    // Prime the caches on the original scene object.
    expect(resourceById(scene, 'zone-1')?.rect.x).toBe(0);
    expect(teamById(scene, 'team-ops')?.name).toBe('Operations');

    const next = moveResource(scene, 'zone-1', 3, 1);

    // Fresh lookups on the new scene see the edit...
    expect(resourceById(next, 'zone-1')?.rect).toEqual({ x: 3, z: 1, w: 4, d: 4 });
    expect(teamById(next, 'team-ops')?.name).toBe('Operations');
    // ...while cached lookups on the old scene still see the original geometry.
    expect(resourceById(scene, 'zone-1')?.rect).toEqual({ x: 0, z: 0, w: 4, d: 4 });
  });
});
