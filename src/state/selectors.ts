// Derived state — the analysis layer between the domain engine and the UI.
import { useMemo } from 'react';
import { useVisSim } from './store';
import { allReservations, computeConflicts, requiredApproverTeamIds } from '../domain/engine';
import type { Conflict, Reservation } from '../domain/types';

export interface PlanAnalysis {
  reservations: Reservation[];
  conflicts: Conflict[];
  blockingConflicts: Conflict[];
  approverTeamIds: string[];
}

/** Recomputes reservations → conflicts → approvers whenever the plan changes. */
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
    };
  }, [moves, scene]);
}
