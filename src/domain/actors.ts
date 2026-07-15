// Actor animation math — pure functions, no rendering. Extracted from the
// viewport's MoveActors component so the staggered-dot logic is testable.

import type { Move, Vec2 } from './types';
import { pathLength, pointAlong } from './engine';

/** A cohort move always renders this many dots. */
export const COHORT_DOTS = 24;

/** Non-cohort moves render at most this many dots (capped by `move.count`). */
export const MAX_INDIVIDUAL_DOTS = 8;

/** Fraction of the time window used to stagger cohort dots. */
export const COHORT_STAGGER_SPAN = 0.6;

/** Fraction of the time window used to stagger non-cohort dots. */
export const INDIVIDUAL_STAGGER_SPAN = 0.1;

/**
 * Positions of a move's rendered actors at time `t` (minutes-of-day).
 * Dots are staggered along the move's time window: dot `i` starts at offset
 * `(i / (dots − 1)) · staggerSpan` and travels the full path over the
 * remaining `1 − staggerSpan` of the window. Dots not yet started or already
 * arrived are omitted. Returns [] outside the window or for degenerate moves.
 */
export function actorPositions(move: Move, t: number): Vec2[] {
  const total = pathLength(move.path);
  const dur = move.tEnd - move.tStart;
  if (t < move.tStart || t > move.tEnd || total === 0 || dur <= 0) return [];

  const isCohort = move.actorKind === 'cohort';
  const dots = isCohort ? COHORT_DOTS : Math.min(move.count, MAX_INDIVIDUAL_DOTS);
  const staggerSpan = isCohort ? COHORT_STAGGER_SPAN : INDIVIDUAL_STAGGER_SPAN;
  const travelSpan = 1 - staggerSpan;
  const elapsed = (t - move.tStart) / dur;

  const positions: Vec2[] = [];
  for (let i = 0; i < dots; i++) {
    const offset = dots > 1 ? (i / (dots - 1)) * staggerSpan : 0;
    const frac = (elapsed - offset) / travelSpan;
    if (frac < 0 || frac > 1) continue;
    positions.push(pointAlong(move.path, frac * total));
  }
  return positions;
}
