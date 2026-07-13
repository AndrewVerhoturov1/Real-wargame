import { readFile, writeFile } from 'node:fs/promises';

async function replaceText(path, search, replacement) {
  const source = await readFile(path, 'utf8');
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`Patch target not found in ${path}: ${String(search).slice(0, 140)}`);
  await writeFile(path, next);
}

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  "import { buildAiPlanConditionValues, buildAiPlanStepGraph, deriveAiStateTriggers, isAiPlanAllowedInState, selectAiPlanForState } from './state/AiStatePlanPipeline';",
  "import { buildAiPlanConditionValues, buildAiPlanStepGraph, deriveAiStateTriggers, isAiPlanAllowedInState, readAiExecutionOwnerToken, selectAiPlanForState } from './state/AiStatePlanPipeline';",
);

await replaceText(
  'src/core/ai/AiGameBridge.ts',
  "    const activeData = previousSession.executionState?.activeData;\n    const ownedMoveToken = activeData?.kind === 'move_to_blackboard_position'\n      ? activeData.actionToken\n      : undefined;",
  "    const ownedMoveToken = readAiExecutionOwnerToken(previousSession.executionState);",
);

await replaceText(
  'src/core/ai/state/AiPlanRuntime.ts',
  "  const currentStepIndex = Number.isInteger(value.currentStepIndex)\n    ? Math.max(0, Math.min(steps.length, Number(value.currentStepIndex)))\n    : 0;",
  "  const currentStepIndex = Number.isInteger(value.currentStepIndex)\n    ? Math.max(0, Math.min(Math.max(0, steps.length - 1), Number(value.currentStepIndex)))\n    : 0;",
);

console.log('AI state/plan precheck fixes applied.');
