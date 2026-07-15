import fs from 'node:fs';
import process from 'node:process';

const evidencePath = process.argv[2];
if (!evidencePath) {
  console.error('Usage: node scripts/assert_danger_layer_movement_evidence.mjs <movement.json>');
  process.exit(2);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const failures = [];
const wall = evidence.scenarios?.find((scenario) => scenario.scenario === 'wall-crossing');

if (!wall) {
  failures.push('wall-crossing evidence is missing');
} else {
  const before = wall.before;
  const after = wall.after;
  const beforeThreat = before?.subjectiveThreatPosition;
  const afterThreat = after?.subjectiveThreatPosition;
  const observerX = after?.observerPosition?.x;

  if (!beforeThreat || !afterThreat || !Number.isFinite(observerX)) {
    failures.push('wall-crossing subjective positions are incomplete');
  } else {
    if (!(beforeThreat.x > observerX + 2)) {
      failures.push(`initial subjective threat is not east of observer: ${beforeThreat.x} <= ${observerX + 2}`);
    }
    if (!(afterThreat.x < observerX - 2)) {
      failures.push(`final subjective threat did not cross west of observer/wall: ${afterThreat.x} >= ${observerX - 2}`);
    }
  }

  if (before?.subjectiveThreatVisibleNow !== true || after?.subjectiveThreatVisibleNow !== true) {
    failures.push('wall-crossing hostile was not visually tracked on both final sides');
  }
  if (!before?.bestSafePosition || !after?.bestSafePosition) {
    failures.push('wall-crossing safe winner is missing');
  } else if (JSON.stringify(before.bestSafePosition) === JSON.stringify(after.bestSafePosition)) {
    failures.push('wall-crossing safe winner did not flip');
  }
  if (!after?.protectedAgainstThreatId) {
    failures.push('final wall-crossing winner lost protectedAgainstThreatId');
  }
  if (wall.counters?.finalKeyApplied !== true) {
    failures.push('final wall-crossing raster key was not applied');
  }
  if ((wall.counters?.maxPendingQueueDepth ?? Infinity) > 1) {
    failures.push(`wall-crossing pending queue exceeded one: ${wall.counters?.maxPendingQueueDepth}`);
  }
}

if (evidence.build?.performanceContractVersion !== 'performance-report-v4') {
  failures.push(`unexpected performance contract: ${evidence.build?.performanceContractVersion ?? 'missing'}`);
}
if (!evidence.build?.commitSha) failures.push('movement evidence commit SHA is missing');

if (failures.length > 0) {
  console.error('Danger layer movement evidence assertion failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Danger layer movement evidence assertion passed.');
