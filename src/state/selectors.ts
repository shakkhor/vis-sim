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
