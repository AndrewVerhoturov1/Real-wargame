import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/AiNodeTypes.ts', (source) => insertOnce(
  source,
  "  Selector: {\n",
  "  ReactiveSequence: {\n    type: 'ReactiveSequence',\n    category: 'flow',\n    label: 'Reactive Sequence',\n    description: 'Runs children in order and interrupts the active branch when an observed preceding condition changes and becomes false.',\n    labelRu: 'Реактивная последовательность',\n    descriptionRu: 'Выполняет шаги по порядку и прерывает текущую ветвь, если наблюдаемое предыдущее условие изменилось и перестало выполняться.',\n    canHaveChildren: true,\n  },\n  Selector: {\n",
  'add ReactiveSequence node type',
));

await patch('src/core/ai/AiGraphValidation.ts', (source) => {
  source = replaceOnce(
    source,
    "  validateNodeLinks(nodeById, issues);\n  validateBlackboardDefaults",
    "  validateNodeLinks(nodeById, issues);\n  validateReactiveSequences(nodeById, issues);\n  validateBlackboardDefaults",
    'validate ReactiveSequence structure',
  );
  source = replaceOnce(
    source,
    "  if (parametersValue === undefined) {\n    return;\n  }",
    "  if (parametersValue === undefined) {\n    if (nodeType === 'ReactiveSequence') {\n      issues.push(errorIssue('REACTIVE_PARAMETERS_MISSING', 'ReactiveSequence must define its observer and abort policy parameters.', 'У ноды «Реактивная последовательность» должны быть параметры наблюдателя и политики прерывания.', nodeId));\n    }\n    return;\n  }",
    'require reactive parameters',
  );
  source = replaceOnce(
    source,
    "  if (nodeType === 'Reload') validateReloadParameters(parametersValue, issues, nodeId);\n}",
    "  if (nodeType === 'Reload') validateReloadParameters(parametersValue, issues, nodeId);\n  if (nodeType === 'ReactiveSequence') validateReactiveSequenceParameters(parametersValue, issues, nodeId);\n}",
    'validate reactive parameters',
  );
  source = insertOnce(
    source,
    "function validateReloadParameters(",
    "const REACTIVE_CONDITION_TYPES = new Set([\n  'FlagCheck',\n  'BlackboardValueAbove',\n  'StableThreshold',\n  'DistanceCheck',\n  'TacticalCheck',\n]);\n\nfunction validateReactiveSequences(\n  nodeById: Map<string, UnknownRecord>,\n  issues: AiGraphValidationIssue[],\n): void {\n  for (const [nodeId, node] of nodeById) {\n    if (node.type !== 'ReactiveSequence') continue;\n    const children = Array.isArray(node.children)\n      ? node.children.filter(isNonEmptyString)\n      : [];\n    if (children.length < 2) {\n      issues.push(errorIssue('REACTIVE_CHILDREN_TOO_FEW', 'ReactiveSequence needs at least one observed condition followed by an action or composite child.', 'У ноды «Реактивная последовательность» должно быть минимум одно наблюдаемое условие, а после него действие или составная нода.', nodeId));\n      continue;\n    }\n    for (const conditionId of children.slice(0, -1)) {\n      const condition = nodeById.get(conditionId);\n      if (!condition || !REACTIVE_CONDITION_TYPES.has(String(condition.type))) {\n        issues.push(errorIssue('REACTIVE_PRECEDING_CHILD_NOT_CONDITION', `ReactiveSequence child ${conditionId} before the active branch must be a supported condition.`, `Ребёнок ${conditionId} перед активной ветвью реактивной последовательности должен быть поддерживаемым условием.`, nodeId));\n      }\n    }\n  }\n}\n\nfunction validateReactiveSequenceParameters(\n  parameters: UnknownRecord,\n  issues: AiGraphValidationIssue[],\n  nodeId: string,\n): void {\n  if (typeof parameters.observePrecedingConditions !== 'boolean') {\n    issues.push(errorIssue('REACTIVE_OBSERVER_FLAG_INVALID', 'ReactiveSequence observePrecedingConditions must be boolean.', 'У реактивной последовательности параметр «Наблюдать предыдущие условия» должен быть да/нет.', nodeId));\n  }\n  if (parameters.abortPolicy !== 'abort_self') {\n    issues.push(errorIssue('REACTIVE_ABORT_POLICY_UNSUPPORTED', 'ReactiveSequence v1 supports only abortPolicy=abort_self.', 'Реактивная последовательность v1 поддерживает только политику «Прервать текущую ветвь».', nodeId));\n  }\n  for (const key of ['abortReason', 'abortReasonRu']) {\n    const value = parameters[key];\n    if (value !== undefined && typeof value !== 'string') {\n      issues.push(errorIssue('REACTIVE_ABORT_REASON_INVALID', `ReactiveSequence ${key} must be a string.`, `У реактивной последовательности параметр ${key} должен быть строкой.`, nodeId));\n    }\n  }\n}\n\nfunction validateReloadParameters(",
    'add reactive validation helpers',
  );
  return source;
});

await patch('src/ai-node-editor/main.ts', (source) => replaceOnce(
  source,
  "    case 'Wait': return { ...common, durationSeconds: 2, timeoutSeconds: 0 };",
  "    case 'ReactiveSequence': return { ...common, observePrecedingConditions: true, abortPolicy: 'abort_self', abortReason: 'Condition changed.', abortReasonRu: 'Условие изменилось.' };\n    case 'Wait': return { ...common, durationSeconds: 2, timeoutSeconds: 0 };",
  'add ReactiveSequence editor defaults',
));

await patch('src/ai-node-editor/stateful-node-ui.ts', (source) => {
  source = replaceOnce(
    source,
    "  if (!node || !['Wait', 'Reload', 'SequenceWithMemory', 'MoveToBlackboardPosition'].includes(String(node.type))) {",
    "  if (!node || !['Wait', 'Reload', 'SequenceWithMemory', 'ReactiveSequence', 'MoveToBlackboardPosition'].includes(String(node.type))) {",
    'show ReactiveSequence human panel',
  );
  source = replaceOnce(
    source,
    "  if (node.type === 'SequenceWithMemory') {\n    section.innerHTML = `",
    "  if (node.type === 'ReactiveSequence') {\n    const observePrecedingConditions = readBoolean(node.parameters?.observePrecedingConditions, true);\n    const abortReasonRu = typeof node.parameters?.abortReasonRu === 'string'\n      ? node.parameters.abortReasonRu\n      : 'Условие изменилось.';\n    section.innerHTML = `\n      <h4>Реактивная последовательность</h4>\n      <p>Первые дети должны быть условиями, последний ребёнок — выполняемой ветвью. Наблюдатель проверяет только изменившиеся ключи памяти и не пересчитывает весь граф.</p>\n      <label class=\"human-control wide\" data-help=\"Следить за ключами Blackboard, от которых зависят предыдущие условия.\">\n        <span>Наблюдатель · предыдущие условия</span>\n        <input id=\"reactive-observe-preceding\" class=\"reactive-sequence-field\" type=\"checkbox\" ${observePrecedingConditions ? 'checked' : ''} />\n      </label>\n      <label class=\"human-control wide\" data-help=\"В первой версии доступна безопасная политика: отменить только активного ребёнка этой последовательности.\">\n        <span>Политика прерывания</span>\n        <select id=\"reactive-abort-policy\" class=\"reactive-sequence-field\">\n          <option value=\"abort_self\" selected>Прервать текущую ветвь · abort_self</option>\n        </select>\n      </label>\n      <label class=\"human-control wide\" data-help=\"Русская причина будет показана в плане бойца и следе ИИ.\">\n        <span>Причина прерывания</span>\n        <input id=\"reactive-abort-reason-ru\" class=\"reactive-sequence-field\" type=\"text\" value=\"${escapeAttribute(abortReasonRu)}\" />\n      </label>\n      <p class=\"stateful-move-safety-note\">Порядок: событие → проверка условия → отмена активного действия → cleanup → следующая ветвь Selector. Приказ игрока не очищается чужим token.</p>\n    `;\n  } else if (node.type === 'SequenceWithMemory') {\n    section.innerHTML = `",
    'render ReactiveSequence controls',
  );
  source = replaceOnce(
    source,
    "  } else if (node.type === 'Reload') {\n    installReloadParameterSync(section);\n  }\n}",
    "  } else if (node.type === 'Reload') {\n    installReloadParameterSync(section);\n  } else if (node.type === 'ReactiveSequence') {\n    installReactiveSequenceParameterSync(section);\n  }\n}",
    'install ReactiveSequence sync',
  );
  source = insertOnce(
    source,
    "function installMoveParameterSync(",
    "function installReactiveSequenceParameterSync(section: HTMLElement): void {\n  const sync = (): void => {\n    const parametersArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');\n    if (!parametersArea) return;\n    const parameters = readParameters(parametersArea.value);\n    parameters.observePrecedingConditions = document.querySelector<HTMLInputElement>('#reactive-observe-preceding')?.checked ?? true;\n    parameters.abortPolicy = document.querySelector<HTMLSelectElement>('#reactive-abort-policy')?.value ?? 'abort_self';\n    parameters.abortReason = 'Condition changed.';\n    parameters.abortReasonRu = document.querySelector<HTMLInputElement>('#reactive-abort-reason-ru')?.value.trim() || 'Условие изменилось.';\n    parametersArea.value = JSON.stringify(parameters, null, 2);\n  };\n  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.reactive-sequence-field')\n    .forEach((field) => field.addEventListener('input', sync));\n  document.querySelector<HTMLButtonElement>('.human-save-node')?.addEventListener('click', sync, { capture: true });\n  sync();\n}\n\nfunction installMoveParameterSync(",
    'add ReactiveSequence parameter sync',
  );
  source = insertOnce(
    source,
    "function readParameters(value: string): Record<string, unknown> {",
    "function escapeAttribute(value: string): string {\n  return value\n    .replaceAll('&', '&amp;')\n    .replaceAll('\\\"', '&quot;')\n    .replaceAll('<', '&lt;')\n    .replaceAll('>', '&gt;');\n}\n\nfunction readParameters(value: string): Record<string, unknown> {",
    'escape ReactiveSequence reason value',
  );
  return source;
});

await patch('src/core/ai/UnitPlan.ts', (source) => {
  source = insertOnce(
    source,
    "export interface UnitPlanState {",
    "export interface UnitPlanReactiveAbortState {\n  readonly eventType: string;\n  readonly observerId?: string;\n  readonly abortSourceNodeId: AiNodeId;\n  readonly activeChildNodeId: AiNodeId;\n  readonly cleanupOutcome: 'pending' | 'completed';\n  readonly newBranchNodeId?: AiNodeId;\n  readonly reason: string;\n  readonly reasonRu: string;\n}\n\nexport interface UnitPlanState {",
    'add reactive abort plan state',
  );
  source = replaceOnce(
    source,
    "  readonly lastOutcome?: UnitPlanOutcome;\n}",
    "  readonly lastOutcome?: UnitPlanOutcome;\n  readonly lastReactiveAbort?: UnitPlanReactiveAbortState;\n}",
    'store reactive abort in unit plan',
  );
  source = replaceOnce(
    source,
    "    lastOutcome: result.status === 'success' || result.status === 'failure' || result.status === 'cancelled'",
    "    lastReactiveAbort: result.reactiveAbort\n      ? {\n          eventType: result.reactiveAbort.eventType,\n          observerId: result.reactiveAbort.observerId,\n          abortSourceNodeId: result.reactiveAbort.abortSourceNodeId,\n          activeChildNodeId: result.reactiveAbort.activeChildNodeId,\n          cleanupOutcome: result.reactiveAbort.cleanupOutcome,\n          newBranchNodeId: result.reactiveAbort.newBranchNodeId,\n          reason: result.reactiveAbort.reason,\n          reasonRu: result.reactiveAbort.reasonRu,\n        }\n      : current?.lastReactiveAbort,\n    lastOutcome: result.status === 'success' || result.status === 'failure' || result.status === 'cancelled'",
    'update reactive abort plan state',
  );
  source = replaceOnce(
    source,
    "    lastOutcome: value.lastOutcome ? { ...value.lastOutcome } : undefined,\n  };",
    "    lastOutcome: value.lastOutcome ? { ...value.lastOutcome } : undefined,\n    lastReactiveAbort: value.lastReactiveAbort ? { ...value.lastReactiveAbort } : undefined,\n  };",
    'clone reactive abort plan state',
  );
  return source;
});

await patch('src/core/ai/AiGameBridge.ts', (source) => replaceOnce(
  source,
  "      effects: result.effects,\n      blackboard: result.blackboard,",
  "      effects: result.effects,\n      consumedEventIds: result.consumedEventIds,\n      reactiveAbort: result.reactiveAbort,\n      observerChecks: unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerChecks ?? 0,\n      observerEvents: unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerEvents ?? 0,\n      blackboard: result.blackboard,",
  'publish reactive diagnostics',
));

await patch('src/ai-node-editor/runtime-debug-overlay.ts', (source) => {
  source = insertOnce(
    source,
    "interface RuntimeDebugPayload {",
    "interface RuntimeReactiveAbort {\n  readonly eventType: string;\n  readonly observerId?: string;\n  readonly abortSourceNodeId: string;\n  readonly oldBranchNodeId: string;\n  readonly activeChildNodeId: string;\n  readonly cleanupOutcome: 'pending' | 'completed';\n  readonly newBranchNodeId?: string;\n  readonly reason: string;\n  readonly reasonRu: string;\n}\n\ninterface RuntimeDebugPayload {",
    'add reactive debug contract',
  );
  source = replaceOnce(
    source,
    "  readonly effects: readonly unknown[];\n}",
    "  readonly effects: readonly unknown[];\n  readonly consumedEventIds?: readonly string[];\n  readonly reactiveAbort?: RuntimeReactiveAbort;\n  readonly observerChecks?: number;\n  readonly observerEvents?: number;\n}",
    'extend runtime debug payload',
  );
  source = replaceOnce(
    source,
    "${payload.trace.length}:${payload.scores.length}:${payload.paused ? 'paused' : 'live'}`",
    "${payload.trace.length}:${payload.scores.length}:${payload.reactiveAbort?.eventType ?? 'no-abort'}:${payload.paused ? 'paused' : 'live'}`",
    'include reactive abort in overlay signature',
  );
  source = replaceOnce(
    source,
    "  const winner = ensure(payload.selectedBranchNodeId);",
    "  if (payload.reactiveAbort) {\n    const source = ensure(payload.reactiveAbort.abortSourceNodeId);\n    source.classes.add('runtime-debug-fail');\n    source.labels.unshift('Условие изменилось');\n    source.reasons.push(payload.reactiveAbort.reasonRu);\n    const oldBranch = ensure(payload.reactiveAbort.oldBranchNodeId);\n    oldBranch.classes.add('runtime-debug-cancelled');\n    oldBranch.labels.push('Прервана');\n    if (payload.reactiveAbort.newBranchNodeId) {\n      const nextBranch = ensure(payload.reactiveAbort.newBranchNodeId);\n      nextBranch.classes.add('runtime-debug-winner');\n      nextBranch.labels.unshift('Новая ветвь');\n    }\n  }\n\n  const winner = ensure(payload.selectedBranchNodeId);",
    'highlight reactive abort nodes',
  );
  source = replaceOnce(
    source,
    "  const cancellationRow = cancellation ? `<div><dt>Причина отмены</dt><dd>${escapeHtml(cancellation)}</dd></div>` : '';",
    "  const cancellationRow = cancellation ? `<div><dt>Причина отмены</dt><dd>${escapeHtml(cancellation)}</dd></div>` : '';\n  const reactiveRows = payload.reactiveAbort\n    ? `<div><dt>Событие</dt><dd>${escapeHtml(payload.reactiveAbort.eventType)}</dd></div>\n       <div><dt>Наблюдатель</dt><dd>${escapeHtml(payload.reactiveAbort.observerId ?? 'маршрут')}</dd></div>\n       <div><dt>Прервать текущую ветвь</dt><dd>${escapeHtml(payload.reactiveAbort.reasonRu)}</dd></div>\n       <div><dt>Cleanup</dt><dd>${escapeHtml(payload.reactiveAbort.cleanupOutcome === 'completed' ? 'выполнен' : 'ожидает')}</dd></div>\n       <div><dt>Новая ветвь</dt><dd>${escapeHtml(payload.reactiveAbort.newBranchNodeId ?? 'нет')}</dd></div>`\n    : '';",
    'render reactive abort rows',
  );
  source = replaceOnce(
    source,
    "      ${cancellationRow}\n      <div><dt>Итог</dt>",
    "      ${cancellationRow}\n      ${reactiveRows}\n      <div><dt>Итог</dt>",
    'insert reactive rows in panel',
  );
  source = replaceOnce(
    source,
    "      effects: Array.isArray(parsed.effects) ? parsed.effects : [],\n    };",
    "      effects: Array.isArray(parsed.effects) ? parsed.effects : [],\n      consumedEventIds: Array.isArray(parsed.consumedEventIds)\n        ? parsed.consumedEventIds.filter((value): value is string => typeof value === 'string')\n        : undefined,\n      reactiveAbort: normalizeReactiveAbort(parsed.reactiveAbort),\n      observerChecks: typeof parsed.observerChecks === 'number' ? parsed.observerChecks : undefined,\n      observerEvents: typeof parsed.observerEvents === 'number' ? parsed.observerEvents : undefined,\n    };",
    'parse reactive debug fields',
  );
  source = insertOnce(
    source,
    "function isTraceItem(value: unknown): value is RuntimeTraceItem {",
    "function normalizeReactiveAbort(value: unknown): RuntimeReactiveAbort | undefined {\n  if (!isRecord(value)\n    || typeof value.eventType !== 'string'\n    || typeof value.abortSourceNodeId !== 'string'\n    || typeof value.oldBranchNodeId !== 'string'\n    || typeof value.activeChildNodeId !== 'string'\n    || !['pending', 'completed'].includes(String(value.cleanupOutcome))\n    || typeof value.reason !== 'string'\n    || typeof value.reasonRu !== 'string') return undefined;\n  return {\n    eventType: value.eventType,\n    observerId: typeof value.observerId === 'string' ? value.observerId : undefined,\n    abortSourceNodeId: value.abortSourceNodeId,\n    oldBranchNodeId: value.oldBranchNodeId,\n    activeChildNodeId: value.activeChildNodeId,\n    cleanupOutcome: value.cleanupOutcome as 'pending' | 'completed',\n    newBranchNodeId: typeof value.newBranchNodeId === 'string' ? value.newBranchNodeId : undefined,\n    reason: value.reason,\n    reasonRu: value.reasonRu,\n  };\n}\n\nfunction isTraceItem(value: unknown): value is RuntimeTraceItem {",
    'normalize reactive debug trace',
  );
  return source;
});

await patch('scripts/ai_node_editor_smoke.mjs', (source) => {
  source = replaceOnce(
    source,
    "  'Reload', 'Перезарядить',\n  'Movement Mode'",
    "  'Reload', 'Перезарядить',\n  'Reactive Sequence', 'Реактивная последовательность',\n  'Movement Mode'",
    'assert ReactiveSequence palette labels',
  );
  source = replaceOnce(
    source,
    "for (const needle of [\n  \"node.type === 'Reload'\",",
    "for (const needle of [\n  \"node.type === 'ReactiveSequence'\",\n  'Реактивная последовательность',\n  'Наблюдатель · предыдущие условия',\n  'Прервать текущую ветвь',\n  'Условие изменилось',\n  'reactive-observe-preceding',\n  'reactive-abort-policy',\n  'reactive-abort-reason-ru',\n]) expectContains(statefulUi, needle, `ReactiveSequence human UI должен содержать: ${needle}`);\n\nfor (const needle of [\n  \"node.type === 'Reload'\",",
    'assert ReactiveSequence human UI',
  );
  source = replaceOnce(
    source,
    "for (const needle of ['RELOAD_DURATION_INVALID', 'RELOAD_TARGET_AMMO_INVALID', 'RELOAD_WEAPON_FLAG_INVALID']) {",
    "for (const needle of [\n  'REACTIVE_CHILDREN_TOO_FEW',\n  'REACTIVE_PRECEDING_CHILD_NOT_CONDITION',\n  'REACTIVE_OBSERVER_FLAG_INVALID',\n  'REACTIVE_ABORT_POLICY_UNSUPPORTED',\n]) expectContains(validationSource, needle, `Валидация ReactiveSequence должна содержать: ${needle}`);\n\nfor (const needle of ['RELOAD_DURATION_INVALID', 'RELOAD_TARGET_AMMO_INVALID', 'RELOAD_WEAPON_FLAG_INVALID']) {",
    'assert ReactiveSequence validation',
  );
  source = insertOnce(
    source,
    "const engineCore = readText('scripts/ai_engine_core.mjs');",
    "const runtimeDebugOverlay = readText('src/ai-node-editor/runtime-debug-overlay.ts');\nfor (const needle of ['RuntimeReactiveAbort', 'Наблюдатель', 'Прервать текущую ветвь', 'Cleanup', 'Новая ветвь']) {\n  expectContains(runtimeDebugOverlay, needle, `Reactive abort overlay должен содержать: ${needle}`);\n}\nexpectContains(gameBridge, 'reactiveAbort: result.reactiveAbort', 'Игровой мост должен публиковать reactive abort trace.');\n\nconst engineCore = readText('scripts/ai_engine_core.mjs');",
    'assert reactive debug diagnostics',
  );
  return source;
});

console.log('ReactiveSequence UI, validation and diagnostics patch applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after);
}

function insertOnce(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, marker, replacement, label);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
