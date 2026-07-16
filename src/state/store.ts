import { create } from 'zustand';
import type {
  ApprovalStatus,
  Block,
  BlockKind,
  Move,
  Rect,
  Resource,
  Rule,
  SceneDef,
  Team,
  Vec2,
} from '../domain/types';
import { SCENES, sceneEntryById } from '../domain/scenes';
import {
  addBlock as domainAddBlock,
  addResource as domainAddResource,
  addTeam as domainAddTeam,
  duplicateResource as domainDuplicateResource,
  makeBlockId,
  makeResourceId,
  moveBlock as domainMoveBlock,
  moveResource as domainMoveResource,
  moveWaypoint as domainMoveWaypoint,
  removeBlock as domainRemoveBlock,
  removeResource as domainRemoveResource,
  removeTeam as domainRemoveTeam,
  renameScene as domainRenameScene,
  resizeBlockTo as domainResizeBlockTo,
  resizeResource as domainResizeResource,
  snapRect,
  updateBlockMeta as domainUpdateBlockMeta,
  updateResourceMeta as domainUpdateResourceMeta,
  updateTeam as domainUpdateTeam,
} from '../domain/sceneEdit';

export type Mode = 'select' | 'draw' | 'scene';

export type ViewMode = '3d' | 'top' | 'iso';

/** Left tool rail display stage (full labels → icons only → collapsed away). */
export type LeftRailState = 'expanded' | 'slim' | 'hidden';

/** Panel layout chrome. Never enters undo history and never invalidates plans. */
export interface UiState {
  leftRail: LeftRailState;
  rightOpen: boolean;
  bottomOpen: boolean;
}

/** Cycle order for the left rail: expanded → slim → hidden → expanded. */
export function nextLeftRail(current: LeftRailState): LeftRailState {
  if (current === 'expanded') return 'slim';
  if (current === 'slim') return 'hidden';
  return 'expanded';
}

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
  /** Scene-edit block selection; mutually exclusive with selectedResourceId. */
  selectedBlockId: string | null;
  /** Armed draw tool in scene-edit mode (PRD US-5): resources or passive blocks. */
  pendingAdd: 'zone' | 'connector' | 'wall' | 'box' | null;
  /** Mirrors of the module-level history stacks, for reactive UI (undo/redo buttons). */
  canUndo: boolean;
  canRedo: boolean;
  /** Panel chrome (rails/docks). Persisted separately; excluded from undo history. */
  ui: UiState;

  setScene: (sceneId: string) => void;
  loadMoves: (moves: Move[]) => void;
  setPlayhead: (t: number) => void;
  togglePlay: () => void;
  setMode: (m: Mode) => void;
  /** Editor-style tool toggle: activating the current mode returns to 'select'. */
  toggleMode: (m: Mode) => void;
  setViewMode: (v: ViewMode) => void;
  /** Merge a partial into the ui slice and persist it. Never touches the plan. */
  setUi: (partial: Partial<UiState>) => void;
  selectMove: (id: string | null) => void;
  retimeMove: (id: string, tStart: number, tEnd: number) => void;
  addDraftPoint: (p: Vec2) => void;
  clearDraft: () => void;
  createMoveFromDraft: (m: Omit<Move, 'id' | 'path'>) => void;
  deleteMove: (id: string) => void;
  approve: (teamId: string) => void;
  publish: () => void;

  selectResource: (id: string | null) => void;
  /** Selecting a block clears the resource selection (and vice versa). */
  selectBlock: (id: string | null) => void;
  setPendingAdd: (kind: 'zone' | 'connector' | 'wall' | 'box' | null) => void;
  moveResourceBy: (id: string, dx: number, dz: number) => void;
  resizeResourceTo: (id: string, rect: Rect) => void;
  updateResourceMeta: (
    id: string,
    meta: { name?: string; ownerTeamIds?: string[]; tags?: string[] },
  ) => void;
  addResourceAt: (kind: 'zone' | 'connector', rect: Rect) => void;
  removeResource: (id: string) => void;
  moveMoveWaypoint: (moveId: string, index: number, p: Vec2) => void;
  duplicateSelectedResource: () => void;

  /** Passive-block editing (visual context; blocks are never reservable). */
  addBlockAt: (kind: 'wall' | 'box', rect: Rect) => void;
  moveBlockBy: (id: string, dx: number, dz: number) => void;
  resizeBlockTo: (id: string, rect: Rect) => void;
  updateBlockMeta: (
    id: string,
    meta: { kind?: BlockKind; height?: number; y?: number; color?: string },
  ) => void;
  removeBlock: (id: string) => void;

  /** Replace the scene's data-driven rules wholesale (rule editor). */
  setSceneRules: (rules: Rule[]) => void;

  renameActiveScene: (name: string) => void;
  addTeamToScene: (team: Team) => void;
  updateTeamInScene: (id: string, meta: { name?: string; color?: string }) => void;
  removeTeamFromScene: (id: string) => void;

  undo: () => void;
  redo: () => void;
  newScene: () => void;
  resetSceneToDefault: () => void;
  /** Drop a non-registry scene's persisted data; switches away if it is active. */
  deleteCustomScene: (id: string) => void;
}

/** Every plan edit invalidates approvals — approvals attach to a revision. */
const invalidate = { approvals: {}, published: false } as const;

// ---------------------------------------------------------------------------
// Undo/redo history. Snapshots capture only plan data — never playhead, mode,
// or selection (undoing a plan edit must not yank the camera/UI around).
// Stacks live outside the reactive state; canUndo/canRedo mirror them into it.
// ---------------------------------------------------------------------------

interface Snapshot {
  scene: SceneDef;
  moves: Move[];
  revision: number;
  approvals: Record<string, ApprovalStatus>;
  published: boolean;
  planName: string;
}

const HISTORY_CAP = 50;

let past: Snapshot[] = [];
let future: Snapshot[] = [];

function takeSnapshot(s: VisSimState): Snapshot {
  return {
    scene: s.scene,
    moves: s.moves,
    revision: s.revision,
    approvals: s.approvals,
    published: s.published,
    planName: s.planName,
  };
}

// ---------------------------------------------------------------------------
// Scene persistence (localStorage). Guarded so the store works unchanged in
// environments without localStorage (node/Vitest): every helper silently
// no-ops or returns an empty result there, and quota/serialization errors are
// swallowed — persistence must never break editing.
// ---------------------------------------------------------------------------

const SCENE_KEY_PREFIX = 'vissim:scene:';
const CUSTOM_INDEX_KEY = 'vissim:custom-scenes';

interface PersistedPlan {
  scene: SceneDef;
  moves: Move[];
  planName: string;
}

/** Custom (non-registry) scenes with a persisted entry, for the App scene picker. */
export function listPersistedCustomScenes(): { id: string; name: string }[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is { id: string; name: string } =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as { id?: unknown }).id === 'string' &&
          typeof (e as { name?: unknown }).name === 'string',
      )
      .map((e) => ({ id: e.id, name: e.name }));
  } catch {
    return [];
  }
}

function loadPersistedPlan(sceneId: string): PersistedPlan | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SCENE_KEY_PREFIX}${sceneId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPlan> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.scene ||
      typeof parsed.scene.id !== 'string' ||
      !Array.isArray(parsed.moves) ||
      typeof parsed.planName !== 'string'
    ) {
      return null;
    }
    return { scene: parsed.scene, moves: parsed.moves, planName: parsed.planName };
  } catch {
    return null;
  }
}

function persistPlan(s: Pick<VisSimState, 'scene' | 'moves' | 'planName'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `${SCENE_KEY_PREFIX}${s.scene.id}`,
      JSON.stringify({ scene: s.scene, moves: s.moves, planName: s.planName }),
    );
    if (!sceneEntryById(s.scene.id)) {
      const index = listPersistedCustomScenes().filter((e) => e.id !== s.scene.id);
      index.push({ id: s.scene.id, name: s.scene.name });
      localStorage.setItem(CUSTOM_INDEX_KEY, JSON.stringify(index));
    }
  } catch {
    // Quota exceeded / private mode / serialization failure: keep editing anyway.
  }
}

function removePersistedPlan(sceneId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(`${SCENE_KEY_PREFIX}${sceneId}`);
    const index = listPersistedCustomScenes().filter((e) => e.id !== sceneId);
    localStorage.setItem(CUSTOM_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Same guarantee as persistPlan: storage failures never break the app.
  }
}

// ---------------------------------------------------------------------------
// UI-chrome persistence (panel layout). Same guarantee as plan persistence:
// storage failures never break the app, and node/Vitest (no localStorage)
// silently falls back to defaults.
// ---------------------------------------------------------------------------

const UI_KEY = 'vissim:ui';

const DEFAULT_UI: UiState = { leftRail: 'expanded', rightOpen: true, bottomOpen: true };

function loadPersistedUi(): UiState {
  if (typeof localStorage === 'undefined') return DEFAULT_UI;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT_UI;
    const parsed = JSON.parse(raw) as Partial<UiState> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_UI;
    return {
      leftRail:
        parsed.leftRail === 'expanded' || parsed.leftRail === 'slim' || parsed.leftRail === 'hidden'
          ? parsed.leftRail
          : DEFAULT_UI.leftRail,
      rightOpen: typeof parsed.rightOpen === 'boolean' ? parsed.rightOpen : DEFAULT_UI.rightOpen,
      bottomOpen:
        typeof parsed.bottomOpen === 'boolean' ? parsed.bottomOpen : DEFAULT_UI.bottomOpen,
    };
  } catch {
    return DEFAULT_UI;
  }
}

function persistUi(ui: UiState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // Quota exceeded / private mode: layout preferences are best-effort.
  }
}

/** Blank starter scene for newScene / resetting a custom scene. */
function blankScene(id: string, name: string): SceneDef {
  return {
    id,
    name,
    teams: [
      { id: 'ops', name: 'Operations', color: '#4f8ef7' },
      { id: 'partner', name: 'Partner team', color: '#2fbfa3' },
    ],
    resources: [],
    authorTeamId: 'ops',
    dayStart: 480,
    dayEnd: 960,
    blocks: [],
  };
}

const initialEntry = SCENES[0];
// Boot restore: persisted edits to the default scene win over registry data,
// so a page reload lands exactly where the last edit left off.
const initialPersisted = loadPersistedPlan(initialEntry.scene.id);
const initialScene = initialPersisted ? initialPersisted.scene : initialEntry.scene;

export const useVisSim = create<VisSimState>((set, get) => {
  /**
   * Wrapper for every plan-mutating action: pushes the pre-change snapshot to
   * the undo stack (clearing redo), applies the patch, mirrors canUndo/canRedo,
   * and persists the plan. A `{}` patch (or a domain throw handled inside `fn`
   * by returning `{}`) is a no-op that records no history and persists nothing.
   */
  const mutate = (fn: (s: VisSimState) => Partial<VisSimState>): void => {
    const before = get();
    const patch = fn(before);
    if (Object.keys(patch).length === 0) return;
    past.push(takeSnapshot(before));
    if (past.length > HISTORY_CAP) past.shift();
    future = [];
    set({ ...patch, canUndo: true, canRedo: false });
    persistPlan(get());
  };

  /** Shared reset when swapping to a different plan (setScene/newScene/reset). */
  const freshUiState = {
    playing: false,
    draftPath: [] as Vec2[],
    revision: 1,
    selectedMoveId: null,
    selectedResourceId: null,
    selectedBlockId: null,
    pendingAdd: null,
    canUndo: false,
    canRedo: false,
    ...invalidate,
  } as const;

  return {
    scene: initialScene,
    moves: initialPersisted ? initialPersisted.moves : initialEntry.initialMoves,
    planName: initialPersisted ? initialPersisted.planName : initialEntry.planName,
    playhead: initialScene.dayStart + 60,
    playing: false,
    mode: 'select',
    viewMode: '3d',
    draftPath: [],
    revision: 1,
    approvals: {},
    published: false,
    selectedMoveId: null,
    selectedResourceId: null,
    selectedBlockId: null,
    pendingAdd: null,
    canUndo: false,
    canRedo: false,
    ui: loadPersistedUi(),

    setScene: (sceneId) => {
      // Persisted edits win over registry defaults; a persisted entry with no
      // registry counterpart is a custom scene surviving a reload.
      const persisted = loadPersistedPlan(sceneId);
      const entry = sceneEntryById(sceneId);
      if (!persisted && !entry) return;
      const scene = persisted ? persisted.scene : entry!.scene;
      past = [];
      future = [];
      set({
        scene,
        moves: persisted ? persisted.moves : entry!.initialMoves,
        planName: persisted ? persisted.planName : entry!.planName,
        playhead: scene.dayStart + 60,
        mode: 'select',
        ...freshUiState,
      });
    },

    newScene: () => {
      past = [];
      future = [];
      set({
        scene: blankScene(`custom-${Date.now()}`, 'Untitled scene'),
        moves: [],
        planName: 'New plan',
        playhead: 540,
        mode: 'scene',
        ...freshUiState,
      });
      persistPlan(get());
    },

    resetSceneToDefault: () => {
      const current = get().scene;
      removePersistedPlan(current.id);
      const entry = sceneEntryById(current.id);
      past = [];
      future = [];
      if (entry) {
        set({
          scene: entry.scene,
          moves: entry.initialMoves,
          planName: entry.planName,
          playhead: entry.scene.dayStart + 60,
          mode: 'select',
          ...freshUiState,
        });
        return;
      }
      // Custom scene: back to the blank template under the same id/name, then
      // re-persist so it stays listed in the App picker across reloads.
      set({
        scene: blankScene(current.id, current.name),
        moves: [],
        planName: 'New plan',
        playhead: 540,
        mode: 'scene',
        ...freshUiState,
      });
      persistPlan(get());
    },

    deleteCustomScene: (id) => {
      // Registry scenes can be reset but never deleted.
      if (sceneEntryById(id)) return;
      removePersistedPlan(id);
      if (get().scene.id === id) {
        get().setScene(SCENES[0].scene.id);
      }
    },

    undo: () => {
      const snap = past.pop();
      if (!snap) return;
      future.push(takeSnapshot(get()));
      set({ ...snap, canUndo: past.length > 0, canRedo: true });
      persistPlan(get());
    },

    redo: () => {
      const snap = future.pop();
      if (!snap) return;
      past.push(takeSnapshot(get()));
      set({ ...snap, canUndo: true, canRedo: future.length > 0 });
      persistPlan(get());
    },

    loadMoves: (moves) =>
      mutate((s) => ({
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
          ? { selectedResourceId: null, selectedBlockId: null, pendingAdd: null }
          : {}),
      })),
    toggleMode: (m) => {
      // Same cleanup semantics as setMode (draft cleared, scene-edit state
      // dropped on enter/leave) — toggling only decides the target mode.
      get().setMode(get().mode === m ? 'select' : m);
    },
    setViewMode: (v) => set({ viewMode: v }),
    setUi: (partial) => {
      const ui = { ...get().ui, ...partial };
      set({ ui });
      persistUi(ui);
    },
    selectMove: (id) => set({ selectedMoveId: id }),

    retimeMove: (id, tStart, tEnd) =>
      mutate((s) => ({
        moves: s.moves.map((m) => (m.id === id ? { ...m, tStart, tEnd } : m)),
        revision: s.revision + 1,
        ...invalidate,
      })),

    addDraftPoint: (p) => set((s) => ({ draftPath: [...s.draftPath, p] })),
    clearDraft: () => set({ draftPath: [] }),

    createMoveFromDraft: (m) =>
      mutate((s) => {
        if (s.draftPath.length < 2) return {};
        return {
          moves: [...s.moves, { ...m, id: `move-${Date.now()}`, path: s.draftPath }],
          draftPath: [],
          mode: 'select',
          revision: s.revision + 1,
          ...invalidate,
        };
      }),

    deleteMove: (id) =>
      mutate((s) => ({
        moves: s.moves.filter((m) => m.id !== id),
        selectedMoveId: s.selectedMoveId === id ? null : s.selectedMoveId,
        revision: s.revision + 1,
        ...invalidate,
      })),

    approve: (teamId) => set((s) => ({ approvals: { ...s.approvals, [teamId]: 'approved' } })),
    publish: () => set({ published: true }),

    // Resource and block selection are mutually exclusive: the inspector shows
    // one or the other, so setting either always clears its counterpart.
    selectResource: (id) => set({ selectedResourceId: id, selectedBlockId: null }),
    selectBlock: (id) => set({ selectedBlockId: id, selectedResourceId: null }),
    setPendingAdd: (kind) => set({ pendingAdd: kind }),

    // Scene edits below delegate geometry/validation to src/domain/sceneEdit and
    // always bump revision + clear approvals (PRD US-8: scene edits invalidate).
    // Domain throws (e.g. a drag racing a deletion) are swallowed as no-ops.
    moveResourceBy: (id, dx, dz) =>
      mutate((s) => {
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
      mutate((s) => {
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
      mutate((s) => {
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
      mutate((s) => {
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
      mutate((s) => {
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

    duplicateSelectedResource: () =>
      mutate((s) => {
        if (!s.selectedResourceId) return {};
        try {
          const scene = domainDuplicateResource(s.scene, s.selectedResourceId);
          // duplicateResource appends the copy, so it is the last resource.
          const copy = scene.resources[scene.resources.length - 1];
          return {
            scene,
            selectedResourceId: copy.id,
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    // Block edits mirror the resource-edit pattern: delegate to sceneEdit,
    // bump revision + invalidate, and swallow domain throws (stale ids) as no-ops.
    addBlockAt: (kind, rect) =>
      mutate((s) => {
        try {
          const block: Block = {
            id: makeBlockId(s.scene, kind),
            kind,
            rect: snapRect(rect),
            height: kind === 'wall' ? 3.5 : 2,
            color: kind === 'wall' ? '#8892aa' : '#46506e',
          };
          return {
            scene: domainAddBlock(s.scene, block),
            selectedBlockId: block.id,
            selectedResourceId: null,
            pendingAdd: null,
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    moveBlockBy: (id, dx, dz) =>
      mutate((s) => {
        try {
          return {
            scene: domainMoveBlock(s.scene, id, dx, dz),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    resizeBlockTo: (id, rect) =>
      mutate((s) => {
        try {
          return {
            scene: domainResizeBlockTo(s.scene, id, rect),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    updateBlockMeta: (id, meta) =>
      mutate((s) => {
        try {
          return {
            scene: domainUpdateBlockMeta(s.scene, id, meta),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    removeBlock: (id) =>
      mutate((s) => {
        try {
          return {
            scene: domainRemoveBlock(s.scene, id),
            selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    setSceneRules: (rules) =>
      mutate((s) => ({
        scene: { ...s.scene, rules },
        revision: s.revision + 1,
        ...invalidate,
      })),

    renameActiveScene: (name) =>
      mutate((s) => ({
        scene: domainRenameScene(s.scene, name),
        revision: s.revision + 1,
        ...invalidate,
      })),

    addTeamToScene: (team) =>
      mutate((s) => {
        try {
          return {
            scene: domainAddTeam(s.scene, team),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    updateTeamInScene: (id, meta) =>
      mutate((s) => {
        try {
          return {
            scene: domainUpdateTeam(s.scene, id, meta),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    removeTeamFromScene: (id) =>
      mutate((s) => {
        try {
          return {
            scene: domainRemoveTeam(s.scene, id, s.moves),
            revision: s.revision + 1,
            ...invalidate,
          };
        } catch {
          return {};
        }
      }),

    moveMoveWaypoint: (moveId, index, p) =>
      mutate((s) => {
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
  };
});
