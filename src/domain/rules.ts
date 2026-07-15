// Data-driven rules engine — pure functions, no rendering (PRODUCT_PLAN.md §4.3).
// Rules are data, not code: this is how the core stays domain-agnostic. New rule
// kinds are added as new members of the `Rule` discriminated union plus one
// evaluator branch below — no changes to callers required.

import type { ActorKind, Move, Reservation, Resource } from './types';

/**
 * Actors of `actorKinds` may never hold a reservation on a resource carrying
 * any of `resourceTags`. Example: waste flows forbidden in clean zones (pharma).
 */
export interface ForbiddenEntryRule {
  id: string;
  description: string;
  kind: 'forbidden-entry';
  actorKinds: ActorKind[];
  resourceTags: string[];
}

/**
 * The rule vocabulary. Extend by adding new discriminated-union members here
 * (e.g. `SeparationRule`, `CapacityRule`) and handling them in `evaluateRules`.
 */
export type Rule = ForbiddenEntryRule;

/** A rule broken by a specific reservation. Conceptually always blocking. */
export interface RuleViolation {
  ruleId: string;
  moveId: string;
  resourceId: string;
  /** Reservation window during which the rule is violated (minutes-of-day). */
  t0: number;
  t1: number;
}

function tagsIntersect(resource: Resource, tags: string[]): boolean {
  return (resource.tags ?? []).some((t) => tags.includes(t));
}

function evaluateForbiddenEntry(
  rule: ForbiddenEntryRule,
  reservation: Reservation,
  move: Move,
  resource: Resource,
): RuleViolation | null {
  if (!rule.actorKinds.includes(move.actorKind)) return null;
  if (!tagsIntersect(resource, rule.resourceTags)) return null;
  return {
    ruleId: rule.id,
    moveId: move.id,
    resourceId: resource.id,
    t0: reservation.t0,
    t1: reservation.t1,
  };
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
  for (const reservation of reservations) {
    const move = moveById.get(reservation.moveId);
    const resource = resourceById.get(reservation.resourceId);
    if (!move || !resource) continue;
    for (const rule of rules) {
      switch (rule.kind) {
        case 'forbidden-entry': {
          const violation = evaluateForbiddenEntry(rule, reservation, move, resource);
          if (violation) violations.push(violation);
          break;
        }
        default: {
          // Exhaustiveness guard: adding a Rule kind without an evaluator fails to compile.
          const unreachable: never = rule.kind;
          throw new Error(`Unhandled rule kind: ${String(unreachable)}`);
        }
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
