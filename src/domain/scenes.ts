// Scene registry: every scene the app can load, with its starter plan.
// Pure data lookup — no React, no three.js (see CLAUDE.md architecture rules).
import type { Move, SceneDef } from './types';
import { INITIAL_MOVES, SAMPLE_SCENE } from './sampleScene';
import { WAREHOUSE_MOVES, WAREHOUSE_SCENE } from './warehouseScene';

export interface SceneEntry {
  scene: SceneDef;
  initialMoves: Move[];
  planName: string;
}

export const SCENES: SceneEntry[] = [
  { scene: SAMPLE_SCENE, initialMoves: INITIAL_MOVES, planName: 'Matchday — Aug 12' },
  { scene: WAREHOUSE_SCENE, initialMoves: WAREHOUSE_MOVES, planName: 'Shift Plan — AM' },
];

export function sceneEntryById(id: string): SceneEntry | undefined {
  return SCENES.find((entry) => entry.scene.id === id);
}
