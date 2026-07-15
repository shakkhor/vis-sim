import { beforeEach, describe, expect, it } from 'vitest';
import type { Move } from '../domain/types';
import { useVisSim } from './store';

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
    moves: [makeMove()],
    mode: 'select',
    draftPath: [],
    revision: 1,
    approvals: {},
    published: false,
    selectedMoveId: null,
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
});
