import { describe, expect, it } from 'vitest';
import { allReservations } from './engine';
import { evaluateRules, PHARMA_CLEAN_ZONE_RULES } from './rules';
import type { Rule } from './rules';
import type { Move, Reservation, Resource } from './types';

const makeResource = (overrides: Partial<Resource>): Resource => ({
  id: 'zone-a',
  name: 'Zone A',
  kind: 'zone',
  rect: { x: 0, z: 0, w: 10, d: 10 },
  ownerTeamIds: ['ops'],
  ...overrides,
});

const makeMove = (overrides: Partial<Move>): Move => ({
  id: 'move-1',
  name: 'test move',
  actorKind: 'material',
  count: 1,
  teamId: 'ops',
  path: [
    { x: -5, z: 5 },
    { x: 15, z: 5 },
  ],
  tStart: 720,
  tEnd: 780,
  ...overrides,
});

const makeReservation = (overrides: Partial<Reservation>): Reservation => ({
  resourceId: 'zone-a',
  moveId: 'move-1',
  t0: 730,
  t1: 750,
  ...overrides,
});

const forbidStaffInSecure: Rule = {
  id: 'no-staff-in-secure',
  description: 'Staff may not enter secure zones',
  kind: 'forbidden-entry',
  actorKinds: ['staff'],
  resourceTags: ['secure'],
};

describe('evaluateRules — forbidden-entry', () => {
  it('flags a reservation by a forbidden actor kind on a tagged resource', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    const moves = [makeMove({ actorKind: 'material' })];
    const reservations = [makeReservation({})];

    const violations = evaluateRules(PHARMA_CLEAN_ZONE_RULES, reservations, moves, resources);

    expect(violations).toEqual([
      {
        ruleId: 'pharma-no-waste-in-clean',
        moveId: 'move-1',
        resourceId: 'zone-a',
        t0: 730,
        t1: 750,
      },
    ]);
  });

  it('matches when any resource tag intersects any rule tag', () => {
    const resources = [makeResource({ tags: ['gowned', 'clean', 'grade-b'] })];
    const violations = evaluateRules(
      PHARMA_CLEAN_ZONE_RULES,
      [makeReservation({})],
      [makeMove({ actorKind: 'vehicle' })],
      resources,
    );
    expect(violations).toHaveLength(1);
  });

  it('does not flag resources without tags', () => {
    const resources = [makeResource({})]; // tags undefined
    const violations = evaluateRules(
      PHARMA_CLEAN_ZONE_RULES,
      [makeReservation({})],
      [makeMove({})],
      resources,
    );
    expect(violations).toEqual([]);
  });

  it('does not flag resources whose tags do not match the rule', () => {
    const resources = [makeResource({ tags: ['dirty', 'loading-dock'] })];
    const violations = evaluateRules(
      PHARMA_CLEAN_ZONE_RULES,
      [makeReservation({})],
      [makeMove({})],
      resources,
    );
    expect(violations).toEqual([]);
  });

  it('does not flag actor kinds outside the rule', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    const violations = evaluateRules(
      PHARMA_CLEAN_ZONE_RULES,
      [makeReservation({})],
      [makeMove({ actorKind: 'staff' })], // rule covers material + vehicle only
      resources,
    );
    expect(violations).toEqual([]);
  });

  it('emits one violation per offending reservation window', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    const moves = [makeMove({})];
    const reservations = [
      makeReservation({ t0: 730, t1: 740 }),
      makeReservation({ t0: 760, t1: 770 }), // path re-enters the zone later
    ];
    const violations = evaluateRules(PHARMA_CLEAN_ZONE_RULES, reservations, moves, resources);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => [v.t0, v.t1])).toEqual([
      [730, 740],
      [760, 770],
    ]);
  });

  it('skips reservations whose move or resource is unknown', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    const moves = [makeMove({})];
    const orphans = [
      makeReservation({ moveId: 'ghost-move' }),
      makeReservation({ resourceId: 'ghost-zone' }),
    ];
    expect(evaluateRules(PHARMA_CLEAN_ZONE_RULES, orphans, moves, resources)).toEqual([]);
  });
});

const separateWasteFromCleanSupply: Rule = {
  id: 'pharma-separate-waste-clean-supply',
  description: 'Waste egress may never share tagged corridors with clean material ingress',
  kind: 'separation',
  teamIdsA: ['waste-ops'],
  teamIdsB: ['clean-supply'],
  resourceTags: ['corridor'],
};

describe('evaluateRules — separation', () => {
  const corridor = makeResource({ id: 'corridor-1', name: 'Corridor 1', tags: ['corridor'] });
  const wasteMove = makeMove({ id: 'waste-egress', teamId: 'waste-ops' });
  const cleanMove = makeMove({ id: 'clean-ingress', teamId: 'clean-supply' });

  it('flags an A/B pair sharing a tagged resource with the overlap window', () => {
    const reservations = [
      makeReservation({ resourceId: 'corridor-1', moveId: 'waste-egress', t0: 730, t1: 760 }),
      makeReservation({ resourceId: 'corridor-1', moveId: 'clean-ingress', t0: 745, t1: 780 }),
    ];

    const violations = evaluateRules(
      [separateWasteFromCleanSupply],
      reservations,
      [wasteMove, cleanMove],
      [corridor],
    );

    expect(violations).toEqual([
      {
        ruleId: 'pharma-separate-waste-clean-supply',
        moveId: 'waste-egress',
        otherMoveId: 'clean-ingress',
        resourceId: 'corridor-1',
        t0: 745,
        t1: 760,
      },
    ]);
  });

  it('does not flag reservations without time overlap', () => {
    const reservations = [
      makeReservation({ resourceId: 'corridor-1', moveId: 'waste-egress', t0: 730, t1: 740 }),
      makeReservation({ resourceId: 'corridor-1', moveId: 'clean-ingress', t0: 750, t1: 760 }),
    ];
    const violations = evaluateRules(
      [separateWasteFromCleanSupply],
      reservations,
      [wasteMove, cleanMove],
      [corridor],
    );
    expect(violations).toEqual([]);
  });

  it('does not flag overlaps on resources without the rule tags', () => {
    const loadingDock = makeResource({ id: 'dock', tags: ['loading-dock'] });
    const reservations = [
      makeReservation({ resourceId: 'dock', moveId: 'waste-egress', t0: 730, t1: 760 }),
      makeReservation({ resourceId: 'dock', moveId: 'clean-ingress', t0: 745, t1: 780 }),
    ];
    const violations = evaluateRules(
      [separateWasteFromCleanSupply],
      reservations,
      [wasteMove, cleanMove],
      [loadingDock],
    );
    expect(violations).toEqual([]);
  });

  it('ignores moves whose team is in neither group', () => {
    const bystander = makeMove({ id: 'fnb-restock', teamId: 'f-and-b' });
    const reservations = [
      makeReservation({ resourceId: 'corridor-1', moveId: 'waste-egress', t0: 730, t1: 760 }),
      makeReservation({ resourceId: 'corridor-1', moveId: 'fnb-restock', t0: 745, t1: 780 }),
    ];
    const violations = evaluateRules(
      [separateWasteFromCleanSupply],
      reservations,
      [wasteMove, bystander],
      [corridor],
    );
    expect(violations).toEqual([]);
  });

  it('does not pair a move with itself when its team is in both groups', () => {
    const bothGroupsRule: Rule = {
      ...separateWasteFromCleanSupply,
      id: 'separate-hybrid',
      teamIdsA: ['hybrid'],
      teamIdsB: ['hybrid'],
    };
    const hybridMove = makeMove({ id: 'hybrid-run', teamId: 'hybrid' });
    const reservations = [
      makeReservation({ resourceId: 'corridor-1', moveId: 'hybrid-run', t0: 730, t1: 760 }),
    ];
    const violations = evaluateRules([bothGroupsRule], reservations, [hybridMove], [corridor]);
    expect(violations).toEqual([]);
  });
});

const oneWayEast: Rule = {
  id: 'corridor-one-way-east',
  description: 'Corridor flows east (+x) only',
  kind: 'unidirectional',
  resourceTags: ['one-way'],
  direction: '+x',
};

describe('evaluateRules — unidirectional', () => {
  // 10×10 corridor at x 0..10; moves below run 1 unit/min so windows are exact.
  const corridor = makeResource({ id: 'oneway-corridor', tags: ['one-way'] });

  /** Derive reservations from the move so t0/t1 ↔ path-fraction mapping is the engine's own. */
  const check = (move: Move, resources: Resource[] = [corridor]) =>
    evaluateRules([oneWayEast], allReservations([move], resources), [move], resources);

  it('passes a move travelling in the allowed direction', () => {
    const eastbound = makeMove({
      path: [
        { x: -5, z: 5 },
        { x: 15, z: 5 },
      ],
      tStart: 720,
      tEnd: 740,
    });
    expect(check(eastbound)).toEqual([]);
  });

  it('flags a move travelling against the direction, with the reservation window', () => {
    const westbound = makeMove({
      id: 'westbound',
      path: [
        { x: 15, z: 5 },
        { x: -5, z: 5 },
      ],
      tStart: 720,
      tEnd: 740, // inside corridor x 0..10 → arc 5..15 of 20 → 725–735
    });
    expect(check(westbound)).toEqual([
      {
        ruleId: 'corridor-one-way-east',
        moveId: 'westbound',
        resourceId: 'oneway-corridor',
        t0: 725,
        t1: 735,
      },
    ]);
  });

  it('passes a perpendicular crossing (dominant axis off the rule axis)', () => {
    const northbound = makeMove({
      path: [
        { x: 5, z: -5 },
        { x: 5, z: 15 },
      ],
      tStart: 720,
      tEnd: 740,
    });
    expect(check(northbound)).toEqual([]);
  });

  it('passes net-zero travel that turns around inside the resource', () => {
    const inAndBack = makeMove({
      path: [
        { x: -5, z: 5 },
        { x: 8, z: 5 },
        { x: -5, z: 5 }, // one merged reservation, entry (0,5) = exit (0,5)
      ],
      tStart: 720,
      tEnd: 746,
    });
    expect(check(inAndBack)).toEqual([]);
  });

  it('judges each crossing of a multi-crossing path independently', () => {
    const thereAndBack = makeMove({
      id: 'there-and-back',
      path: [
        { x: -5, z: 3 },
        { x: 15, z: 3 }, // eastbound crossing: arc 5..15 → 725–735, complies
        { x: 15, z: 7 }, // outside the corridor (x > 10)
        { x: -5, z: 7 }, // westbound crossing: arc 29..39 → 749–759, violates
      ],
      tStart: 720,
      tEnd: 764, // total arc length 44 at 1 unit/min
    });
    const violations = check(thereAndBack);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('corridor-one-way-east');
    expect(violations[0].moveId).toBe('there-and-back');
    expect(violations[0].resourceId).toBe('oneway-corridor');
    expect(violations[0].t0).toBeCloseTo(749, 6);
    expect(violations[0].t1).toBeCloseTo(759, 6);
  });

  it('ignores resources without the rule tags', () => {
    const untagged = makeResource({ id: 'plain-zone', tags: ['clean'] });
    const westbound = makeMove({
      path: [
        { x: 15, z: 5 },
        { x: -5, z: 5 },
      ],
      tStart: 720,
      tEnd: 740,
    });
    expect(check(westbound, [untagged])).toEqual([]);
  });
});

describe('evaluateRules — rule sets', () => {
  it('returns nothing for an empty rule set', () => {
    const resources = [makeResource({ tags: ['clean', 'secure'] })];
    expect(evaluateRules([], [makeReservation({})], [makeMove({})], resources)).toEqual([]);
  });

  it('returns nothing when there are no reservations', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    expect(evaluateRules(PHARMA_CLEAN_ZONE_RULES, [], [makeMove({})], resources)).toEqual([]);
  });

  it('evaluates multiple rules independently over the same reservations', () => {
    const rules: Rule[] = [...PHARMA_CLEAN_ZONE_RULES, forbidStaffInSecure];
    const resources = [
      makeResource({ id: 'cleanroom', tags: ['clean'] }),
      makeResource({ id: 'vault', tags: ['secure'] }),
    ];
    const moves = [
      makeMove({ id: 'waste-run', actorKind: 'material' }),
      makeMove({ id: 'patrol', actorKind: 'staff' }),
    ];
    const reservations = [
      makeReservation({ resourceId: 'cleanroom', moveId: 'waste-run', t0: 740, t1: 750 }),
      makeReservation({ resourceId: 'vault', moveId: 'patrol', t0: 730, t1: 735 }),
      makeReservation({ resourceId: 'vault', moveId: 'waste-run', t0: 760, t1: 765 }), // no rule forbids materials in secure
    ];

    const violations = evaluateRules(rules, reservations, moves, resources);

    expect(violations).toEqual([
      {
        ruleId: 'no-staff-in-secure',
        moveId: 'patrol',
        resourceId: 'vault',
        t0: 730,
        t1: 735,
      },
      {
        ruleId: 'pharma-no-waste-in-clean',
        moveId: 'waste-run',
        resourceId: 'cleanroom',
        t0: 740,
        t1: 750,
      },
    ]);
  });

  it('emits a violation per rule when one reservation breaks several rules', () => {
    const rules: Rule[] = [
      ...PHARMA_CLEAN_ZONE_RULES,
      {
        id: 'no-vehicles-indoors',
        description: 'Vehicles may not enter indoor zones',
        kind: 'forbidden-entry',
        actorKinds: ['vehicle'],
        resourceTags: ['indoor'],
      },
    ];
    const resources = [makeResource({ tags: ['clean', 'indoor'] })];
    const moves = [makeMove({ actorKind: 'vehicle' })];
    const violations = evaluateRules(rules, [makeReservation({})], moves, resources);
    expect(violations.map((v) => v.ruleId).sort()).toEqual([
      'no-vehicles-indoors',
      'pharma-no-waste-in-clean',
    ]);
  });

  it('sorts violations by window start', () => {
    const resources = [makeResource({ tags: ['clean'] })];
    const moves = [makeMove({ id: 'a' }), makeMove({ id: 'b' })];
    const reservations = [
      makeReservation({ moveId: 'a', t0: 800, t1: 810 }),
      makeReservation({ moveId: 'b', t0: 725, t1: 735 }),
    ];
    const violations = evaluateRules(PHARMA_CLEAN_ZONE_RULES, reservations, moves, resources);
    expect(violations.map((v) => v.t0)).toEqual([725, 800]);
  });
});

describe('integration with the reservation engine', () => {
  it('flags a waste move crossing a clean zone using derived reservations', () => {
    const cleanRoom = makeResource({
      id: 'cleanroom',
      name: 'Cleanroom',
      tags: ['clean'],
      rect: { x: 0, z: 0, w: 10, d: 10 },
    });
    const wasteRun = makeMove({
      id: 'waste-egress',
      name: 'Waste egress',
      actorKind: 'material',
      path: [
        { x: -5, z: 5 },
        { x: 15, z: 5 },
      ],
      tStart: 720,
      tEnd: 780,
    });

    const reservations = allReservations([wasteRun], [cleanRoom]);
    const violations = evaluateRules(
      PHARMA_CLEAN_ZONE_RULES,
      reservations,
      [wasteRun],
      [cleanRoom],
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('pharma-no-waste-in-clean');
    expect(violations[0].moveId).toBe('waste-egress');
    expect(violations[0].resourceId).toBe('cleanroom');
    expect(violations[0].t0).toBeGreaterThanOrEqual(wasteRun.tStart);
    expect(violations[0].t1).toBeLessThanOrEqual(wasteRun.tEnd);
    expect(violations[0].t0).toBeLessThan(violations[0].t1);
  });
});
