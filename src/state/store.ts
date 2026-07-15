import { create } from 'zustand';
import type { ApprovalStatus, Move, SceneDef, Vec2 } from '../domain/types';
import { SCENES, sceneEntryById } from '../domain/scenes';

export type Mode = 'select' | 'draw';

export type ViewMode = '3d' | 'top' | 'iso';

interface VisSimState {
  /** The scene the plan runs against. Swappable via the scene registry. */
  scene: SceneDef;
  moves: Move[];
  planName: string;
  playhead: number;
  playing: boolean;
  mode: Mode;
  /** Camera projection of the one shared model (plan §5.1); never forks plan data. */
  viewMode: ViewMode;
  draftPath: Vec2[];
  /** Bumped on any plan edit; editing an in-review plan resets approvals (plan §4.3). */
  revision: number;
  approvals: Record<string, ApprovalStatus>;
  published: boolean;
  selectedMoveId: string | null;

  setScene: (sceneId: string) => void;
  loadMoves: (moves: Move[]) => void;
  setPlayhead: (t: number) => void;
  togglePlay: () => void;
  setMode: (m: Mode) => void;
  setViewMode: (v: ViewMode) => void;
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

const initialEntry = SCENES[0];

export const useVisSim = create<VisSimState>((set, get) => ({
  scene: initialEntry.scene,
  moves: initialEntry.initialMoves,
  planName: initialEntry.planName,
  playhead: initialEntry.scene.dayStart + 60,
  playing: false,
  mode: 'select',
  viewMode: '3d',
  draftPath: [],
  revision: 1,
  approvals: {},
  published: false,
  selectedMoveId: null,

  setScene: (sceneId) => {
    const entry = sceneEntryById(sceneId);
    if (!entry) return;
    set({
      scene: entry.scene,
      moves: entry.initialMoves,
      planName: entry.planName,
      playhead: entry.scene.dayStart + 60,
      playing: false,
      mode: 'select',
      draftPath: [],
      revision: 1,
      selectedMoveId: null,
      ...invalidate,
    });
  },

  loadMoves: (moves) =>
    set((s) => ({
      moves,
      revision: s.revision + 1,
      ...invalidate,
    })),

  setPlayhead: (t) => set({ playhead: t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setMode: (m) => set({ mode: m, draftPath: [] }),
  setViewMode: (v) => set({ viewMode: v }),
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
