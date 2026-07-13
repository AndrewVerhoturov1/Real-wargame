import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/testing/AiStatePlanVisualQaHarness.ts';
const source = await readFile(path, 'utf8');
const next = source.replace(
  '        ? snapshotFromSession(activeScenario, session, unit.behaviorRuntime.lastEvent)',
  "        ? snapshotFromSession(activeScenario, session, unit.behaviorRuntime.lastEvent ?? '')",
);
if (next === source) throw new Error('Visual QA harness nullability patch target was not found.');
await writeFile(path, next);
console.log('AI state/plan visual QA harness nullability fixed.');
// Separate push ensures the already-registered temporary workflow runs.
