// Data-driven rules engine — pure functions, no rendering (PRODUCT_PLAN.md §4.3).
// Rules are data, not code: this is how the core stays domain-agnostic. New rule
// kinds are added as new members of the `Rule` discriminated union plus one
// evaluator branch below — no changes to callers required.

import type {
  ForbiddenEntryRule,
  Move,
  Reservation,
  Resource,
  Rule,
  RuleViolation,
  SeparationRule,
} from './types';

// Rule types live in types.ts (the single home for domain types); re-exported
// here so rule consumers can keep importing them alongside `evaluateRules`.
export type { ForbiddenEntryRule, Rule, RuleViolation, SeparationRule } from './types';

function tagsIntersect(resource: Resource, tags: string[]): boolean {
  return (resource.tags ?? []).some((t) => tags.includes(t));
}

function evaluateForbiddenEntry(
  rule: ForbiddenEntryRule,
  reservations: Reservation[],
  moveById: Map<string, Move>,
  resourceById: Map<string, Resource>,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const reservation of reservations) {
    const move = moveById.get(reservation.moveId);
    const resource = resourceById.get(reservation.resourceId);
    if (!move || !resource) continue;
    if (!rule.actorKinds.includes(move.actorKind)) continue;
    if (!tagsIntersect(resource, rule.resourceTags)) continue;
    violations.push({
      ruleId: rule.id,
      moveId: move.id,
      resourceId: resource.id,
      t0: reservation.t0,
      t1: reservation.t1,
    });
  }
  return violations;
}

function evaluateSeparation(
  rule: SeparationRule,
  reservations: Reservation[],
  moveById: Map<string, Move>,
  resourceById: Map<string, Resource>,
): RuleViolation[] {
  // Group reservations on tagged resources so pairing is per-resource.
  const byResource = new Map<string, Reservation[]>();
  for (const reservation of reservations) {
    const resource = resourceById.get(reservation.resourceId);
    if (!resource || !moveById.has(reservation.moveId)) continue;
    if (!tagsIntersect(resource, rule.resourceTags)) continue;
    const group = byResource.get(reservation.resourceId);
    if (group) group.push(reservation);
    else byResource.set(reservation.resourceId, [reservation]);
  }
  const violations: RuleViolation[] = [];
  const seenPairs = new Set<string>();
  for (const [resourceId, group] of byResource) {
    for (const a of group) {
      const moveA = moveById.get(a.moveId)!;
      if (!rule.teamIdsA.includes(moveA.teamId)) continue;
      for (const b of group) {
        if (b.moveId === a.moveId) continue; // a move never pairs with itself
        const moveB = moveById.get(b.moveId)!;
        if (!rule.teamIdsB.includes(moveB.teamId)) continue;
        const t0 = Math.max(a.t0, b.t0);
        const t1 = Math.min(a.t1, b.t1);
        if (t0 >= t1) continue; // touching windows do not co-occupy
        // One violation per offending pair: when both moves belong to both
        // groups the mirrored (b, a) match is the same pair — skip it.
        const pairKey = `${[a.moveId, b.moveId].sort().join('|')}|${resourceId}|${t0}|${t1}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        violations.push({
          ruleId: rule.id,
          moveId: a.moveId,
          otherMoveId: b.moveId,
          resourceId,
          t0,
          t1,
        });
      }
    }
  }
  return violations;
}

/**
 * Check every reservation against every rule. Reservations stay derived-from-moves
 * (engine.ts); this layer only judges them. Violations are conceptually blocking —
 * unlike warning-level conflicts, a plan with violations should never publish.
 */
export function evaluateRules(
  rules: Rule[],
  reservations: Reservation[],
  moves: Move[],
  resources: Resource[],
): RuleViolation[] {
  const moveById = new Map(moves.map((m) => [m.id, m]));
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    switch (rule.kind) {
      case 'forbidden-entry': {
        violations.push(...evaluateForbiddenEntry(rule, reservations, moveById, resourceById));
        break;
      }
      case 'separation': {
        violations.push(...evaluateSeparation(rule, reservations, moveById, resourceById));
        break;
      }
      default: {
        // Exhaustiveness guard: adding a Rule kind without an evaluator fails to compile.
        const unreachable: never = rule;
        throw new Error(`Unhandled rule kind: ${String(unreachable)}`);
      }
    }
  }
  return violations.sort((a, b) => a.t0 - b.t0 || a.ruleId.localeCompare(b.ruleId));
}

/**
 * Example rule set: the pharma case from PRODUCT_PLAN.md §4.3 — "waste actors
 * may never enter zones tagged `clean`". Waste flows are modelled today as
 * material units (waste containers) and vehicles (waste trucks).
 */
export const PHARMA_CLEAN_ZONE_RULES: Rule[] = [
  {
    id: 'pharma-no-waste-in-clean',
    description: "Waste actors (materials, vehicles) may never enter zones tagged 'clean'",
    kind: 'forbidden-entry',
    actorKinds: ['material', 'vehicle'],
    resourceTags: ['clean'],
  },
];
