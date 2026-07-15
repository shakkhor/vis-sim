import { create } from 'zustand';
import type { ApprovalStatus, Move, Rect, Resource, SceneDef, Vec2 } from '../domain/types';
import { SCENES, sceneEntryById } from '../domain/scenes';
import {
  addResource as domainAddResource,
  makeResourceId,
  moveResource as domainMoveResource,
  moveWaypoint as domainMoveWaypoint,
  removeResource as domainRemoveResource,
  resizeResource as domainResizeResource,
  snapRect,
  updateResourceMeta as domainUpdateResourceMeta,
} from '../domain/sceneEdit';

export type Mode = 'select' | 'draw' | 'scene';

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
  /** Scene-edit mode selection (PRD US-1); independent of selectedMoveId. */
  selectedResourceId: string | null;
  /** Armed draw-resource tool in scene-edit mode (PRD US-5). */
  pendingAdd: 'zone' | 'connector' | null;

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

  selectResource: (id: string | null) => void;
  setPendingAdd: (kind: 'zone' | 'connector' | null) => void;
  moveResourceBy: (id: string, dx: number, dz: number) => void;
  resizeResourceTo: (id: string, rect: Rect) => void;
  updateResourceMeta: (
    id: string,
    meta: { name?: string; ownerTeamIds?: string[]; tags?: string[] },
  ) => void;
  addResourceAt: (kind: 'zone' | 'connector', rect: Rect) => void;
  removeResource: (id: string) => void;
  moveMoveWaypoint: (moveId: string, index: number, p: Vec2) => void;
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
  selectedResourceId: null,
  pendingAdd: null,

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
      selectedResourceId: null,
      pendingAdd: null,
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
  setMode: (m) =>
    set((s) => ({
      mode: m,
      draftPath: [],
      // Entering or leaving scene-edit mode drops scene-edit UI state (PRD US-12).
      ...(m === 'scene' || s.mode === 'scene'
        ? { selectedResourceId: null, pendingAdd: null }
        : {}),
    })),
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

  selectResource: (id) => set({ selectedResourceId: id }),
  setPendingAdd: (kind) => set({ pendingAdd: kind }),

  // Scene edits below delegate geometry/validation to src/domain/sceneEdit and
  // always bump revision + clear approvals (PRD US-8: scene edits invalidate).
  // Domain throws (e.g. a drag racing a deletion) are swallowed as no-ops.
  moveResourceBy: (id, dx, dz) =>
    set((s) => {
      try {
        return {
          scene: domainMoveResource(s.scene, id, dx, dz),
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),

  resizeResourceTo: (id, rect) =>
    set((s) => {
      try {
        return {
          scene: domainResizeResource(s.scene, id, rect),
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),

  updateResourceMeta: (id, meta) =>
    set((s) => {
      try {
        return {
          scene: domainUpdateResourceMeta(s.scene, id, meta),
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),

  addResourceAt: (kind, rect) =>
    set((s) => {
      try {
        const resource: Resource = {
          id: makeResourceId(s.scene, kind),
          name: kind === 'zone' ? 'New zone' : 'New connector',
          kind,
          rect: snapRect(rect),
          ownerTeamIds: [s.scene.authorTeamId],
        };
        return {
          scene: domainAddResource(s.scene, resource),
          selectedResourceId: resource.id,
          pendingAdd: null,
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),

  removeResource: (id) =>
    set((s) => {
      try {
        return {
          scene: domainRemoveResource(s.scene, id),
          selectedResourceId: s.selectedResourceId === id ? null : s.selectedResourceId,
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),

  moveMoveWaypoint: (moveId, index, p) =>
    set((s) => {
      const move = s.moves.find((m) => m.id === moveId);
      if (!move) return {};
      try {
        const updated = domainMoveWaypoint(move, index, p);
        return {
          moves: s.moves.map((m) => (m.id === moveId ? updated : m)),
          revision: s.revision + 1,
          ...invalidate,
        };
      } catch {
        return {};
      }
    }),
}));
