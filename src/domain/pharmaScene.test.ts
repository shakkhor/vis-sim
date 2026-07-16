// Expected values below are computed analytically from the scene geometry: the engine clips
// each path segment against each rect (Liang–Barsky) and maps arc-length fractions onto the
// move's time window. Layout credit: modelled on a real GMP personnel/material-flow floor plan
// (Incepta Pharmaceuticals, Unit-17).
import { describe, expect, it } from 'vitest';
import {
  allReservations,
  computeConflicts,
  requiredApproverTeamIds,
  reservationsForMove,
} from './engine';
import { PHARMA_MOVES, PHARMA_SCENE } from './pharmaScene';
import { evaluateRules } from './rules';
import type { Move, Rect } from './types';

const reservations = allReservations(PHARMA_MOVES, PHARMA_SCENE.resources);
const conflicts = computeConflicts(reservations, PHARMA_SCENE.resources, PHARMA_MOVES);
const violations = evaluateRules(
  PHARMA_SCENE.rules ?? [],
  reservations,
  PHARMA_MOVES,
  PHARMA_SCENE.resources,
);

const moveById = (id: string): Move => {
  const move = PHARMA_MOVES.find((m) => m.id === id);
  if (!move) throw new Error(`missing move ${id}`);
  return move;
};

/** Resource ids a move occupies, in order of first entry. */
const sequenceFor = (moveId: string): string[] =>
  reservationsForMove(moveById(moveId), PHARMA_SCENE.resources)
    .sort((a, b) => a.t0 - b.t0)
    .map((r) => r.resourceId);

describe('PHARMA_SCENE layout', () => {
  it('keeps every resource rect inside the scene bounds', () => {
    for (const { rect } of PHARMA_SCENE.resources) {
      expect(rect.x).toBeGreaterThanOrEqual(-60);
      expect(rect.x + rect.w).toBeLessThanOrEqual(60);
      expect(rect.z).toBeGreaterThanOrEqual(-45);
      expect(rect.z + rect.d).toBeLessThanOrEqual(45);
    }
  });

  it('has pairwise non-overlapping resource rects', () => {
    const resources = PHARMA_SCENE.resources;
    for (let i = 0; i < resources.length; i++) {
      for (let j = i + 1; j < resources.length; j++) {
        const a = resources[i].rect;
        const b = resources[j].rect;
        const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
        expect(overlaps, `${resources[i].id} overlaps ${resources[j].id}`).toBe(false);
      }
    }
  });

  it('keeps every move inside the day window', () => {
    for (const move of PHARMA_MOVES) {
      expect(move.tStart).toBeGreaterThanOrEqual(PHARMA_SCENE.dayStart);
      expect(move.tEnd).toBeLessThanOrEqual(PHARMA_SCENE.dayEnd);
      expect(move.tStart).toBeLessThan(move.tEnd);
    }
  });
});

describe('PHARMA_SCENE blocks', () => {
  const blocks = PHARMA_SCENE.blocks ?? [];
  const connectors = PHARMA_SCENE.resources.filter((r) => r.kind === 'connector');

  /** Strict-inequality overlap: rects that merely share an edge do not overlap. */
  const rectsOverlap = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

  it('defines blocks with unique ids', () => {
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it('gives every block a finite, positive footprint and height', () => {
    for (const b of blocks) {
      expect(Number.isFinite(b.rect.x), `${b.id} x is finite`).toBe(true);
      expect(Number.isFinite(b.rect.z), `${b.id} z is finite`).toBe(true);
      for (const [label, value] of [
        ['w', b.rect.w],
        ['d', b.rect.d],
        ['height', b.height],
      ] as const) {
        expect(Number.isFinite(value), `${b.id} ${label} is finite`).toBe(true);
        expect(value, `${b.id} ${label} is positive`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps ground-level block footprints clear of every airlock connector', () => {
    for (const b of blocks) {
      if ((b.y ?? 0) > 0) continue; // elevated blocks may span connectors (none here today)
      for (const c of connectors) {
        expect(rectsOverlap(b.rect, c.rect), `${b.id} intersects ${c.id}`).toBe(false);
      }
    }
  });
});

describe('PHARMA_MOVES reservation sequences', () => {
  it('operators pass change rooms → corridor-1 → PAL-1 → blending', () => {
    expect(sequenceFor('gowningToBlending')).toEqual([
      'changeRooms',
      'corridor1',
      'pal1',
      'blending',
    ]);
  });

  it('dispensed materials pass store rooms → MAL-1 → dispensing → blending', () => {
    expect(sequenceFor('dispensedToBlending')).toEqual([
      'storeRooms',
      'mal1',
      'dispensing',
      'blending',
    ]);
  });

  it('waste egress passes blending → corridor-1 → WAL-1 → waste disposal room', () => {
    expect(sequenceFor('wasteEgress')).toEqual(['blending', 'corridor1', 'wal1', 'wasteRoom']);
  });

  it('QA line clearance passes corridor-1 → PAL-1 → blending → dispensing', () => {
    expect(sequenceFor('qaLineClearance')).toEqual(['corridor1', 'pal1', 'blending', 'dispensing']);
  });

  it('packaging changeover passes corridor-2 → packaging area', () => {
    expect(sequenceFor('packagingChangeover')).toEqual(['corridor2', 'packaging']);
  });
});

describe('shipped plan — the deliberate demo violation', () => {
  it('flags waste egress meeting the dispensed batch in blending', () => {
    expect(violations).toHaveLength(1);
    const violation = violations[0];
    expect(violation.ruleId).toBe('pharma-waste-material-segregation');
    expect(violation.moveId).toBe('wasteEgress');
    expect(violation.otherMoveId).toBe('dispensedToBlending');
    expect(violation.resourceId).toBe('blending');
    // Waste holds blending 10:48–10:50; the dispensed batch holds it 10:43–11:00.
    expect(violation.t0).toBeCloseTo(648, 2); // 10:48 — waste starts leaving blending
    expect(violation.t1).toBeCloseTo(650, 2); // 10:50 — waste exits into the gap toward corridor-1
    expect(violation.t0).toBeLessThan(violation.t1);
  });

  it('places the violation on a resource carrying a rule tag', () => {
    const blending = PHARMA_SCENE.resources.find((r) => r.id === 'blending');
    expect(blending?.tags).toContain('clean');
  });

  it('has no blocking connector conflicts — the rule violation is the star', () => {
    expect(conflicts.filter((c) => c.blocking)).toEqual([]);
  });

  it('warns on the qa/production blending overlap (warning tier)', () => {
    const warning = conflicts.find(
      (c) =>
        c.resourceId === 'blending' &&
        [c.moveAId, c.moveBId].sort().join(',') === 'gowningToBlending,qaLineClearance',
    );
    expect(warning).toBeDefined();
    expect(warning?.blocking).toBe(false);
    // QA enters blending at 08:51; the operators occupy it until 08:54.
    expect(warning?.t0).toBeCloseTo(531, 2);
    expect(warning?.t1).toBeCloseTo(534, 2);
  });

  it('raises no conflicts beyond the QA warning and the violation-shadowing overlap', () => {
    // The waste/materials blending overlap 10:48–10:50 also surfaces as a zone warning; the
    // separation rule upgrades that same window to a violation. Nothing else may conflict.
    expect(conflicts).toHaveLength(2);
    const shadow = conflicts.find(
      (c) => [c.moveAId, c.moveBId].sort().join(',') === 'dispensedToBlending,wasteEgress',
    );
    expect(shadow?.resourceId).toBe('blending');
    expect(shadow?.blocking).toBe(false);
  });

  it('walks corridor-2 with the one-way flow — the changeover contributes no violation', () => {
    // Shipped changeover: enters corridor-2 at (-9,20), exits north at (36,24) —
    // net travel +45x/+4z, dominant +x, matching the east-only rule. The single
    // shipped violation (asserted above) is the separation breach, so the
    // unidirectional rule stays silent on the shipped plan.
    expect(violations.filter((v) => v.ruleId === 'pharma-oneway-corridor2')).toEqual([]);
  });

  it('flags exactly one unidirectional violation when the changeover walk is reversed', () => {
    const reversed = PHARMA_MOVES.map((m) =>
      m.id === 'packagingChangeover' ? { ...m, path: [...m.path].reverse() } : m,
    );
    const reversedReservations = allReservations(reversed, PHARMA_SCENE.resources);
    const reversedViolations = evaluateRules(
      PHARMA_SCENE.rules ?? [],
      reversedReservations,
      reversed,
      PHARMA_SCENE.resources,
    );
    const oneWay = reversedViolations.filter((v) => v.ruleId === 'pharma-oneway-corridor2');
    expect(oneWay).toHaveLength(1);
    expect(oneWay[0].moveId).toBe('packagingChangeover');
    expect(oneWay[0].resourceId).toBe('corridor2');
    // Reversed walk: packaging → (36,24) into corridor-2 at arc 11 of 60 (09:31),
    // west along the spine until the move ends at (-9,20) at 10:20.
    expect(oneWay[0].t0).toBeCloseTo(571, 6);
    expect(oneWay[0].t1).toBeCloseTo(620, 6);
    // The reversal changes nothing else: the separation breach still stands alone.
    expect(reversedViolations).toHaveLength(2);
    expect(
      reversedViolations.filter((v) => v.ruleId === 'pharma-waste-material-segregation'),
    ).toHaveLength(1);
  });

  it('clears all violations when waste egress is retimed 30 minutes later', () => {
    const retimed = PHARMA_MOVES.map((m) =>
      m.id === 'wasteEgress' ? { ...m, tStart: m.tStart + 30, tEnd: m.tEnd + 30 } : m,
    );
    const shifted = retimed.find((m) => m.id === 'wasteEgress');
    expect(shifted?.tEnd).toBeLessThanOrEqual(PHARMA_SCENE.dayEnd); // still inside the day
    const retimedReservations = allReservations(retimed, PHARMA_SCENE.resources);
    const retimedViolations = evaluateRules(
      PHARMA_SCENE.rules ?? [],
      retimedReservations,
      retimed,
      PHARMA_SCENE.resources,
    );
    expect(retimedViolations).toEqual([]);
  });
});

describe('shipped plan — approvals', () => {
  it('requires owners of every touched resource minus the authoring team', () => {
    // Touched owners: changeRooms{production}, corridor1/corridor2/pal1/dispensing{production,qa},
    // mal1{materials,production}, wal1{waste,production}, blending/packaging{production},
    // storeRooms{materials}, wasteRoom{waste}. (interimStore is untouched context.)
    const approvers = requiredApproverTeamIds(
      reservations,
      PHARMA_SCENE.resources,
      PHARMA_SCENE.authorTeamId,
    );
    expect(approvers).toEqual(['materials', 'qa', 'waste']);
  });
});
