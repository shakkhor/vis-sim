import { create } from 'zustand';
import type { ApprovalStatus, Move, SceneDef, Vec2 } from '../domain/types';
import { INITIAL_MOVES, SAMPLE_SCENE } from '../domain/sampleScene';

export type Mode = 'select' | 'draw';

interface VisSimState {
  /** The scene the plan runs against. Static in the prototype; data, not a global. */
  scene: SceneDef;
  moves: Move[];
  playhead: number;
  playing: boolean;
  mode: Mode;
  draftPath: Vec2[];
  /** Bumped on any plan edit; editing an in-review plan resets approvals (plan §4.3). */
  revision: number;
  approvals: Record<string, ApprovalStatus>;
  published: boolean;
  selectedMoveId: string | null;

  setPlayhead: (t: number) => void;
  togglePlay: () => void;
  setMode: (m: Mode) => void;
  selectMove: (id: string | null) => void;
  retimeMove: (id: string, tStart: number, tEnd: number) => void;
  addDraftPoint: (p: Vec2) => void;
  clearDraft: () => void;
  createMoveFromDraft: (m: Omit<Move, 'id' | 'path'>) => void;
  deleteMove: (id: string) => void;
  approve: (teamId: string) => void;
  publish: () => void;
}

/** Every plan edit invalidates approvals — approvals attach to a revision. */
const invalidate = { approvals: {}, published: false } as const;

export const useVisSim = create<VisSimState>((set, get) => ({
  scene: SAMPLE_SCENE,
  moves: INITIAL_MOVES,
  playhead: SAMPLE_SCENE.dayStart + 60,
  playing: false,
  mode: 'select',
  draftPath: [],
  revision: 1,
  approvals: {},
  published: false,
  selectedMoveId: null,

  setPlayhead: (t) => set({ playhead: t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setMode: (m) => set({ mode: m, draftPath: [] }),
  selectMove: (id) => set({ selectedMoveId: id }),

  retimeMove: (id, tStart, tEnd) =>
    set((s) => ({
      moves: s.moves.map((m) => (m.id === id ? { ...m, tStart, tEnd } : m)),
      revision: s.revision + 1,
      ...invalidate,
    })),

  addDraftPoint: (p) => set((s) => ({ draftPath: [...s.draftPath, p] })),
  clearDraft: () => set({ draftPath: [] }),

  createMoveFromDraft: (m) => {
    const path = get().draftPath;
    if (path.length < 2) return;
    set((s) => ({
      moves: [...s.moves, { ...m, id: `move-${Date.now()}`, path }],
      draftPath: [],
      mode: 'select',
      revision: s.revision + 1,
      ...invalidate,
    }));
  },

  deleteMove: (id) =>
    set((s) => ({
      moves: s.moves.filter((m) => m.id !== id),
      selectedMoveId: s.selectedMoveId === id ? null : s.selectedMoveId,
      revision: s.revision + 1,
      ...invalidate,
    })),

  approve: (teamId) => set((s) => ({ approvals: { ...s.approvals, [teamId]: 'approved' } })),
  publish: () => set({ published: true }),
}));
