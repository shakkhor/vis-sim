// Human-readable dump of the engine's analysis of the sample plan.
// Unit tests live in src/domain/engine.test.ts — this is a dev convenience.
// Run: npm run smoke
import {
  allReservations,
  computeConflicts,
  fmtTime,
  requiredApproverTeamIds,
} from '../src/domain/engine';
import { INITIAL_MOVES, SAMPLE_SCENE } from '../src/domain/sampleScene';

const { resources, authorTeamId } = SAMPLE_SCENE;
const reservations = allReservations(INITIAL_MOVES, resources);

console.log('Reservations:');
for (const r of reservations) {
  console.log(`  ${r.moveId} → ${r.resourceId}  ${fmtTime(r.t0)}–${fmtTime(r.t1)}`);
}

console.log('\nConflicts:');
for (const c of computeConflicts(reservations, resources, INITIAL_MOVES)) {
  console.log(
    `  ${c.resourceId}: ${c.moveAId} × ${c.moveBId}  ${fmtTime(c.t0)}–${fmtTime(c.t1)}  ${
      c.blocking ? 'BLOCKING' : 'warning'
    }`,
  );
}

console.log(
  '\nRequired approvers:',
  requiredApproverTeamIds(reservations, resources, authorTeamId).join(', '),
);
