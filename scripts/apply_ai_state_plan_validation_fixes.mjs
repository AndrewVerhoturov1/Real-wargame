import { readFile, writeFile } from 'node:fs/promises';

async function replaceText(path, search, replacement) {
  const source = await readFile(path, 'utf8');
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`Patch target not found in ${path}: ${String(search).slice(0, 160)}`);
  await writeFile(path, next);
}

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  "    const selection = selectAiPlanForState({\n      unitId: unit.id,\n      stateId: session.stateRuntime.activeStateId,\n      nowMs: simulationNowMs,\n      sequence: session.planSequence + 1,\n      blackboard,\n      replacesPlanId: session.planHistory.at(-1)?.status === 'replanning' ? session.planHistory.at(-1)?.id : undefined,\n    });",
  "    const previousPlan = session.planHistory[session.planHistory.length - 1];\n    const selection = selectAiPlanForState({\n      unitId: unit.id,\n      stateId: session.stateRuntime.activeStateId,\n      nowMs: simulationNowMs,\n      sequence: session.planSequence + 1,\n      blackboard,\n      replacesPlanId: previousPlan?.status === 'replanning' ? previousPlan.id : undefined,\n    });",
);

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  '  publishStatePlanDebug(unit, session);',
  '  publishStatePlanDebug(session);',
);

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  'function publishStatePlanDebug(unit: UnitModel, session: AiRuntimeSessionSnapshotV1): void {',
  'function publishStatePlanDebug(session: AiRuntimeSessionSnapshotV1): void {',
);

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  '    const previousPlan = session.planHistory.at(-1);',
  '    const previousPlan = session.planHistory[session.planHistory.length - 1];',
);

await replaceText(
  'scripts/ai_runtime_snapshot_smoke.ts',
  "  assert.equal(exported.version, 'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid');",
  "  assert.equal(exported.version, 'scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid');",
);

console.log('AI state/plan validation fixes applied.');
