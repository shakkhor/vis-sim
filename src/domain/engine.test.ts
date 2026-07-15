import { describe, expect, it } from 'vitest';
import {
  allReservations,
  computeConflicts,
  fmtTime,
  pathLength,
  pointAlong,
  posAtTime,
  requiredApproverTeamIds,
  reservationsForMove,
} from './engine';
import { INITIAL_MOVES, SAMPLE_SCENE } from './sampleScene';
import type { Move } from './types';

const { resources, authorTeamId } = SAMPLE_SCENE;

const makeMove = (overrides: Partial<Move>): Move => ({
  id: 'test',
  name: 'test',
  actorKind: 'staff',
  count: 1,
  teamId: 'blockD',
  path: [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
  ],
  tStart: 0,
  tEnd: 10,
  ...overrides,
});

describe('geometry primitives', () => {
  it('computes polyline length', () => {
    expect(
      pathLength([
        { x: 0, z: 0 },
        { x: 3, z: 4 },
      ]),
    ).toBe(5);
    expect(pathLength([{ x: 0, z: 0 }])).toBe(0);
    expect(pathLength([])).toBe(0);
  });

  it('interpolates along a polyline, clamping at both ends', () => {
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(pointAlong(path, 5)).toEqual({ x: 5, z: 0 });
    expect(pointAlong(path, -1)).toEqual({ x: 0, z: 0 });
    expect(pointAlong(path, 999)).toEqual({ x: 10, z: 0 });
  });
});

describe('reservations', () => {
  it('derives a reservation for each resource a path crosses', () => {
    const reservations = allReservations(INITIAL_MOVES, resources);
    const ids = (moveId: string) =>
      reservations.filter((r) => r.moveId === moveId).map((r) => r.resourceId);
    expect(ids('ingressD')).toEqual(expect.arrayContaining(['plaza', 'gate7', 'dconc']));
    expect(ids('fnbRestock')).toEqual(expect.arrayContaining(['fnbstore', 'gate7', 'kioskd']));
    expect(ids('secSweep')).toEqual(['plaza']);
  });

  it('maps reservation windows inside the move window', () => {
    const reservations = allReservations(INITIAL_MOVES, resources);
    for (const r of reservations) {
      const move = INITIAL_MOVES.find((m) => m.id === r.moveId)!;
      expect(r.t0).toBeGreaterThanOrEqual(move.tStart);
      expect(r.t1).toBeLessThanOrEqual(move.tEnd);
      expect(r.t0).toBeLessThanOrEqual(r.t1);
    }
  });

  it('returns nothing for degenerate moves', () => {
    expect(reservationsForMove(makeMove({ path: [{ x: 0, z: 0 }] }), resources)).toEqual([]);
    expect(reservationsForMove(makeMove({ tStart: 10, tEnd: 10 }), resources)).toEqual([]);
  });
});

describe('conflicts', () => {
  it('detects the flagship Gate 7 blocking conflict', () => {
    const reservations = allReservations(INITIAL_MOVES, resources);
    const conflicts = computeConflicts(reservations, resources, INITIAL_MOVES);
    const gate = conflicts.find((c) => c.resourceId === 'gate7');
    expect(gate).toBeDefined();
    expect(gate!.blocking).toBe(true);
    expect([gate!.moveAId, gate!.moveBId].sort()).toEqual(['fnbRestock', 'ingressD']);
  });

  it('clears the conflict when the F&B cart is retimed after ingress', () => {
    const retimed = INITIAL_MOVES.map((m) =>
      m.id === 'fnbRestock' ? { ...m, tStart: 900, tEnd: 930 } : m,
    );
    const conflicts = computeConflicts(allReservations(retimed, resources), resources, retimed);
    expect(conflicts.some((c) => c.resourceId === 'gate7')).toBe(false);
  });

  it('ignores same-team overlaps in zones but never in connectors', () => {
    const a = makeMove({
      id: 'a',
      teamId: 'blockD',
      path: [
        { x: 4, z: 0 },
        { x: 20, z: 0 },
      ],
    });
    const b = makeMove({
      id: 'b',
      teamId: 'blockD',
      path: [
        { x: 4, z: 2 },
        { x: 20, z: 2 },
      ],
    });
    const zoneConflicts = computeConflicts(allReservations([a, b], resources), resources, [a, b]);
    expect(zoneConflicts).toEqual([]); // same team, zone only → not a conflict

    const c = makeMove({
      id: 'c',
      teamId: 'blockD',
      path: [
        { x: 0, z: 6 },
        { x: 0, z: 16 },
      ],
    });
    const d = makeMove({
      id: 'd',
      teamId: 'blockD',
      path: [
        { x: -2, z: 6 },
        { x: -2, z: 16 },
      ],
    });
    const gateConflicts = computeConflicts(allReservations([c, d], resources), resources, [c, d]);
    expect(gateConflicts.some((x) => x.resourceId === 'gate7' && x.blocking)).toBe(true);
  });
});

describe('approver derivation', () => {
  it('requires every owner of touched resources, excluding the author', () => {
    const reservations = allReservations(INITIAL_MOVES, resources);
    const approvers = requiredApproverTeamIds(reservations, resources, authorTeamId);
    expect(approvers).toEqual(['blockC', 'fnb', 'security']);
  });

  it('returns empty for a plan touching nothing', () => {
    expect(requiredApproverTeamIds([], resources, authorTeamId)).toEqual([]);
  });
});

describe('playback position', () => {
  it('is null outside the window and interpolates inside it', () => {
    const m = makeMove({ tStart: 100, tEnd: 200 });
    expect(posAtTime(m, 99)).toBeNull();
    expect(posAtTime(m, 201)).toBeNull();
    expect(posAtTime(m, 150)).toEqual({ x: 5, z: 0 });
  });
});

describe('time formatting', () => {
  it('formats minutes-of-day as HH:MM', () => {
    expect(fmtTime(780)).toBe('13:00');
    expect(fmtTime(725)).toBe('12:05');
  });
});
