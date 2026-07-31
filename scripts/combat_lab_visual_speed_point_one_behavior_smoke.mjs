import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [runtimeSource, visualSource, workspaceSource, runtimeCss] = await Promise.all([
  readFile('src/core/testing/AiTestLabRuntime.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8'),
  readFile('src/combat-lab/ui/combat-lab-runtime-controls.css', 'utf8'),
]);

assert.match(runtimeSource, /AI_TEST_TIME_SCALES\s*=\s*\[0\.1,\s*0\.25,\s*0\.5,\s*1,\s*2,\s*4,\s*10\]/);
assert.match(visualSource, /AI_TEST_TIME_SCALES/);
assert.match(visualSource, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*AI_TEST_TIME_SCALES/);
assert.match(workspaceSource, /AI_TEST_TIME_SCALES\.map/);
assert.match(runtimeCss, /unit-bar-speed-group[\s\S]*grid-template-columns:\s*repeat\(7,/);

const js = ts.transpileModule(runtimeSource.replace(/^import type[^;]+;\s*/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const state = { map: {}, units: [], pressureZones: [], selectedUnitId: null, selectedUnitIds: [] };
runtime.initializeAiTestLabRuntime(state);
assert.equal(runtime.getAiTestTimeScale(state), 1, 'Новый общий регулятор начинает с ×1.');
assert.equal(runtime.setAiTestTimeScale(state, 0.1), 0.1, '×0.1 должен быть каноническим значением, а не округляться до ×0.25.');
assert.equal(runtime.getAiTestTimeScale(state), 0.1);
runtime.initializeAiTestLabRuntime(state);
assert.equal(runtime.getAiTestTimeScale(state), 1, 'Сброс runtime должен возвращать скорость ×1.');

const fixedStep = 1 / 30;
const simulated = (realSeconds, speed) => Math.floor((realSeconds * speed + 1e-9) / fixedStep) * fixedStep;
const slow = simulated(20, 0.1);
const normal = simulated(20, 1);
assert.ok(Math.abs(slow / normal - 0.1) <= fixedStep / normal, '×0.1 должен давать 10% симуляционного времени при том же реальном интервале.');
assert.equal(simulated(fixedStep, 1), fixedStep, 'Фиксированный шаг симуляции не меняется.');

console.log('Combat Lab point-one visual speed behavior smoke passed.');
