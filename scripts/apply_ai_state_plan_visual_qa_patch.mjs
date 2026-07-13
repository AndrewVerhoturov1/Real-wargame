import { readFile, writeFile } from 'node:fs/promises';

async function replaceText(path, search, replacement) {
  const source = await readFile(path, 'utf8');
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`Patch target not found in ${path}: ${String(search).slice(0, 180)}`);
  await writeFile(path, next);
}

await replaceText(
  'src/main.ts',
  "import { installWorkspaceTooltipGuard } from './ui/WorkspaceTooltipGuard';\n",
  "import { installWorkspaceTooltipGuard } from './ui/WorkspaceTooltipGuard';\nimport { installAiStatePlanVisualQaHarness } from './testing/AiStatePlanVisualQaHarness';\n",
);

await replaceText(
  'src/main.ts',
  "installTacticalWorkspace(state, aiGameBridge, forceRenderAtNativeMapQuality);\n",
  "installTacticalWorkspace(state, aiGameBridge, forceRenderAtNativeMapQuality);\ninstallAiStatePlanVisualQaHarness(state, forceRenderAtNativeMapQuality);\n",
);

await replaceText(
  'src/ui/AiStatePlanPanel.ts',
  "        <div class=\"wide\"><dt>Текущий шаг</dt><dd data-state-plan=\"step\">—</dd></div>\n      </dl>",
  "        <div class=\"wide\"><dt>Текущий шаг</dt><dd data-state-plan=\"step\">—</dd></div>\n        <div class=\"wide\"><dt>Предыдущий план</dt><dd data-state-plan=\"previous-plan\">—</dd></div>\n      </dl>",
);

await replaceText(
  'src/ui/AiStatePlanPanel.ts',
  "    step: required<HTMLElement>(panel, '[data-state-plan=\"step\"]'),\n    reasons:",
  "    step: required<HTMLElement>(panel, '[data-state-plan=\"step\"]'),\n    previousPlan: required<HTMLElement>(panel, '[data-state-plan=\"previous-plan\"]'),\n    reasons:",
);

await replaceText(
  'src/ui/AiStatePlanPanel.ts',
  "        setText(fields.step, '—');\n        updateList(fields.reasons, []);",
  "        setText(fields.step, '—');\n        setText(fields.previousPlan, '—');\n        updateList(fields.reasons, []);",
);

await replaceText(
  'src/ui/AiStatePlanPanel.ts',
  "      const activePlan = session.activePlan;\n      const step = activePlan?.steps[activePlan.currentStepIndex];",
  "      const activePlan = session.activePlan;\n      const step = activePlan?.steps[activePlan.currentStepIndex];\n      const previousPlan = session.planHistory[session.planHistory.length - 1];",
);

await replaceText(
  'src/ui/AiStatePlanPanel.ts',
  "      setText(fields.step, activePlan\n        ? `${step?.labelRu ?? step?.id ?? 'Шаг'} · ${Math.min(activePlan.currentStepIndex + 1, activePlan.steps.length)} из ${activePlan.steps.length}`\n        : '—');\n      updateList(fields.reasons, activePlan?.reasonsRu ?? []);",
  "      setText(fields.step, activePlan\n        ? `${step?.labelRu ?? step?.id ?? 'Шаг'} · ${Math.min(activePlan.currentStepIndex + 1, activePlan.steps.length)} из ${activePlan.steps.length}`\n        : '—');\n      setText(fields.previousPlan, previousPlan\n        ? `${previousPlan.goalRu} · ${planStatusLabel(previousPlan.status)}${previousPlan.cancellationReasonRu ? ` · ${previousPlan.cancellationReasonRu}` : ''}`\n        : '—');\n      updateList(fields.reasons, activePlan?.reasonsRu ?? []);",
);

console.log('AI state/plan visual QA integration patch applied.');
