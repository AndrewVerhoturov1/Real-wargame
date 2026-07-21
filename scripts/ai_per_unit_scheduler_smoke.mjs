import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-ai-per-unit-scheduler-smoke');
const sourceFile = path.join(repoRoot, 'scripts', 'ai_per_unit_scheduler_smoke.ts');
const adaptedSourceFile = path.join(repoRoot, 'scripts', '.tmp-ai-per-unit-scheduler-posture-smoke.ts');
const entryFile = path.join(outDir, 'ai-per-unit-scheduler-smoke.mjs');

await rm(outDir, { recursive: true, force: true });
try {
  const source = await readFile(sourceFile, 'utf8');
  await writeFile(adaptedSourceFile, adaptForPhysicalPosture(source));
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: adaptedSourceFile,
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'ai-per-unit-scheduler-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
  await rm(adaptedSourceFile, { force: true });
}

function adaptForPhysicalPosture(source) {
  let result = source;
  result = replaceOnce(result,
    "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';\nimport { isPostureTransitionRunning, postureTransitionDurationSeconds } from '../src/core/actions/PostureTransition';",
  );
  result = replaceOnce(result,
    "import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';",
    "import { createInitialState as createInitialStateBase, type SimulationState } from '../src/core/simulation/SimulationState';",
  );
  result = replaceOnce(result,
    "import { tickSimulation } from '../src/core/simulation/SimulationTick';",
    "import { tickSimulation } from '../src/core/simulation/SimulationTick';\nimport { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';",
  );
  result = replaceOnce(result,
    "const storage = new Map<string, string>();",
    "const storage = new Map<string, string>();\nconst createdStates = new Set<SimulationState>();",
  );
  result = replaceOnce(result,
    "  const workspaceSource = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');",
    "  const workspaceSource = [readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8'), readFileSync('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8')].join('\\n');",
  );
  result = replaceOnce(result,
    "  const bridgeSource = readFileSync('src/core/ai/AiGameBridge.ts', 'utf8');",
    "  const bridgeSource = [readFileSync('src/core/ai/AiGameBridge.ts', 'utf8'), readFileSync('src/core/ai/AiGameBridgeLegacy.ts', 'utf8')].join('\\n');",
  );
  result = replaceOnce(result,
    "readFileSync('src/core/simulation/SimulationState.ts', 'utf8')",
    "[readFileSync('src/core/simulation/SimulationState.ts', 'utf8'), readFileSync('src/core/simulation/SimulationStateLegacy.ts', 'utf8')].join('\\n')",
  );
  result = replaceOnce(result,
    "console.log('AI per-unit scheduler smoke passed:",
    "for (const state of createdStates) clearStaticTacticalPositionService(state);\n\nconsole.log('AI per-unit scheduler smoke passed:",
  );
  result = replaceOnce(result,
    "  assert.equal(unit.behaviorRuntime.posture, 'crouched');\n\n  tickSimulation(state, 0.59);",
    "  assert.equal(unit.behaviorRuntime.posture, 'standing', 'a graph posture command must not change the effective posture instantly');\n  assert.equal(isPostureTransitionRunning(unit), true, 'the first graph decision must start the physical posture action');\n  assert.equal(unit.behaviorRuntime.physicalAction?.targetPosture, 'crouched');\n\n  tickSimulation(state, 0.59);\n  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'the graph-requested posture must apply after its physical duration');\n  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');",
  );
  result = replaceOnce(result,
    "  assert.equal(unit.behaviorRuntime.aiLastReactiveWakeAtMs, 360);\n  assert.equal(unit.behaviorRuntime.posture, 'prone');",
    "  assert.equal(unit.behaviorRuntime.aiLastReactiveWakeAtMs, 360);\n  assert.equal(unit.behaviorRuntime.posture, 'standing', 'reactive Graph v2 must request rather than instantly apply posture');\n  assert.equal(unit.behaviorRuntime.physicalAction?.targetPosture, 'prone');\n  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));\n  assert.equal(unit.behaviorRuntime.posture, 'prone');",
  );
  result = replaceOnce(result,
    "  assert.equal(fine.posture, 'prone');",
    "  assert.equal(fine.posture, 'crouched', 'the physical standing-to-prone action must have reached only its crouched stage by 610 ms');",
  );
  result = replaceOnce(result,
    "    posture: unit.behaviorRuntime.posture,\n    action: unit.behaviorRuntime.currentAction,",
    "    posture: unit.behaviorRuntime.posture,\n    physicalAction: unit.behaviorRuntime.physicalAction ? {\n      targetPosture: unit.behaviorRuntime.physicalAction.targetPosture,\n      progress: round(unit.behaviorRuntime.physicalAction.progress),\n      status: unit.behaviorRuntime.physicalAction.status,\n      startedSeconds: round(unit.behaviorRuntime.physicalAction.startedSeconds),\n    } : null,\n    action: unit.behaviorRuntime.currentAction,",
  );
  result = replaceOnce(result,
    "  assert.equal(threatened.behaviorRuntime.posture, 'prone', 'unselected graph must read current danger and react defensively on its first step');",
    "  assert.equal(threatened.behaviorRuntime.posture, 'standing', 'unselected graph must not bypass physical posture timing');\n  assert.equal(threatened.behaviorRuntime.physicalAction?.targetPosture, 'prone', 'unselected graph must react defensively on its first step');\n  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));\n  assert.equal(threatened.behaviorRuntime.posture, 'prone');",
  );
  result = replaceOnce(result,
    "function findUnit(state: SimulationState, id: string): UnitModel {",
    "function createInitialState(...args: Parameters<typeof createInitialStateBase>): SimulationState {\n  const state = createInitialStateBase(...args);\n  createdStates.add(state);\n  return state;\n}\n\nfunction findUnit(state: SimulationState, id: string): UnitModel {",
  );
  return result;
}

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Scheduler posture adaptation marker not found: ${search.slice(0, 100)}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Scheduler posture adaptation marker is ambiguous: ${search.slice(0, 100)}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}
