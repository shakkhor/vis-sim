import { describe, expect, it } from 'vitest';
import {
  COHORT_DOTS,
  COHORT_STAGGER_SPAN,
  INDIVIDUAL_STAGGER_SPAN,
  MAX_INDIVIDUAL_DOTS,
  actorPositions,
} from './actors';
import type { Move } from './types';

const PATH = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
];

const makeMove = (overrides: Partial<Move>): Move => ({
  id: 'test',
  name: 'test',
  actorKind: 'staff',
  count: 1,
  teamId: 'blockD',
  path: PATH,
  tStart: 0,
  tEnd: 10,
  ...overrides,
});

describe('actorPositions', () => {
  it('returns [] outside the time window', () => {
    const move = makeMove({ tStart: 100, tEnd: 200 });
    expect(actorPositions(move, 99)).toEqual([]);
    expect(actorPositions(move, 201)).toEqual([]);
  });

  it('returns [] for degenerate moves', () => {
    expect(actorPositions(makeMove({ path: [{ x: 3, z: 3 }] }), 5)).toEqual([]);
    expect(actorPositions(makeMove({ tStart: 10, tEnd: 10 }), 10)).toEqual([]);
    expect(actorPositions(makeMove({ tStart: 10, tEnd: 5 }), 7)).toEqual([]);
  });

  it('yields exactly one interpolated position for a single staff actor mid-window', () => {
    const move = makeMove({ actorKind: 'staff', count: 1 });
    const positions = actorPositions(move, 5);
    expect(positions).toHaveLength(1);
    // dots === 1 ⇒ offset 0; frac = 0.5 / (1 − 0.1) = 5/9 of a 10-unit path.
    expect(positions[0].x).toBeCloseTo((0.5 / (1 - INDIVIDUAL_STAGGER_SPAN)) * 10, 10);
    expect(positions[0].z).toBe(0);
  });

  it('caps non-cohort moves at MAX_INDIVIDUAL_DOTS', () => {
    const move = makeMove({ actorKind: 'vehicle', count: 50 });
    const positions = actorPositions(move, 5);
    expect(positions.length).toBeLessThanOrEqual(MAX_INDIVIDUAL_DOTS);
    expect(positions.length).toBeGreaterThan(0);
  });

  it('shows only the lead dots of a cohort at window start', () => {
    const move = makeMove({ actorKind: 'cohort', count: 120 });
    const atStart = actorPositions(move, move.tStart);
    expect(atStart.length).toBeGreaterThan(0);
    expect(atStart.length).toBeLessThan(COHORT_DOTS);
    // Every visible dot is still at the path origin.
    for (const p of atStart) {
      expect(p.x).toBeCloseTo(0, 10);
    }
  });

  it('shows more cohort dots mid-window than at the start', () => {
    const move = makeMove({ actorKind: 'cohort', count: 120 });
    const atStart = actorPositions(move, move.tStart);
    const midWindow = actorPositions(move, 5);
    expect(midWindow.length).toBeGreaterThan(atStart.length);
    expect(midWindow.length).toBeLessThanOrEqual(COHORT_DOTS);
    expect(COHORT_STAGGER_SPAN).toBeLessThan(1);
  });

  it('keeps every position within the path segment range', () => {
    const move = makeMove({ actorKind: 'cohort', count: 120 });
    for (const t of [0, 2, 4, 5, 6, 8, 10]) {
      for (const p of actorPositions(move, t)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(10);
        expect(p.z).toBe(0);
      }
    }
  });
});
