import { beforeEach, describe, expect, it } from 'vitest';
import type { Move, SceneDef } from '../domain/types';
import { useVisSim } from './store';

const makeScene = (): SceneDef => ({
  id: 'test-scene',
  name: 'Test scene',
  teams: [
    { id: 'team-a', name: 'Team A', color: '#4f8ef7' },
    { id: 'team-b', name: 'Team B', color: '#2fbfa3' },
  ],
  resources: [
    {
      id: 'zone-1',
      name: 'Zone 1',
      kind: 'zone',
      rect: { x: 0, z: 0, w: 4, d: 4 },
      ownerTeamIds: ['team-b'],
    },
    {
      id: 'conn-1',
      name: 'Connector 1',
      kind: 'connector',
      rect: { x: 6, z: 0, w: 2, d: 6 },
      ownerTeamIds: ['team-a'],
    },
  ],
  authorTeamId: 'team-a',
  dayStart: 480,
  dayEnd: 1200,
});

const makeMove = (overrides: Partial<Move> = {}): Move => ({
  id: 'move-a',
  name: 'Test move',
  actorKind: 'staff',
  count: 2,
  teamId: 'team-a',
  path: [
    { x: 0, z: 0 },
    { x: 10, z: 5 },
  ],
  tStart: 600,
  tEnd: 660,
  ...overrides,
});

const draftInput: Omit<Move, 'id' | 'path'> = {
  name: 'Drafted move',
  actorKind: 'vehicle',
  count: 1,
  teamId: 'team-b',
  tStart: 700,
  tEnd: 760,
};

beforeEach(() => {
  // Reset only the fields these tests exercise; the store may carry other
  // fields (added by parallel work) that we deliberately leave untouched.
  useVisSim.setState({
    scene: makeScene(),
    moves: [makeMove()],
    mode: 'select',
    draftPath: [],
    revision: 1,
    approvals: {},
    published: false,
    selectedMoveId: null,
    selectedResourceId: null,
    pendingAdd: null,
  });
});

describe('retimeMove', () => {
  it('updates the move window and bumps revision', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);

    const s = useVisSim.getState();
    const move = s.moves.find((m) => m.id === 'move-a');
    expect(move?.tStart).toBe(610);
    expect(move?.tEnd).toBe(670);
    expect(s.revision).toBe(2);
  });

  it('clears approvals and published (approvals attach to a revision)', () => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    useVisSim.getState().retimeMove('move-a', 610, 670);

    const s = useVisSim.getState();
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('deleteMove', () => {
  it('removes the move, bumps revision, and clears approvals/published', () => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    useVisSim.getState().deleteMove('move-a');

    const s = useVisSim.getState();
    expect(s.moves.some((m) => m.id === 'move-a')).toBe(false);
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });

  it('clears selectedMoveId when it pointed at the deleted move', () => {
    useVisSim.setState({ selectedMoveId: 'move-a' });

    useVisSim.getState().deleteMove('move-a');

    expect(useVisSim.getState().selectedMoveId).toBeNull();
  });

  it('leaves selectedMoveId alone when a different move is selected', () => {
    useVisSim.setState({
      moves: [makeMove(), makeMove({ id: 'move-b' })],
      selectedMoveId: 'move-b',
    });

    useVisSim.getState().deleteMove('move-a');

    expect(useVisSim.getState().selectedMoveId).toBe('move-b');
  });
});

describe('createMoveFromDraft', () => {
  it('is a no-op when the draft has fewer than 2 points', () => {
    useVisSim.setState({ mode: 'draw', draftPath: [{ x: 1, z: 1 }] });

    useVisSim.getState().createMoveFromDraft(draftInput);

    const s = useVisSim.getState();
    expect(s.moves).toHaveLength(1);
    expect(s.revision).toBe(1);
    expect(s.mode).toBe('draw');
    expect(s.draftPath).toEqual([{ x: 1, z: 1 }]);
  });

  it('appends a move carrying the draft path when the draft has 2+ points', () => {
    const draft = [
      { x: 1, z: 1 },
      { x: 2, z: 3 },
      { x: 4, z: 4 },
    ];
    useVisSim.setState({ mode: 'draw', draftPath: draft });

    useVisSim.getState().createMoveFromDraft(draftInput);

    const s = useVisSim.getState();
    expect(s.moves).toHaveLength(2);
    const created = s.moves[s.moves.length - 1];
    expect(created.path).toEqual(draft);
    expect(created.name).toBe(draftInput.name);
    expect(created.teamId).toBe(draftInput.teamId);
    expect(created.tStart).toBe(draftInput.tStart);
    expect(created.tEnd).toBe(draftInput.tEnd);
    expect(created.id).toBeTruthy();
  });

  it('clears the draft, returns to select mode, and bumps revision', () => {
    useVisSim.setState({
      mode: 'draw',
      draftPath: [
        { x: 1, z: 1 },
        { x: 2, z: 3 },
      ],
      approvals: { 'team-b': 'approved' },
      published: true,
    });

    useVisSim.getState().createMoveFromDraft(draftInput);

    const s = useVisSim.getState();
    expect(s.draftPath).toEqual([]);
    expect(s.mode).toBe('select');
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('approve / publish lifecycle', () => {
  it('approve records only the given team', () => {
    useVisSim.getState().approve('team-b');

    expect(useVisSim.getState().approvals).toEqual({ 'team-b': 'approved' });
  });

  it('publish sets published', () => {
    useVisSim.getState().publish();

    expect(useVisSim.getState().published).toBe(true);
  });

  it('a subsequent edit resets approvals and published', () => {
    useVisSim.getState().approve('team-b');
    useVisSim.getState().publish();

    useVisSim.getState().retimeMove('move-a', 615, 675);

    const s = useVisSim.getState();
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('setMode', () => {
  it("setMode('draw') clears any existing draftPath", () => {
    useVisSim.setState({
      draftPath: [
        { x: 5, z: 5 },
        { x: 6, z: 6 },
      ],
    });

    useVisSim.getState().setMode('draw');

    const s = useVisSim.getState();
    expect(s.mode).toBe('draw');
    expect(s.draftPath).toEqual([]);
  });

  it("entering 'scene' clears selectedResourceId and pendingAdd", () => {
    useVisSim.setState({ selectedResourceId: 'zone-1', pendingAdd: 'zone' });

    useVisSim.getState().setMode('scene');

    const s = useVisSim.getState();
    expect(s.mode).toBe('scene');
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
  });

  it("leaving 'scene' clears selectedResourceId and pendingAdd", () => {
    useVisSim.setState({ mode: 'scene', selectedResourceId: 'conn-1', pendingAdd: 'connector' });

    useVisSim.getState().setMode('select');

    const s = useVisSim.getState();
    expect(s.mode).toBe('select');
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
  });
});

describe('selectResource / setPendingAdd', () => {
  it('selectResource sets and clears the selection without touching the plan', () => {
    useVisSim.getState().selectResource('zone-1');
    expect(useVisSim.getState().selectedResourceId).toBe('zone-1');

    useVisSim.getState().selectResource(null);

    const s = useVisSim.getState();
    expect(s.selectedResourceId).toBeNull();
    expect(s.revision).toBe(1);
  });

  it('setPendingAdd arms and disarms a draw tool without touching the plan', () => {
    useVisSim.getState().setPendingAdd('connector');
    expect(useVisSim.getState().pendingAdd).toBe('connector');

    useVisSim.getState().setPendingAdd(null);

    const s = useVisSim.getState();
    expect(s.pendingAdd).toBeNull();
    expect(s.revision).toBe(1);
  });
});

describe('scene edits invalidate approvals (US-8)', () => {
  const actions: Array<[string, () => void]> = [
    ['moveResourceBy', () => useVisSim.getState().moveResourceBy('zone-1', 1, 1)],
    [
      'resizeResourceTo',
      () => useVisSim.getState().resizeResourceTo('zone-1', { x: 0, z: 0, w: 6, d: 6 }),
    ],
    ['updateResourceMeta', () => useVisSim.getState().updateResourceMeta('zone-1', { name: 'X' })],
    [
      'addResourceAt',
      () => useVisSim.getState().addResourceAt('zone', { x: 10, z: 10, w: 2, d: 2 }),
    ],
    ['removeResource', () => useVisSim.getState().removeResource('zone-1')],
    ['moveMoveWaypoint', () => useVisSim.getState().moveMoveWaypoint('move-a', 0, { x: 1, z: 1 })],
  ];

  it.each(actions)('%s bumps revision and clears approvals/published', (_name, act) => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    act();

    const s = useVisSim.getState();
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('moveResourceBy', () => {
  it('translates the rect in the scene and replaces the scene object', () => {
    const before = useVisSim.getState().scene;

    useVisSim.getState().moveResourceBy('zone-1', 1.5, -0.5);

    const s = useVisSim.getState();
    expect(s.scene).not.toBe(before);
    const rect = s.scene.resources.find((r) => r.id === 'zone-1')?.rect;
    expect(rect).toEqual({ x: 1.5, z: -0.5, w: 4, d: 4 });
    // The original scene object is untouched (mutators return new scenes).
    expect(before.resources.find((r) => r.id === 'zone-1')?.rect).toEqual({
      x: 0,
      z: 0,
      w: 4,
      d: 4,
    });
  });

  it('snaps off-grid deltas to the 0.5 grid', () => {
    useVisSim.getState().moveResourceBy('zone-1', 1.3, 0.1);

    const rect = useVisSim.getState().scene.resources.find((r) => r.id === 'zone-1')?.rect;
    expect((rect!.x * 2) % 1).toBe(0);
    expect((rect!.z * 2) % 1).toBe(0);
  });
});

describe('resizeResourceTo', () => {
  it('applies the new rect snapped to the grid', () => {
    useVisSim.getState().resizeResourceTo('conn-1', { x: 6, z: 0, w: 3.5, d: 8 });

    const rect = useVisSim.getState().scene.resources.find((r) => r.id === 'conn-1')?.rect;
    expect(rect).toEqual({ x: 6, z: 0, w: 3.5, d: 8 });
  });
});

describe('updateResourceMeta', () => {
  it('updates name, owner teams, and tags on the scene resource', () => {
    useVisSim.getState().updateResourceMeta('zone-1', {
      name: 'Staging',
      ownerTeamIds: ['team-a', 'team-b'],
      tags: ['clean'],
    });

    const res = useVisSim.getState().scene.resources.find((r) => r.id === 'zone-1');
    expect(res?.name).toBe('Staging');
    expect(res?.ownerTeamIds).toEqual(['team-a', 'team-b']);
    expect(res?.tags).toEqual(['clean']);
  });
});

describe('addResourceAt', () => {
  it('creates a resource owned by the author team, selects it, and clears pendingAdd', () => {
    useVisSim.setState({ mode: 'scene', pendingAdd: 'zone' });

    useVisSim.getState().addResourceAt('zone', { x: 10, z: 10, w: 3, d: 2 });

    const s = useVisSim.getState();
    expect(s.scene.resources).toHaveLength(3);
    const created = s.scene.resources.find((r) => r.id !== 'zone-1' && r.id !== 'conn-1');
    expect(created).toBeDefined();
    expect(created?.kind).toBe('zone');
    expect(created?.name).toBe('New zone');
    expect(created?.ownerTeamIds).toEqual(['team-a']);
    expect(created?.rect).toEqual({ x: 10, z: 10, w: 3, d: 2 });
    expect(s.selectedResourceId).toBe(created?.id);
    expect(s.pendingAdd).toBeNull();
  });

  it('generates unique ids across consecutive adds', () => {
    useVisSim.getState().addResourceAt('connector', { x: 10, z: 0, w: 1, d: 4 });
    useVisSim.getState().addResourceAt('connector', { x: 12, z: 0, w: 1, d: 4 });

    const ids = useVisSim.getState().scene.resources.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const created = useVisSim
      .getState()
      .scene.resources.filter((r) => r.id !== 'zone-1' && r.id !== 'conn-1');
    expect(created).toHaveLength(2);
    expect(created[1].name).toBe('New connector');
  });
});

describe('removeResource', () => {
  it('removes the resource and clears a matching selection', () => {
    useVisSim.setState({ selectedResourceId: 'zone-1' });

    useVisSim.getState().removeResource('zone-1');

    const s = useVisSim.getState();
    expect(s.scene.resources.some((r) => r.id === 'zone-1')).toBe(false);
    expect(s.selectedResourceId).toBeNull();
  });

  it('leaves a non-matching selection alone', () => {
    useVisSim.setState({ selectedResourceId: 'conn-1' });

    useVisSim.getState().removeResource('zone-1');

    expect(useVisSim.getState().selectedResourceId).toBe('conn-1');
  });
});

describe('moveMoveWaypoint', () => {
  it('updates the waypoint snapped to the grid and leaves other points intact', () => {
    useVisSim.getState().moveMoveWaypoint('move-a', 1, { x: 3.5, z: 1 });

    const move = useVisSim.getState().moves.find((m) => m.id === 'move-a');
    expect(move?.path[0]).toEqual({ x: 0, z: 0 });
    expect(move?.path[1]).toEqual({ x: 3.5, z: 1 });
  });

  it('snaps off-grid input to the 0.5 grid', () => {
    useVisSim.getState().moveMoveWaypoint('move-a', 0, { x: 1.3, z: 2.1 });

    const p = useVisSim.getState().moves.find((m) => m.id === 'move-a')?.path[0];
    expect((p!.x * 2) % 1).toBe(0);
    expect((p!.z * 2) % 1).toBe(0);
  });
});

describe('scene edit actions swallow invalid ids (drag can race a deletion)', () => {
  const invalidCalls: Array<[string, () => void]> = [
    ['moveResourceBy', () => useVisSim.getState().moveResourceBy('nope', 1, 1)],
    [
      'resizeResourceTo',
      () => useVisSim.getState().resizeResourceTo('nope', { x: 0, z: 0, w: 1, d: 1 }),
    ],
    ['updateResourceMeta', () => useVisSim.getState().updateResourceMeta('nope', { name: 'X' })],
    ['removeResource', () => useVisSim.getState().removeResource('nope')],
    [
      'moveMoveWaypoint (bad move)',
      () => useVisSim.getState().moveMoveWaypoint('nope', 0, { x: 1, z: 1 }),
    ],
    [
      'moveMoveWaypoint (bad index)',
      () => useVisSim.getState().moveMoveWaypoint('move-a', 99, { x: 1, z: 1 }),
    ],
  ];

  it.each(invalidCalls)('%s is a no-op that corrupts nothing', (_name, act) => {
    const before = useVisSim.getState();

    expect(act).not.toThrow();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.moves).toEqual(before.moves);
    expect(s.revision).toBe(1);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('setScene resets scene-edit state', () => {
  it('clears selectedResourceId and pendingAdd when switching scenes', () => {
    useVisSim.setState({ mode: 'scene', selectedResourceId: 'zone-1', pendingAdd: 'zone' });

    useVisSim.getState().setScene('stadium-slice');

    const s = useVisSim.getState();
    expect(s.scene.id).toBe('stadium-slice');
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
    expect(s.mode).toBe('select');
  });
});
