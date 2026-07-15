import { describe, expect, it } from 'vitest';
import { allReservations, computeConflicts, requiredApproverTeamIds } from './engine';
import type { Rect } from './types';
import { WAREHOUSE_MOVES, WAREHOUSE_SCENE } from './warehouseScene';

const { resources, authorTeamId } = WAREHOUSE_SCENE;
const reservations = allReservations(WAREHOUSE_MOVES, resources);

/** Ground plane is ~120×90 centered on the origin (same scale as the stadium slice). */
const GROUND: Rect = { x: -60, z: -45, w: 120, d: 90 };

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

describe('warehouse scene layout', () => {
  it('keeps every resource rect within ground bounds', () => {
    for (const r of resources) {
      expect(r.rect.x).toBeGreaterThanOrEqual(GROUND.x);
      expect(r.rect.z).toBeGreaterThanOrEqual(GROUND.z);
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(GROUND.x + GROUND.w);
      expect(r.rect.z + r.rect.d).toBeLessThanOrEqual(GROUND.z + GROUND.d);
    }
  });

  it('has mutually non-overlapping resource rects', () => {
    for (let i = 0; i < resources.length; i++) {
      for (let j = i + 1; j < resources.length; j++) {
        expect(
          overlaps(resources[i].rect, resources[j].rect),
          `${resources[i].id} overlaps ${resources[j].id}`,
        ).toBe(false);
      }
    }
  });
});

describe('warehouse reservations', () => {
  it('derives aisle-mouth reservations for both forklift runs', () => {
    const resourceIds = (moveId: string) =>
      reservations.filter((r) => r.moveId === moveId).map((r) => r.resourceId);
    expect(resourceIds('putaway')).toContain('aisleMouth');
    expect(resourceIds('picking')).toContain('aisleMouth');
  });

  it('keeps the safety walk on the pedestrian walkway only', () => {
    const walkIds = reservations.filter((r) => r.moveId === 'safetyWalk').map((r) => r.resourceId);
    expect(walkIds).toEqual(['walkway']);
  });
});

describe('warehouse conflicts', () => {
  it('detects the deliberate blocking conflict at the aisle mouth', () => {
    const conflicts = computeConflicts(reservations, resources, WAREHOUSE_MOVES);
    const mouth = conflicts.find((c) => c.resourceId === 'aisleMouth');
    expect(mouth).toBeDefined();
    expect(mouth!.blocking).toBe(true);
    expect([mouth!.moveAId, mouth!.moveBId].sort()).toEqual(['picking', 'putaway']);
  });
});

describe('warehouse approver derivation', () => {
  it('requires every owner of touched resources, excluding Inbound Ops', () => {
    const approvers = requiredApproverTeamIds(reservations, resources, authorTeamId);
    expect(approvers).toContain('outbound');
    expect(approvers).toContain('safety');
    expect(approvers).not.toContain('inbound');
    expect(approvers).toEqual(['maintenance', 'outbound', 'safety']);
  });
});
