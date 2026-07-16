// Derived state — the analysis layer between the domain engine and the UI.
import { useMemo } from 'react';
import { useVisSim } from './store';
import { allReservations, computeConflicts, requiredApproverTeamIds } from '../domain/engine';
import { evaluateRules } from '../domain/rules';
import type { Conflict, Reservation, RuleViolation } from '../domain/types';

export interface PlanAnalysis {
  reservations: Reservation[];
  conflicts: Conflict[];
  blockingConflicts: Conflict[];
  approverTeamIds: string[];
  violations: RuleViolation[];
}

/** Recomputes reservations → conflicts → violations → approvers whenever the plan changes. */
export function usePlanAnalysis(): PlanAnalysis {
  const moves = useVisSim((s) => s.moves);
  const scene = useVisSim((s) => s.scene);
  return useMemo(() => {
    const reservations = allReservations(moves, scene.resources);
    const conflicts = computeConflicts(reservations, scene.resources, moves);
    return {
      reservations,
      conflicts,
      blockingConflicts: conflicts.filter((c) => c.blocking),
      approverTeamIds: requiredApproverTeamIds(reservations, scene.resources, scene.authorTeamId),
      violations: evaluateRules(scene.rules ?? [], reservations, moves, scene.resources),
    };
  }, [moves, scene]);
}

/** Everything the viewport needs to render one team's perspective (plan §5.4). */
export interface TeamFocus {
  teamId: string;
  /** Resources the focused team (co-)owns — framed and highlighted. */
  ownedResourceIds: Set<string>;
  /** Moves the team executes, plus moves holding a reservation on owned resources. */
  relevantMoveIds: Set<string>;
}

/**
 * "View as team" focus, derived from the store's focusTeamId and the plan
 * analysis' reservations (pass `usePlanAnalysis().reservations` so the
 * reservation sweep runs once per plan change, not once per consumer).
 */
export function useTeamFocus(reservations: Reservation[]): TeamFocus | null {
  const focusTeamId = useVisSim((s) => s.focusTeamId);
  const moves = useVisSim((s) => s.moves);
  const scene = useVisSim((s) => s.scene);
  return useMemo(() => {
    if (!focusTeamId) return null;
    const ownedResourceIds = new Set(
      scene.resources.filter((r) => r.ownerTeamIds.includes(focusTeamId)).map((r) => r.id),
    );
    const relevantMoveIds = new Set(moves.filter((m) => m.teamId === focusTeamId).map((m) => m.id));
    for (const res of reservations) {
      if (ownedResourceIds.has(res.resourceId)) relevantMoveIds.add(res.moveId);
    }
    return { teamId: focusTeamId, ownedResourceIds, relevantMoveIds };
  }, [focusTeamId, moves, scene, reservations]);
}
