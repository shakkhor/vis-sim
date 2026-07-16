import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Move, Rule, SceneDef } from '../domain/types';
import { SCENES, sceneEntryById } from '../domain/scenes';
import { listPersistedCustomScenes, nextLeftRail, useVisSim } from './store';

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
  blocks: [
    { id: 'block-1', kind: 'wall', rect: { x: 0, z: 8, w: 6, d: 0.5 }, height: 3 },
    { id: 'block-2', kind: 'box', rect: { x: 10, z: 8, w: 2, d: 2 }, height: 2, color: '#333333' },
  ],
});

const makeRule = (id: string): Rule => ({
  id,
  description: `Rule ${id}`,
  kind: 'forbidden-entry',
  actorKinds: ['vehicle'],
  resourceTags: ['clean'],
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
  // newScene() clears the module-level undo/redo stacks (and mirrors
  // canUndo/canRedo to false) so history never leaks across tests.
  useVisSim.getState().newScene();
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
    selectedBlockId: null,
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

  it('is a no-op for an unknown scene id (no registry entry, nothing persisted)', () => {
    const before = useVisSim.getState();

    useVisSim.getState().setScene('no-such-scene');

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.moves).toBe(before.moves);
  });

  it('clears undo history (canUndo/canRedo false, undo is a no-op)', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    expect(useVisSim.getState().canUndo).toBe(true);

    useVisSim.getState().setScene('stadium-slice');

    const s = useVisSim.getState();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    const scene = s.scene;
    useVisSim.getState().undo();
    expect(useVisSim.getState().scene).toBe(scene);
  });
});

describe('undo / redo', () => {
  it('undo restores scene, moves, revision, and approvals across an edit sequence', () => {
    // edit -> approve -> edit -> undo: the undo lands on the approved rev-2 state.
    useVisSim.getState().retimeMove('move-a', 610, 670); // revision 2
    useVisSim.getState().approve('team-b'); // no history entry
    useVisSim.getState().moveResourceBy('zone-1', 2, 2); // revision 3, clears approvals

    useVisSim.getState().undo();

    const s = useVisSim.getState();
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({ 'team-b': 'approved' });
    // Scene is back to its pre-move geometry...
    expect(s.scene.resources.find((r) => r.id === 'zone-1')?.rect).toEqual({
      x: 0,
      z: 0,
      w: 4,
      d: 4,
    });
    // ...while the retime (the earlier edit) is still applied.
    const move = s.moves.find((m) => m.id === 'move-a');
    expect(move?.tStart).toBe(610);
    expect(move?.tEnd).toBe(670);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(true);
  });

  it('redo re-applies the undone edit', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().approve('team-b');
    useVisSim.getState().moveResourceBy('zone-1', 2, 2);
    useVisSim.getState().undo();

    useVisSim.getState().redo();

    const s = useVisSim.getState();
    expect(s.revision).toBe(3);
    expect(s.approvals).toEqual({});
    expect(s.scene.resources.find((r) => r.id === 'zone-1')?.rect).toEqual({
      x: 2,
      z: 2,
      w: 4,
      d: 4,
    });
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
  });

  it('a new edit after undo clears the redo stack', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().undo();
    expect(useVisSim.getState().canRedo).toBe(true);

    useVisSim.getState().retimeMove('move-a', 615, 675);

    const s = useVisSim.getState();
    expect(s.canRedo).toBe(false);
    const before = useVisSim.getState();
    useVisSim.getState().redo(); // no-op: nothing to redo
    expect(useVisSim.getState().moves).toBe(before.moves);
    expect(useVisSim.getState().revision).toBe(before.revision);
  });

  it('caps history at 50: 60 edits allow exactly 50 undos', () => {
    for (let i = 0; i < 60; i++) {
      useVisSim.getState().retimeMove('move-a', 600 + i, 700 + i);
    }
    expect(useVisSim.getState().revision).toBe(61);

    let undos = 0;
    while (useVisSim.getState().canUndo) {
      useVisSim.getState().undo();
      undos++;
      expect(undos).toBeLessThanOrEqual(50);
    }

    expect(undos).toBe(50);
    // Landed on the oldest retained snapshot (the state after the 10th edit,
    // i.e. pre-edit 11) — not the initial state, which fell off the cap.
    const s = useVisSim.getState();
    expect(s.revision).toBe(11);
    expect(s.moves.find((m) => m.id === 'move-a')?.tStart).toBe(609);
    // A further undo is a no-op.
    useVisSim.getState().undo();
    expect(useVisSim.getState().revision).toBe(11);
  });

  it('canUndo/canRedo mirror the stack states through a full cycle', () => {
    let s = useVisSim.getState();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);

    useVisSim.getState().retimeMove('move-a', 610, 670);
    s = useVisSim.getState();
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);

    useVisSim.getState().undo();
    s = useVisSim.getState();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);

    useVisSim.getState().redo();
    s = useVisSim.getState();
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
  });

  it('undo does not restore playhead, mode, or selection (UI state is not history)', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.setState({ playhead: 900, mode: 'draw', selectedMoveId: 'move-a' });

    useVisSim.getState().undo();

    const s = useVisSim.getState();
    expect(s.playhead).toBe(900);
    expect(s.mode).toBe('draw');
    expect(s.selectedMoveId).toBe('move-a');
  });

  it('no-op mutations (invalid ids) record no history', () => {
    useVisSim.getState().moveResourceBy('nope', 1, 1);
    useVisSim.getState().moveMoveWaypoint('nope', 0, { x: 1, z: 1 });

    expect(useVisSim.getState().canUndo).toBe(false);
  });
});

describe('duplicateSelectedResource', () => {
  it('appends a copy, selects it, bumps revision, and invalidates approvals', () => {
    useVisSim.setState({
      selectedResourceId: 'zone-1',
      approvals: { 'team-b': 'approved' },
      published: true,
    });

    useVisSim.getState().duplicateSelectedResource();

    const s = useVisSim.getState();
    expect(s.scene.resources).toHaveLength(3);
    const copy = s.scene.resources[s.scene.resources.length - 1];
    expect(copy.id).not.toBe('zone-1');
    expect(copy.name).toBe('Zone 1 copy');
    expect(copy.kind).toBe('zone');
    expect(s.selectedResourceId).toBe(copy.id);
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
    expect(s.canUndo).toBe(true);
  });

  it('is a no-op when nothing is selected', () => {
    const before = useVisSim.getState();
    expect(before.selectedResourceId).toBeNull();

    useVisSim.getState().duplicateSelectedResource();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it('is a no-op when the selection points at a deleted resource', () => {
    useVisSim.setState({ selectedResourceId: 'nope' });
    const before = useVisSim.getState();

    expect(() => useVisSim.getState().duplicateSelectedResource()).not.toThrow();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it('undo removes the copy again', () => {
    useVisSim.setState({ selectedResourceId: 'zone-1' });
    useVisSim.getState().duplicateSelectedResource();
    expect(useVisSim.getState().scene.resources).toHaveLength(3);

    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.resources).toHaveLength(2);
  });
});

describe('newScene', () => {
  it('resets the plan lifecycle and enters scene-edit mode on a blank scene', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().approve('team-b');
    useVisSim.getState().publish();

    useVisSim.getState().newScene();

    const s = useVisSim.getState();
    expect(s.revision).toBe(1);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
    expect(s.mode).toBe('scene');
    expect(s.moves).toEqual([]);
    expect(s.scene.resources).toEqual([]);
    expect(s.scene.teams.length).toBeGreaterThan(0);
    expect(s.planName).toBe('New plan');
    expect(s.selectedMoveId).toBeNull();
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
  });

  it('clears undo/redo history', () => {
    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().undo();
    expect(useVisSim.getState().canRedo).toBe(true);

    useVisSim.getState().newScene();

    const s = useVisSim.getState();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    const scene = s.scene;
    useVisSim.getState().undo();
    useVisSim.getState().redo();
    expect(useVisSim.getState().scene).toBe(scene);
  });
});

describe('resetSceneToDefault', () => {
  it('restores registry defaults for a registry scene after edits', () => {
    useVisSim.getState().setScene('stadium-slice');
    const entry = sceneEntryById('stadium-slice')!;
    useVisSim.getState().addResourceAt('zone', { x: 0, z: 0, w: 2, d: 2 });
    expect(useVisSim.getState().scene.resources).toHaveLength(entry.scene.resources.length + 1);

    useVisSim.getState().resetSceneToDefault();

    const s = useVisSim.getState();
    expect(s.scene).toBe(entry.scene);
    expect(s.moves).toBe(entry.initialMoves);
    expect(s.planName).toBe(entry.planName);
    expect(s.revision).toBe(1);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
    expect(s.mode).toBe('select');
    expect(s.playhead).toBe(entry.scene.dayStart + 60);
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });

  it('resets a custom scene to the blank template under the same id and name', () => {
    // beforeEach put us on the non-registry 'test-scene'.
    useVisSim.getState().addResourceAt('zone', { x: 20, z: 20, w: 2, d: 2 });

    useVisSim.getState().resetSceneToDefault();

    const s = useVisSim.getState();
    expect(s.scene.id).toBe('test-scene');
    expect(s.scene.name).toBe('Test scene');
    expect(s.scene.resources).toEqual([]);
    expect(s.moves).toEqual([]);
    expect(s.revision).toBe(1);
    expect(s.mode).toBe('scene');
    expect(s.canUndo).toBe(false);
  });
});

describe('renameActiveScene', () => {
  it('renames the scene, bumps revision, and clears approvals/published', () => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    useVisSim.getState().renameActiveScene('GMP floor 2');

    const s = useVisSim.getState();
    expect(s.scene.name).toBe('GMP floor 2');
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
    expect(s.canUndo).toBe(true);
  });

  it('undo restores the previous name', () => {
    useVisSim.getState().renameActiveScene('GMP floor 2');

    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.name).toBe('Test scene');
  });
});

describe('team editing actions', () => {
  const team = { id: 'team-c', name: 'Team C', color: '#aa3355' };

  it('addTeamToScene appends the team, bumps revision, and invalidates approvals', () => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    useVisSim.getState().addTeamToScene(team);

    const s = useVisSim.getState();
    expect(s.scene.teams.map((t) => t.id)).toEqual(['team-a', 'team-b', 'team-c']);
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });

  it('addTeamToScene swallows duplicate ids as a no-op', () => {
    const before = useVisSim.getState();

    expect(() =>
      useVisSim.getState().addTeamToScene({ id: 'team-a', name: 'Dup', color: '#000000' }),
    ).not.toThrow();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it('updateTeamInScene renames/recolors the team and bumps revision', () => {
    useVisSim.getState().updateTeamInScene('team-b', { name: 'Partners', color: '#123456' });

    const s = useVisSim.getState();
    const t = s.scene.teams.find((x) => x.id === 'team-b');
    expect(t?.name).toBe('Partners');
    expect(t?.color).toBe('#123456');
    expect(s.revision).toBe(2);
  });

  it('updateTeamInScene swallows unknown ids as a no-op', () => {
    const before = useVisSim.getState();

    useVisSim.getState().updateTeamInScene('nope', { name: 'X' });

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it('removeTeamFromScene removes a removable team and is undoable', () => {
    useVisSim.getState().addTeamToScene(team);

    useVisSim.getState().removeTeamFromScene('team-c');

    const s = useVisSim.getState();
    expect(s.scene.teams.some((t) => t.id === 'team-c')).toBe(false);
    expect(s.revision).toBe(3);

    useVisSim.getState().undo();
    expect(useVisSim.getState().scene.teams.some((t) => t.id === 'team-c')).toBe(true);
  });

  it.each([
    ['the authoring team', 'team-a'],
    ['a sole resource owner', 'team-b'],
    ['an executing team', 'team-a'],
    ['an unknown id', 'nope'],
  ])('removeTeamFromScene swallows %s as a no-op', (_why, id) => {
    const before = useVisSim.getState();

    expect(() => useVisSim.getState().removeTeamFromScene(id)).not.toThrow();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });
});

describe('deleteCustomScene', () => {
  const stubStorage = () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
    return storage;
  };

  it('is a no-op for registry scene ids', () => {
    const before = useVisSim.getState();

    useVisSim.getState().deleteCustomScene(SCENES[0].scene.id);

    expect(useVisSim.getState().scene).toBe(before.scene);
  });

  it('switches to the default scene when the active custom scene is deleted', () => {
    expect(sceneEntryById('test-scene')).toBeUndefined();

    useVisSim.getState().deleteCustomScene('test-scene');

    expect(useVisSim.getState().scene.id).toBe(SCENES[0].scene.id);
  });

  it('removes the persisted entry and custom-scenes index row', () => {
    const storage = stubStorage();
    try {
      // Persist the active custom scene via a plan edit.
      useVisSim.getState().moveResourceBy('zone-1', 1, 1);
      expect(storage.has('vissim:scene:test-scene')).toBe(true);
      expect(listPersistedCustomScenes()).toEqual([{ id: 'test-scene', name: 'Test scene' }]);

      useVisSim.getState().deleteCustomScene('test-scene');

      expect(storage.has('vissim:scene:test-scene')).toBe(false);
      expect(listPersistedCustomScenes()).toEqual([]);
      expect(useVisSim.getState().scene.id).toBe(SCENES[0].scene.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves the active scene alone when deleting a different custom scene', () => {
    const storage = stubStorage();
    try {
      storage.set(
        'vissim:scene:other-custom',
        JSON.stringify({ scene: { ...makeScene(), id: 'other-custom' }, moves: [], planName: 'x' }),
      );
      storage.set('vissim:custom-scenes', JSON.stringify([{ id: 'other-custom', name: 'Other' }]));

      useVisSim.getState().deleteCustomScene('other-custom');

      expect(useVisSim.getState().scene.id).toBe('test-scene');
      expect(storage.has('vissim:scene:other-custom')).toBe(false);
      expect(listPersistedCustomScenes()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('persistence is safe without localStorage (node env)', () => {
  it('listPersistedCustomScenes returns an empty list', () => {
    expect(listPersistedCustomScenes()).toEqual([]);
  });

  it('every persisting action runs without throwing', () => {
    const run = () => {
      useVisSim.getState().retimeMove('move-a', 610, 670);
      useVisSim.getState().moveResourceBy('zone-1', 1, 1);
      useVisSim.getState().duplicateSelectedResource();
      useVisSim.getState().undo();
      useVisSim.getState().redo();
      useVisSim.getState().newScene();
      useVisSim.getState().resetSceneToDefault();
      useVisSim.getState().setScene('stadium-slice');
      useVisSim.getState().loadMoves([makeMove()]);
    };

    expect(run).not.toThrow();
  });
});

describe('toggleMode', () => {
  it('activates a different mode like setMode', () => {
    useVisSim.getState().toggleMode('draw');

    expect(useVisSim.getState().mode).toBe('draw');
  });

  it('returns to select when the active mode is toggled again', () => {
    useVisSim.getState().toggleMode('scene');
    expect(useVisSim.getState().mode).toBe('scene');

    useVisSim.getState().toggleMode('scene');

    expect(useVisSim.getState().mode).toBe('select');
  });

  it("toggling 'select' while in select stays in select", () => {
    useVisSim.getState().toggleMode('select');

    expect(useVisSim.getState().mode).toBe('select');
  });

  it('keeps setMode cleanup semantics: leaving scene clears scene-edit state', () => {
    useVisSim.setState({ mode: 'scene', selectedResourceId: 'zone-1', pendingAdd: 'zone' });

    useVisSim.getState().toggleMode('scene'); // active → back to select

    const s = useVisSim.getState();
    expect(s.mode).toBe('select');
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
  });

  it('keeps setMode cleanup semantics: entering draw clears the draft path', () => {
    useVisSim.setState({
      draftPath: [
        { x: 1, z: 1 },
        { x: 2, z: 2 },
      ],
    });

    useVisSim.getState().toggleMode('draw');

    const s = useVisSim.getState();
    expect(s.mode).toBe('draw');
    expect(s.draftPath).toEqual([]);
  });

  it('records no undo history and never touches the plan', () => {
    useVisSim.getState().toggleMode('draw');
    useVisSim.getState().toggleMode('draw');

    const s = useVisSim.getState();
    expect(s.canUndo).toBe(false);
    expect(s.revision).toBe(1);
  });
});

describe('ui slice (panel chrome)', () => {
  it('setUi merges partials without touching plan state or history', () => {
    useVisSim.getState().setUi({ leftRail: 'expanded', rightOpen: true, bottomOpen: true });

    useVisSim.getState().setUi({ rightOpen: false });

    const s = useVisSim.getState();
    expect(s.ui).toEqual({ leftRail: 'expanded', rightOpen: false, bottomOpen: true });
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
    expect(s.approvals).toEqual({});
  });

  it('persisting ui does not throw without localStorage (node env)', () => {
    const run = () => {
      useVisSim.getState().setUi({ leftRail: 'slim' });
      useVisSim.getState().setUi({ leftRail: 'hidden', bottomOpen: false });
      useVisSim.getState().setUi({ leftRail: 'expanded', rightOpen: true, bottomOpen: true });
    };

    expect(run).not.toThrow();
  });

  it('ui survives plan edits, undo/redo, and scene switches', () => {
    useVisSim.getState().setUi({ leftRail: 'slim', rightOpen: false, bottomOpen: false });

    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().undo();
    useVisSim.getState().redo();
    useVisSim.getState().setScene('stadium-slice');

    expect(useVisSim.getState().ui).toEqual({
      leftRail: 'slim',
      rightOpen: false,
      bottomOpen: false,
    });

    useVisSim.getState().setUi({ leftRail: 'expanded', rightOpen: true, bottomOpen: true });
  });

  it('nextLeftRail cycles expanded → slim → hidden → expanded', () => {
    expect(nextLeftRail('expanded')).toBe('slim');
    expect(nextLeftRail('slim')).toBe('hidden');
    expect(nextLeftRail('hidden')).toBe('expanded');
  });
});

describe('setFocusTeam ("view as team" focus)', () => {
  it('sets and clears the focused team', () => {
    useVisSim.getState().setFocusTeam('team-b');
    expect(useVisSim.getState().focusTeamId).toBe('team-b');

    useVisSim.getState().setFocusTeam(null);

    expect(useVisSim.getState().focusTeamId).toBeNull();
  });

  it('never touches revision, approvals, published, or undo history', () => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    useVisSim.getState().setFocusTeam('team-b');
    useVisSim.getState().setFocusTeam(null);

    const s = useVisSim.getState();
    expect(s.revision).toBe(1);
    expect(s.approvals).toEqual({ 'team-b': 'approved' });
    expect(s.published).toBe(true);
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });

  it('is cleared when switching scenes', () => {
    useVisSim.getState().setFocusTeam('team-b');

    useVisSim.getState().setScene('stadium-slice');

    expect(useVisSim.getState().focusTeamId).toBeNull();
  });

  it('is cleared by newScene', () => {
    useVisSim.getState().setFocusTeam('team-b');

    useVisSim.getState().newScene();

    expect(useVisSim.getState().focusTeamId).toBeNull();
  });

  it('survives plan edits and undo (pure view state, outside history)', () => {
    useVisSim.getState().setFocusTeam('team-b');

    useVisSim.getState().retimeMove('move-a', 610, 670);
    useVisSim.getState().undo();

    expect(useVisSim.getState().focusTeamId).toBe('team-b');
  });
});

describe('selectBlock / selection mutual exclusivity', () => {
  it('selectBlock sets the block selection and clears the resource selection', () => {
    useVisSim.setState({ selectedResourceId: 'zone-1' });

    useVisSim.getState().selectBlock('block-1');

    const s = useVisSim.getState();
    expect(s.selectedBlockId).toBe('block-1');
    expect(s.selectedResourceId).toBeNull();
    expect(s.revision).toBe(1);
  });

  it('selectResource clears the block selection', () => {
    useVisSim.setState({ selectedBlockId: 'block-1' });

    useVisSim.getState().selectResource('zone-1');

    const s = useVisSim.getState();
    expect(s.selectedResourceId).toBe('zone-1');
    expect(s.selectedBlockId).toBeNull();
  });

  it('selectBlock(null) clears the block selection without touching the plan', () => {
    useVisSim.getState().selectBlock('block-1');

    useVisSim.getState().selectBlock(null);

    const s = useVisSim.getState();
    expect(s.selectedBlockId).toBeNull();
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it('mode changes and newScene clear the block selection', () => {
    useVisSim.setState({ mode: 'scene', selectedBlockId: 'block-1' });
    useVisSim.getState().setMode('select');
    expect(useVisSim.getState().selectedBlockId).toBeNull();

    useVisSim.setState({ mode: 'scene', selectedBlockId: 'block-1' });
    useVisSim.getState().newScene();
    expect(useVisSim.getState().selectedBlockId).toBeNull();
  });

  it('setScene clears the block selection', () => {
    useVisSim.setState({ selectedBlockId: 'block-1' });

    useVisSim.getState().setScene('stadium-slice');

    expect(useVisSim.getState().selectedBlockId).toBeNull();
  });
});

describe('addBlockAt', () => {
  it('creates a wall with defaults, selects it, and clears pendingAdd', () => {
    useVisSim.setState({ mode: 'scene', pendingAdd: 'wall', selectedResourceId: 'zone-1' });

    useVisSim.getState().addBlockAt('wall', { x: 2, z: 2, w: 4, d: 0.5 });

    const s = useVisSim.getState();
    expect(s.scene.blocks).toHaveLength(3);
    const created = s.scene.blocks!.find((b) => b.id !== 'block-1' && b.id !== 'block-2');
    expect(created).toBeDefined();
    expect(created?.kind).toBe('wall');
    expect(created?.height).toBe(3.5);
    expect(created?.color).toBe('#8892aa');
    expect(created?.rect).toEqual({ x: 2, z: 2, w: 4, d: 0.5 });
    expect(s.selectedBlockId).toBe(created?.id);
    expect(s.selectedResourceId).toBeNull();
    expect(s.pendingAdd).toBeNull();
    expect(s.revision).toBe(2);
  });

  it('creates a box with box defaults (height 2, box color)', () => {
    useVisSim.getState().addBlockAt('box', { x: 14, z: 2, w: 2, d: 2 });

    const created = useVisSim
      .getState()
      .scene.blocks!.find((b) => b.id !== 'block-1' && b.id !== 'block-2');
    expect(created?.kind).toBe('box');
    expect(created?.height).toBe(2);
    expect(created?.color).toBe('#46506e');
  });

  it('generates unique ids across consecutive adds', () => {
    useVisSim.getState().addBlockAt('wall', { x: 2, z: 2, w: 4, d: 0.5 });
    useVisSim.getState().addBlockAt('wall', { x: 2, z: 4, w: 4, d: 0.5 });

    const ids = useVisSim.getState().scene.blocks!.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
  });

  it('undo removes the added block again', () => {
    useVisSim.getState().addBlockAt('box', { x: 14, z: 2, w: 2, d: 2 });
    expect(useVisSim.getState().scene.blocks).toHaveLength(3);

    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.blocks).toHaveLength(2);
  });
});

describe('moveBlockBy / resizeBlockTo / updateBlockMeta', () => {
  it('moveBlockBy translates the footprint and replaces the scene object', () => {
    const before = useVisSim.getState().scene;

    useVisSim.getState().moveBlockBy('block-1', 2, 1);

    const s = useVisSim.getState();
    expect(s.scene).not.toBe(before);
    expect(s.scene.blocks!.find((b) => b.id === 'block-1')?.rect).toEqual({
      x: 2,
      z: 9,
      w: 6,
      d: 0.5,
    });
    // The original scene object is untouched (mutators return new scenes).
    expect(before.blocks!.find((b) => b.id === 'block-1')?.rect).toEqual({
      x: 0,
      z: 8,
      w: 6,
      d: 0.5,
    });
  });

  it('resizeBlockTo applies the new rect', () => {
    useVisSim.getState().resizeBlockTo('block-2', { x: 10, z: 8, w: 3, d: 4 });

    expect(useVisSim.getState().scene.blocks!.find((b) => b.id === 'block-2')?.rect).toEqual({
      x: 10,
      z: 8,
      w: 3,
      d: 4,
    });
  });

  it('updateBlockMeta updates kind, height, elevation, and color', () => {
    useVisSim
      .getState()
      .updateBlockMeta('block-2', { kind: 'slab', height: 0.5, y: 3, color: '#ffffff' });

    const b = useVisSim.getState().scene.blocks!.find((x) => x.id === 'block-2');
    expect(b?.kind).toBe('slab');
    expect(b?.height).toBe(0.5);
    expect(b?.y).toBe(3);
    expect(b?.color).toBe('#ffffff');
  });

  it('undo restores the pre-edit blocks', () => {
    useVisSim.getState().moveBlockBy('block-1', 2, 1);

    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.blocks!.find((b) => b.id === 'block-1')?.rect).toEqual({
      x: 0,
      z: 8,
      w: 6,
      d: 0.5,
    });
  });
});

describe('removeBlock', () => {
  it('removes the block and clears a matching selection', () => {
    useVisSim.setState({ selectedBlockId: 'block-1' });

    useVisSim.getState().removeBlock('block-1');

    const s = useVisSim.getState();
    expect(s.scene.blocks!.some((b) => b.id === 'block-1')).toBe(false);
    expect(s.selectedBlockId).toBeNull();
  });

  it('leaves a non-matching selection alone', () => {
    useVisSim.setState({ selectedBlockId: 'block-2' });

    useVisSim.getState().removeBlock('block-1');

    expect(useVisSim.getState().selectedBlockId).toBe('block-2');
  });

  it('undo restores the removed block', () => {
    useVisSim.getState().removeBlock('block-1');
    expect(useVisSim.getState().scene.blocks).toHaveLength(1);

    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.blocks!.some((b) => b.id === 'block-1')).toBe(true);
  });
});

describe('block edits invalidate approvals', () => {
  const actions: Array<[string, () => void]> = [
    ['addBlockAt', () => useVisSim.getState().addBlockAt('wall', { x: 2, z: 2, w: 4, d: 0.5 })],
    ['moveBlockBy', () => useVisSim.getState().moveBlockBy('block-1', 1, 1)],
    [
      'resizeBlockTo',
      () => useVisSim.getState().resizeBlockTo('block-1', { x: 0, z: 8, w: 8, d: 0.5 }),
    ],
    ['updateBlockMeta', () => useVisSim.getState().updateBlockMeta('block-1', { height: 4 })],
    ['removeBlock', () => useVisSim.getState().removeBlock('block-1')],
  ];

  it.each(actions)('%s bumps revision, clears approvals/published, records history', (_n, act) => {
    useVisSim.setState({ approvals: { 'team-b': 'approved' }, published: true });

    act();

    const s = useVisSim.getState();
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
    expect(s.canUndo).toBe(true);
  });
});

describe('block edit actions swallow invalid ids', () => {
  const invalidCalls: Array<[string, () => void]> = [
    ['moveBlockBy', () => useVisSim.getState().moveBlockBy('nope', 1, 1)],
    ['resizeBlockTo', () => useVisSim.getState().resizeBlockTo('nope', { x: 0, z: 0, w: 1, d: 1 })],
    ['updateBlockMeta', () => useVisSim.getState().updateBlockMeta('nope', { height: 4 })],
    ['removeBlock', () => useVisSim.getState().removeBlock('nope')],
  ];

  it.each(invalidCalls)('%s is a no-op that records no history', (_name, act) => {
    const before = useVisSim.getState();

    expect(act).not.toThrow();

    const s = useVisSim.getState();
    expect(s.scene).toBe(before.scene);
    expect(s.revision).toBe(1);
    expect(s.canUndo).toBe(false);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });
});

describe('setSceneRules', () => {
  it('replaces the rules on a fresh scene object, bumps revision, and invalidates', () => {
    useVisSim.setState({
      scene: { ...makeScene(), rules: [makeRule('rule-old')] },
      approvals: { 'team-b': 'approved' },
      published: true,
    });
    const before = useVisSim.getState().scene;
    const next = [makeRule('rule-a'), makeRule('rule-b')];

    useVisSim.getState().setSceneRules(next);

    const s = useVisSim.getState();
    expect(s.scene).not.toBe(before);
    expect(s.scene.rules).toEqual(next);
    expect(before.rules).toEqual([makeRule('rule-old')]);
    expect(s.revision).toBe(2);
    expect(s.approvals).toEqual({});
    expect(s.published).toBe(false);
  });

  it('can clear all rules with an empty list', () => {
    useVisSim.setState({ scene: { ...makeScene(), rules: [makeRule('rule-old')] } });

    useVisSim.getState().setSceneRules([]);

    expect(useVisSim.getState().scene.rules).toEqual([]);
  });

  it('undo restores the previous rules', () => {
    useVisSim.setState({ scene: { ...makeScene(), rules: [makeRule('rule-old')] } });

    useVisSim.getState().setSceneRules([makeRule('rule-a')]);
    useVisSim.getState().undo();

    expect(useVisSim.getState().scene.rules).toEqual([makeRule('rule-old')]);
  });
});

describe('boot restore from localStorage', () => {
  it('module load prefers a persisted plan for the default scene over registry data', async () => {
    const entry = SCENES[0];
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
    storage.set(
      `vissim:scene:${entry.scene.id}`,
      JSON.stringify({
        scene: { ...entry.scene, name: 'Edited before reload' },
        moves: [],
        planName: 'Persisted plan',
      }),
    );
    try {
      // Fresh module instance so its load-time boot-restore path runs against
      // the stubbed storage; the statically imported store is untouched.
      vi.resetModules();
      const fresh = await import('./store');
      const s = fresh.useVisSim.getState();
      expect(s.planName).toBe('Persisted plan');
      expect(s.scene.name).toBe('Edited before reload');
      expect(s.moves).toEqual([]);
      expect(s.playhead).toBe(entry.scene.dayStart + 60);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
