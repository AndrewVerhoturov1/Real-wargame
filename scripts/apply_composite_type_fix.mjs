import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/runtime/AiCompositeGraphRuntime.ts', (source) => {
  source = replaceOnce(
    source,
    '      const cancelled = cancelActiveAction(environment, validation.activeNode, validation.frames, input.executionState);',
    '      const cancelled = cancelActiveAction(environment, validation.activeNode, input.executionState);',
    'remove unused cancel frames argument at call site',
  );
  source = replaceOnce(
    source,
    "function cancelActiveAction(\n  environment: RuntimeEnvironment,\n  node: AiNode,\n  frames: readonly AiCompositeFrame[],\n  executionState: AiGraphExecutionState,\n): ExecutionOutcome {",
    "function cancelActiveAction(\n  environment: RuntimeEnvironment,\n  node: AiNode,\n  executionState: AiGraphExecutionState,\n): ExecutionOutcome {",
    'remove unused cancel frames parameter',
  );
  source = replaceOnce(
    source,
    'function success(reason: string, reasonRu: string): ExecutionOutcome {',
    "function success(reason: string, reasonRu: string): Extract<ExecutionOutcome, { kind: 'success' }> {",
    'narrow success helper result',
  );
  source = replaceOnce(
    source,
    'function failure(reason: string, reasonRu: string): ExecutionOutcome {',
    "function failure(reason: string, reasonRu: string): Extract<ExecutionOutcome, { kind: 'failure' }> {",
    'narrow failure helper result',
  );
  source = replaceOnce(
    source,
    'function cancelled(reason: string, reasonRu: string, details?: ActionDetails): ExecutionOutcome {',
    "function cancelled(reason: string, reasonRu: string, details?: ActionDetails): Extract<ExecutionOutcome, { kind: 'cancelled' }> {",
    'narrow cancelled helper result',
  );
  return source;
});

await patch('src/core/ai/runtime/AiRuntimeSession.ts', (source) => replaceOnce(
  source,
  '  const frames = value.frames === undefined ? undefined : normalizeCompositeFrames(value.frames);',
  '  const frames = value.frames === undefined ? undefined : normalizeCompositeFrames(value.frames) ?? undefined;',
  'normalize nullable composite frames',
));

console.log('Composite runtime type corrections applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(path, after);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
