// Integration suite: the complete flagship loop (PRODUCT_PLAN.md §6) at the domain
// level — ship a plan, see the blocking conflict on the shared connector, see who
// must approve, resolve by retiming, round-trip through serialization, and confirm
// the rules engine has nothing to complain about. The table-driven loop runs for the
// stadium and warehouse scenes; the pharma scene ships a rule violation instead of a
// blocking conflict, so it tells the same story in its own violation-centric block.
import { describe, expect, it } from 'vitest';
import { allReservations, computeConflicts, requiredApproverTeamIds } from './engine';
import { PHARMA_MOVES, PHARMA_SCENE } from './pharmaScene';
import { evaluateRules } from './rules';
import { INITIAL_MOVES, SAMPLE_SCENE } from './sampleScene';
import { deserializePlan, serializePlan, PLAN_FORMAT_VERSION } from './serialization';
import type { PlanDocument } from './serialization';
import type { Conflict, Move, SceneDef } from './types';
import { WAREHOUSE_MOVES, WAREHOUSE_SCENE } from './warehouseScene';

/** Everything the loop derives from a (scene, moves) pair. Pure + deterministic. */
function analyze(scene: SceneDef, moves: Move[]) {
  const reservations = allReservations(moves, scene.resources);
  const conflicts = computeConflicts(reservations, scene.resources, moves);
  return {
    reservations,
    conflicts,
    blocking: conflicts.filter((c) => c.blocking),
    approvers: requiredApproverTeamIds(reservations, scene.resources, scene.authorTeamId),
  };
}

/** Retime one move, leaving path/actor/team untouched — the canonical resolution edit. */
function retime(moves: Move[], moveId: string, tStart: number, tEnd: number): Move[] {
  return moves.map((m) => (m.id === moveId ? { ...m, tStart, tEnd } : m));
}

interface LoopScenario {
  title: string;
  scene: SceneDef;
  shippedMoves: Move[];
  connectorId: string;
  /** The two moves expected to collide on the connector (order-independent). */
  collidingMoveIds: [string, string];
  expectedApprovers: string[];
  /** The resolution: retime this move to [tStart, tEnd]. */
  retimedMoveId: string;
  retimedWindow: [number, number];
}

const SCENARIOS: LoopScenario[] = [
  {
    title: 'stadium — Gate 7 slice',
    scene: SAMPLE_SCENE,
    shippedMoves: INITIAL_MOVES,
    connectorId: 'gate7',
    collidingMoveIds: ['ingressD', 'fnbRestock'],
    // Reservations touch plaza (security), gate7 (blockC+blockD), dconc (blockD),
    // fnbstore + kioskd (fnb); author blockD is excluded.
    expectedApprovers: ['blockC', 'fnb', 'security'],
    // Ingress holds Gate 7 ~13:43–14:01; pushing the restock to 15:00–15:30 clears it.
    retimedMoveId: 'fnbRestock',
    retimedWindow: [900, 930],
  },
  {
    title: 'warehouse — Aisle mouth slice',
    scene: WAREHOUSE_SCENE,
    shippedMoves: WAREHOUSE_MOVES,
    connectorId: 'aisleMouth',
    collidingMoveIds: ['putaway', 'picking'],
    // Reservations touch dock1 + staging (inbound), aisleMouth (inbound+outbound),
    // racking (maintenance), dock2 (outbound), walkway (safety); author inbound excluded.
    expectedApprovers: ['maintenance', 'outbound', 'safety'],
    // Putaway holds the aisle mouth ~09:26–09:32 and the racking aisle ~09:35–10:00.
    // Retimed to 10:10–11:10, picking holds the aisle mouth ~10:39–10:47 (clear of
    // putaway by >1h) and the racking aisle 10:10–~10:36 (putaway left it at 10:00).
    retimedMoveId: 'picking',
    retimedWindow: [610, 670],
  },
];

function expectSameConflictPair(conflict: Conflict, moveIds: [string, string]): void {
  expect([conflict.moveAId, conflict.moveBId].sort()).toEqual([...moveIds].sort());
}

for (const scenario of SCENARIOS) {
  const {
    title,
    scene,
    shippedMoves,
    connectorId,
    collidingMoveIds,
    expectedApprovers,
    retimedMoveId,
    retimedWindow,
  } = scenario;

  describe(`flagship loop — ${title}`, () => {
    const shipped = analyze(scene, shippedMoves);
    const resolvedMoves = retime(shippedMoves, retimedMoveId, retimedWindow[0], retimedWindow[1]);
    const resolved = analyze(scene, resolvedMoves);

    it('ships with exactly one blocking conflict, on the shared connector', () => {
      expect(shipped.blocking).toHaveLength(1);
      const conflict = shipped.blocking[0];
      expect(conflict.resourceId).toBe(connectorId);
      expect(scene.resources.find((r) => r.id === connectorId)?.kind).toBe('connector');
      expectSameConflictPair(conflict, collidingMoveIds);
      expect(conflict.t0).toBeLessThan(conflict.t1);
    });

    it('requires approval from every touched team except the author', () => {
      expect(shipped.approvers).toEqual(expectedApprovers);
      expect(shipped.approvers).not.toContain(scene.authorTeamId);
    });

    it('retiming the offending move clears blocking conflicts without changing approvers', () => {
      expect(resolved.blocking).toEqual([]);
      // Subtle invariant: a pure retime keeps the move on the same path, so it
      // touches the same resources — the approver set must be byte-for-byte stable.
      expect(resolved.approvers).toEqual(shipped.approvers);
    });

    it('round-trips the resolved plan losslessly and reproduces its conflicts', () => {
      const doc: PlanDocument = {
        formatVersion: PLAN_FORMAT_VERSION,
        scene,
        moves: resolvedMoves,
        meta: { name: `${scene.name} — resolved`, exportedAt: '2026-07-15T00:00:00.000Z' },
      };
      const restored = deserializePlan(serializePlan(doc));

      expect(restored.formatVersion).toBe(PLAN_FORMAT_VERSION);
      expect(restored.meta).toEqual(doc.meta);
      expect(restored.moves).toEqual(resolvedMoves);
      expect(restored.scene.id).toBe(scene.id);
      expect(restored.scene.name).toBe(scene.name);
      expect(restored.scene.authorTeamId).toBe(scene.authorTeamId);
      expect(restored.scene.dayStart).toBe(scene.dayStart);
      expect(restored.scene.dayEnd).toBe(scene.dayEnd);
      expect(restored.scene.teams).toEqual(scene.teams);
      expect(restored.scene.resources).toEqual(scene.resources);
      expect(restored.scene.rules).toEqual(scene.rules);
      expect(restored.scene.blocks).toEqual(scene.blocks);

      const reAnalyzed = analyze(restored.scene, restored.moves);
      expect(reAnalyzed.conflicts).toEqual(resolved.conflicts);
      expect(reAnalyzed.blocking).toEqual([]);
      expect(reAnalyzed.approvers).toEqual(resolved.approvers);
    });

    it('evaluates the scene rules over the resolved plan with zero violations', () => {
      const violations = evaluateRules(
        scene.rules ?? [],
        resolved.reservations,
        resolvedMoves,
        scene.resources,
      );
      expect(violations).toEqual([]);
    });
  });
}

// The pharma slice inverts the defect: the shipped plan is clean of blocking
// conflicts, but the waste egress leaves the blender (10:48–10:50) while the
// dispensed batch is still charging in (10:43–11:00) — a breach of the
// waste/material separation rule. Here the rules engine, not the conflict
// engine, is what gates publishing; the loop otherwise reads the same.
describe('flagship loop — pharma — waste/material separation slice', () => {
  const scene = PHARMA_SCENE;
  const shipped = analyze(scene, PHARMA_MOVES);
  const shippedViolations = evaluateRules(
    scene.rules ?? [],
    shipped.reservations,
    PHARMA_MOVES,
    scene.resources,
  );
  // Resolution: hold the waste egress +30min (11:18–11:58) so it collects from
  // the blender only after the charge-in releases it at 11:00.
  const resolvedMoves = retime(PHARMA_MOVES, 'wasteEgress', 678, 718);
  const resolved = analyze(scene, resolvedMoves);
  const resolvedViolations = evaluateRules(
    scene.rules ?? [],
    resolved.reservations,
    resolvedMoves,
    scene.resources,
  );

  it('ships with zero blocking conflicts but exactly one separation violation', () => {
    expect(shipped.blocking).toEqual([]);

    expect(shippedViolations).toHaveLength(1);
    const violation = shippedViolations[0];
    expect(violation.ruleId).toBe('pharma-waste-material-segregation');
    expect([violation.moveId, violation.otherMoveId].sort()).toEqual([
      'dispensedToBlending',
      'wasteEgress',
    ]);
    expect(violation.resourceId).toBe('blending');
    expect(violation.t0).toBeLessThan(violation.t1);
    expect(violation.t0).toBeCloseTo(648, 6); // 10:48 — waste enters the blender
    expect(violation.t1).toBeCloseTo(650, 6); // 10:50 — waste leaves for corridor-1

    // QA's line clearance crosses blending during production's settle-in: a
    // cross-team zone overlap, so a warning — never a blocker.
    const warning = shipped.conflicts.find(
      (c) =>
        !c.blocking &&
        c.resourceId === 'blending' &&
        [c.moveAId, c.moveBId].sort().join('|') === 'gowningToBlending|qaLineClearance',
    );
    expect(warning).toBeDefined();
  });

  it('requires approval from materials, qa and waste — never the authoring team', () => {
    expect(shipped.approvers).toEqual(['materials', 'qa', 'waste']);
    expect(shipped.approvers).not.toContain(scene.authorTeamId);
  });

  it('retiming the waste egress clears the violation without changing approvers', () => {
    expect(resolvedViolations).toEqual([]);
    expect(resolved.blocking).toEqual([]);
    // A pure retime keeps the move on the same path, so it touches the same
    // resources — the approver set must be byte-for-byte stable.
    expect(resolved.approvers).toEqual(shipped.approvers);
    expect(resolved.approvers).toEqual(['materials', 'qa', 'waste']);
  });

  it('round-trips the resolved plan losslessly and still evaluates to zero violations', () => {
    const doc: PlanDocument = {
      formatVersion: PLAN_FORMAT_VERSION,
      scene,
      moves: resolvedMoves,
      meta: { name: `${scene.name} — resolved`, exportedAt: '2026-07-15T00:00:00.000Z' },
    };
    const restored = deserializePlan(serializePlan(doc));

    expect(restored.formatVersion).toBe(PLAN_FORMAT_VERSION);
    expect(restored.meta).toEqual(doc.meta);
    expect(restored.moves).toEqual(resolvedMoves);
    expect(restored.scene.id).toBe(scene.id);
    expect(restored.scene.name).toBe(scene.name);
    expect(restored.scene.authorTeamId).toBe(scene.authorTeamId);
    expect(restored.scene.dayStart).toBe(scene.dayStart);
    expect(restored.scene.dayEnd).toBe(scene.dayEnd);
    expect(restored.scene.teams).toEqual(scene.teams);
    expect(restored.scene.resources).toEqual(scene.resources);
    expect(restored.scene.rules).toEqual(scene.rules);
    expect(restored.scene.blocks).toEqual(scene.blocks);

    const reAnalyzed = analyze(restored.scene, restored.moves);
    expect(reAnalyzed.blocking).toEqual([]);
    expect(reAnalyzed.approvers).toEqual(resolved.approvers);
    // Rules ride along in the wire format, so the restored document alone is
    // enough to re-check compliance against the restored geometry and moves.
    const reViolations = evaluateRules(
      restored.scene.rules ?? [],
      reAnalyzed.reservations,
      restored.moves,
      restored.scene.resources,
    );
    expect(reViolations).toEqual([]);
  });
});
