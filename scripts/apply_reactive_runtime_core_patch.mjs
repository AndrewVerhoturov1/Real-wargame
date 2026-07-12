import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/AiGraphRuntime.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiCompositeFrame } from './runtime/AiCompositeRuntime';\n",
    "import type { AiCompositeFrame } from './runtime/AiCompositeRuntime';\nimport type { AiEvent } from './events/AiEvent';\nimport type { AiBlackboardObserverDefinition } from './events/AiBlackboardObserver';\nimport type { AiReactiveAbortTrace } from './events/AiReactiveRuntime';\n",
    'import reactive runtime types',
  );
  source = replaceOnce(
    source,
    "  readonly cancel?: AiGraphCancellationRequest;\n}",
    "  readonly cancel?: AiGraphCancellationRequest;\n  readonly events?: readonly AiEvent[];\n}",
    'add events to runtime input',
  );
  source = replaceOnce(
    source,
    "  readonly actionToken?: string;\n}",
    "  readonly actionToken?: string;\n  readonly consumedEventIds?: readonly string[];\n  readonly reactiveAbort?: AiReactiveAbortTrace;\n  readonly reactiveObserverDefinitions?: readonly AiBlackboardObserverDefinition[];\n}",
    'add reactive result fields',
  );
  return source;
});

await patch('src/core/ai/events/AiEventQueue.ts', (source) => insertOnce(
  source,
  "export function pruneExpiredAiEvents(\n",
  "export function removeAiEventsById(\n  queue: AiEventQueueSnapshotV1,\n  eventIds: readonly string[],\n): AiEventQueueSnapshotV1 {\n  if (eventIds.length === 0) return cloneAiEventQueueSnapshot(queue);\n  const ids = new Set(eventIds);\n  return {\n    ...cloneAiEventQueueSnapshot(queue),\n    events: queue.events.filter((event) => !ids.has(event.id)).map(cloneAiEvent),\n  };\n}\n\nexport function pruneExpiredAiEvents(\n",
  'add consumed event removal helper',
));

await patch('src/core/ai/events/AiReactiveRuntime.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { AiBlackboardObserverDefinition } from './AiBlackboardObserver';",
    "import {\n  cloneAiBlackboardObserverRegistry,\n  registerAiBlackboardObserver,\n  type AiBlackboardObserverDefinition,\n  type AiBlackboardObserverRegistrySnapshotV1,\n} from './AiBlackboardObserver';",
    'import observer reconciliation helpers',
  );
  source = insertOnce(
    source,
    "export function evaluateAiReactiveAbort(\n",
    "export function reconcileReactiveObserverRegistry(\n  registry: AiBlackboardObserverRegistrySnapshotV1,\n  definitions: readonly AiBlackboardObserverDefinition[],\n  blackboard: AiGraphRunnerBlackboard,\n): AiBlackboardObserverRegistrySnapshotV1 {\n  const desired = new Map(definitions.map((definition) => [definition.observerId, definition]));\n  let next = cloneAiBlackboardObserverRegistry(registry);\n  const observers = { ...next.observers };\n  let removed = false;\n  for (const [observerId, state] of Object.entries(observers)) {\n    if (!isReactiveObserverDefinition(state.definition)) continue;\n    if (desired.has(observerId)) continue;\n    delete observers[observerId];\n    removed = true;\n  }\n  if (removed) next = { ...next, revision: next.revision + 1, observers };\n  for (const definition of definitions) {\n    next = registerAiBlackboardObserver(next, definition, blackboard).registry;\n  }\n  return next;\n}\n\nexport function isReactiveExecutionState(state: AiGraphExecutionState | undefined): boolean {\n  return Boolean(state?.frames?.some((frame) => frame.kind === 'reactive_sequence'));\n}\n\nexport function evaluateAiReactiveAbort(\n",
    'add observer registry reconciliation',
  );
  source = insertOnce(
    source,
    "function deriveConditionDependencies(\n",
    "function isReactiveObserverDefinition(definition: AiBlackboardObserverDefinition): boolean {\n  return Boolean(\n    definition.scopeNodeId\n    && definition.sourceNodeId\n    && definition.observerId === `${definition.scopeNodeId}:${definition.sourceNodeId}:${definition.key}`,\n  );\n}\n\nfunction deriveConditionDependencies(\n",
    'identify runtime-owned observers',
  );
  return source;
});

await patch('src/core/ai/runtime/AiRuntimeSession.ts', (source) => {
  source = replaceOnce(
    source,
    "  normalizeAiEventQueueSnapshot,\n  type AiEventQueueSnapshotV1,",
    "  normalizeAiEventQueueSnapshot,\n  removeAiEventsById,\n  type AiEventQueueSnapshotV1,",
    'import event consumption helper',
  );
  source = insertOnce(
    source,
    "import {\n  cloneCompositeFrames,\n",
    "import { reconcileReactiveObserverRegistry } from '../events/AiReactiveRuntime';\nimport {\n  cloneCompositeFrames,\n",
    'import observer reconciliation',
  );
  source = replaceOnce(
    source,
    "  const terminalStatus = toTerminalStatus(result.status);\n  return {",
    "  const terminalStatus = toTerminalStatus(result.status);\n  const eventQueue = removeAiEventsById(current.eventQueue, result.consumedEventIds ?? []);\n  const observerRegistry = reconcileReactiveObserverRegistry(\n    current.observerRegistry,\n    result.reactiveObserverDefinitions ?? [],\n    result.blackboard,\n  );\n  return {",
    'prepare reactive session state',
  );
  source = replaceOnce(
    source,
    "    eventQueue: cloneAiEventQueueSnapshot(current.eventQueue),\n    observerRegistry: cloneAiBlackboardObserverRegistry(current.observerRegistry),",
    "    eventQueue,\n    observerRegistry,",
    'apply consumed events and observer definitions',
  );
  return source;
});

await patch('src/core/ai/AiGraphRunner.ts', (source) => replaceOnce(
  source,
  "    case 'Sequence':\n    case 'Selector':",
  "    case 'Sequence':\n    case 'ReactiveSequence':\n    case 'Selector':",
  'treat ReactiveSequence as flow node',
));

await patch('src/core/ai/runtime/AiCompositeGraphRuntime.ts', (source) => {
  source = insertOnce(
    source,
    "import { DEFAULT_AI_ACTION_REGISTRY } from './AiDefaultActionRegistry';\n",
    "import { DEFAULT_AI_ACTION_REGISTRY } from './AiDefaultActionRegistry';\nimport {\n  deriveReactiveObserverDefinitions,\n  evaluateAiReactiveAbort,\n  type AiReactiveAbortTrace,\n} from '../events/AiReactiveRuntime';\n",
    'import reactive evaluator',
  );
  source = replaceOnce(
    source,
    "  readonly accumulator: RuntimeAccumulator;\n  readonly lifecycle: AiGraphLifecycleEvent[];\n}",
    "  readonly accumulator: RuntimeAccumulator;\n  readonly lifecycle: AiGraphLifecycleEvent[];\n  readonly consumedEventIds: string[];\n  reactiveAbort?: AiReactiveAbortTrace;\n}",
    'extend runtime environment',
  );
  source = replaceOnce(
    source,
    "    if (node.type === 'Reload') return true;\n    if (node.type === 'Selector'",
    "    if (node.type === 'Reload' || node.type === 'ReactiveSequence') return true;\n    if (node.type === 'Selector'",
    'force composite runtime for ReactiveSequence',
  );
  source = replaceOnce(
    source,
    "          || child?.type === 'Sequence'\n          || child?.type === 'UtilitySelector';",
    "          || child?.type === 'Sequence'\n          || child?.type === 'ReactiveSequence'\n          || child?.type === 'UtilitySelector';",
    'recognize nested ReactiveSequence',
  );
  source = replaceOnce(
    source,
    "    if (input.cancel) {\n      const cancelled = cancelActiveAction(environment, validation.activeNode, input.executionState);\n      return resultFromOutcome(environment, cancelled);\n    }\n\n    const resumed = resumeActiveAction(environment, validation.activeNode, validation.frames, input.executionState);",
    "    if (input.cancel) {\n      const cancelled = cancelActiveAction(environment, validation.activeNode, input.executionState);\n      return resultFromOutcome(environment, cancelled);\n    }\n\n    const reactive = evaluateAiReactiveAbort({\n      graph: input.graph,\n      executionState: input.executionState,\n      blackboard: input.blackboard,\n      events: input.events ?? [],\n      nowMs: input.nowMs,\n      cooldowns: input.cooldowns,\n      tacticalHost: input.tacticalHost,\n    });\n    environment.consumedEventIds.push(...reactive.consumedEventIds);\n    if (reactive.shouldAbort && reactive.trace) {\n      environment.reactiveAbort = reactive.trace;\n      const cancelled = cancelActiveAction(\n        environment,\n        validation.activeNode,\n        input.executionState,\n        { reason: reactive.reason ?? reactive.trace.reason, reasonRu: reactive.reasonRu ?? reactive.trace.reasonRu },\n      );\n      if (cancelled.kind === 'failure') return resultFromOutcome(environment, cancelled);\n      environment.reactiveAbort = { ...environment.reactiveAbort, cleanupOutcome: 'completed' };\n      const switched = settle(\n        environment,\n        failure(reactive.reason ?? reactive.trace.reason, reactive.reasonRu ?? reactive.trace.reasonRu),\n        validation.frames,\n      );\n      return resultFromOutcome(environment, switched);\n    }\n\n    const resumed = resumeActiveAction(environment, validation.activeNode, validation.frames, input.executionState);",
    'run reactive preflight before resume',
  );
  source = replaceOnce(
    source,
    "    lifecycle: [],\n  };",
    "    lifecycle: [],\n    consumedEventIds: [],\n  };",
    'initialize reactive environment',
  );
  source = replaceOnce(
    source,
    "  if (node.type === 'Selector') return enterSelector(environment, node, frames, 0);\n  if (node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'Root') {",
    "  if (node.type === 'Selector') return enterSelector(environment, node, frames, 0);\n  if (node.type === 'ReactiveSequence') return enterSequence(environment, node, frames, 0, 'reactive_sequence');\n  if (node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'Root') {",
    'enter ReactiveSequence explicitly',
  );
  source = replaceOnce(
    source,
    "  kind: 'sequence' | 'action_branch',",
    "  kind: 'sequence' | 'reactive_sequence' | 'action_branch',",
    'extend sequence frame kind',
  );
  source = replaceOnce(
    source,
    "  const frame: AiCompositeFrame = kind === 'sequence'\n    ? { kind: 'sequence', nodeId: node.id, childIndex }\n    : { kind: 'action_branch', nodeId: node.id, childIndex };",
    "  const frame: AiCompositeFrame = kind === 'sequence'\n    ? { kind: 'sequence', nodeId: node.id, childIndex }\n    : kind === 'reactive_sequence'\n      ? { kind: 'reactive_sequence', nodeId: node.id, childIndex }\n      : { kind: 'action_branch', nodeId: node.id, childIndex };",
    'create reactive sequence frame',
  );
  source = replaceOnce(
    source,
    "function cancelActiveAction(\n  environment: RuntimeEnvironment,\n  node: AiNode,\n  executionState: AiGraphExecutionState,\n): ExecutionOutcome {",
    "function cancelActiveAction(\n  environment: RuntimeEnvironment,\n  node: AiNode,\n  executionState: AiGraphExecutionState,\n  requestedCancellation?: { readonly reason: string; readonly reasonRu?: string },\n): ExecutionOutcome {",
    'allow reactive cancellation reason',
  );
  source = replaceOnce(
    source,
    "  const cancellation = environment.input.cancel ?? { reason: 'AI action cancelled.', reasonRu: 'Действие ИИ отменено.' };",
    "  const cancellation = requestedCancellation\n    ?? environment.input.cancel\n    ?? { reason: 'AI action cancelled.', reasonRu: 'Действие ИИ отменено.' };",
    'select reactive cancellation reason',
  );
  source = replaceOnce(
    source,
    "      if (nextIndex < (parent.children?.length ?? 0)) {\n        return enterNode(environment, parent.children?.[nextIndex] ?? '', [",
    "      if (nextIndex < (parent.children?.length ?? 0)) {\n        const nextChildId = parent.children?.[nextIndex] ?? '';\n        if (environment.reactiveAbort && !environment.reactiveAbort.newBranchNodeId) {\n          environment.reactiveAbort = { ...environment.reactiveAbort, newBranchNodeId: nextChildId };\n        }\n        return enterNode(environment, nextChildId, [",
    'trace reactive alternative selection',
  );
  source = replaceOnce(
    source,
    "    lifecycle: environment.lifecycle,\n  };",
    "    lifecycle: environment.lifecycle,\n    consumedEventIds: [...environment.consumedEventIds],\n    reactiveAbort: environment.reactiveAbort ? { ...environment.reactiveAbort } : undefined,\n  };",
    'include reactive result metadata',
  );
  source = replaceOnce(
    source,
    "    const legacy = legacyFrameFields(outcome.frames, outcome.node.id);\n    return {\n      ...base,",
    "    const legacy = legacyFrameFields(outcome.frames, outcome.node.id);\n    const executionState: AiGraphExecutionState = {\n      version: 1,\n      graphId: environment.input.graph.id,\n      unitId: environment.input.unitId,\n      branchNodeId: environment.branch.id,\n      sequenceNodeId: legacy.sequenceNodeId,\n      childIndex: legacy.childIndex,\n      activeNodeId: outcome.node.id,\n      activeNodeStartedAtMs: outcome.startedAtMs,\n      lastUpdatedAtMs: environment.input.nowMs,\n      status: outcome.status,\n      activeData: toExecutionData(outcome.state),\n      frames: cloneCompositeFrames(outcome.frames),\n    };\n    return {\n      ...base,",
    'prepare execution state before result',
  );
  source = replaceOnce(
    source,
    "      executionState: {\n        version: 1,\n        graphId: environment.input.graph.id,\n        unitId: environment.input.unitId,\n        branchNodeId: environment.branch.id,\n        sequenceNodeId: legacy.sequenceNodeId,\n        childIndex: legacy.childIndex,\n        activeNodeId: outcome.node.id,\n        activeNodeStartedAtMs: outcome.startedAtMs,\n        lastUpdatedAtMs: environment.input.nowMs,\n        status: outcome.status,\n        activeData: toExecutionData(outcome.state),\n        frames: cloneCompositeFrames(outcome.frames),\n      },",
    "      executionState,\n      reactiveObserverDefinitions: deriveReactiveObserverDefinitions(environment.input.graph, executionState),",
    'publish active reactive observer definitions',
  );
  source = replaceOnce(
    source,
    "      cancellationReasonRu: outcome.reasonRu,\n      ...outcome.details,",
    "      cancellationReasonRu: outcome.reasonRu,\n      reactiveObserverDefinitions: [],\n      ...outcome.details,",
    'remove reactive observers on cancellation',
  );
  source = replaceOnce(
    source,
    "    explanationRu: outcome.reasonRu,\n  };",
    "    explanationRu: outcome.reasonRu,\n    reactiveObserverDefinitions: [],\n  };",
    'remove reactive observers on terminal outcome',
  );
  source = replaceOnce(
    source,
    "    if ((node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'Selector' || node.type === 'UtilitySelector')",
    "    if ((node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'ReactiveSequence' || node.type === 'Selector' || node.type === 'UtilitySelector')",
    'find ReactiveSequence stateful entry',
  );
  source = replaceOnce(
    source,
    "      node.type === 'SequenceWithMemory'\n        || node.type === 'Sequence'\n        || node.type === 'Selector'",
    "      node.type === 'SequenceWithMemory'\n        || node.type === 'Sequence'\n        || node.type === 'ReactiveSequence'\n        || node.type === 'Selector'",
    'mask ReactiveSequence in planning graph',
  );
  return source;
});

await patch('src/core/ai/AiGameBridge.ts', (source) => {
  source = insertOnce(
    source,
    "import { publishSimulationAiEvents } from './events/SimulationAiEvents';\n",
    "import { publishSimulationAiEvents } from './events/SimulationAiEvents';\nimport { isReactiveExecutionState } from './events/AiReactiveRuntime';\n",
    'import reactive state detection',
  );
  source = replaceOnce(
    source,
    "  const result = runAiGraphRuntime({\n    graph,",
    "  const runtimeCancel = isReactiveExecutionState(session.executionState)\n    ? undefined\n    : options.cancel;\n  const result = runAiGraphRuntime({\n    graph,",
    'suppress compatibility cancel for reactive state',
  );
  source = replaceOnce(
    source,
    "    executionState: session.executionState,\n    cancel: options.cancel,",
    "    executionState: session.executionState,\n    cancel: runtimeCancel,\n    events: session.eventQueue.events,",
    'pass queued events into runtime',
  );
  return source;
});

console.log('Reactive runtime core patch applied.');

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
