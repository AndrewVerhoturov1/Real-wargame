import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];

function expectIncludes(relativePath, snippets) {
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

expectIncludes('src/core/units/UnitModel.ts', ['speedCellsPerSecond ?? 0.5']);
expectIncludes('src/data/units/test_units.json', ['"speedCellsPerSecond": 0.5']);
expectIncludes('src/core/behavior/BehaviorModel.ts', ['suppression: number', 'ammo: number', 'weaponReady: boolean']);
expectIncludes('src/core/pressure/PressureZone.ts', [
  "export type PressureZoneMode = 'area' | 'directional_fire'",
  'directionDegrees',
  'arcDegrees',
  'rangeCells',
  'suppression',
  'sourceVisible',
  'sourceKnown',
]);
expectIncludes('src/core/pressure/ThreatEvaluation.ts', [
  'evaluateThreatsAtPosition',
  'isInsideDirectionalThreat',
  'coverProtection',
]);
expectIncludes('src/core/map/MapModel.ts', [
  'coverProtection',
  'concealment',
  'penetrable',
  'coverPosture',
]);
expectIncludes('src/core/cover/CoverEvaluation.ts', [
  'findBestCoverForThreat',
  'evaluateCoverBetween',
]);
expectIncludes('src/core/ai/AiGameBridge.ts', [
  'evaluateNow()',
  'unit.behaviorRuntime.ammo',
  'unit.behaviorRuntime.weaponReady',
  'directionToThreat',
  'coverProtection',
]);
expectIncludes('src/ui/AiTestLabControls.ts', [
  'Один расчёт ИИ',
  'Рассчитать и выполнить',
  'Сбросить бойца',
  'AI_TEST_TIME_SCALES',
  'setAiTestLabSelectionTarget',
  'Щёлкните по сектору или его источнику',
  'зелёная стрелка на карте показывает защищённую сторону',
]);
expectIncludes('src/core/testing/AiTestLabSelection.ts', [
  "export type AiTestLabSelectionTarget = 'fighter' | 'threat' | 'cover' | null",
  'setAiTestLabSelectionTarget',
  'selectAiTestLabTargetAtPosition',
  'isInsideDirectionalThreat',
]);
expectIncludes('src/input/BoardInputController.ts', [
  'getAiTestLabSelectionTarget',
  'selectAiTestLabTargetAtPosition',
]);
expectIncludes('src/rendering/PixiCoverDirectionRenderer.ts', [
  'ЗАЩИЩЁННАЯ СТОРОНА',
  'НАПРАВЛЕНИЕ ОГНЯ',
  'getSelectedMapObject',
  'getSelectedPressureZone',
]);
expectIncludes('src/rendering/PixiApp.ts', [
  'PixiCoverDirectionRenderer',
  'coverDirectionRenderer.render(this.state)',
]);
expectIncludes('src/core/testing/AiTestLabRuntime.ts', [
  'AI_TEST_TIME_SCALES = [0.25, 0.5, 1, 2, 4, 10] as const',
  'getAiTestTimeScale',
  'setAiTestTimeScale',
  'resetSelectedUnitForTest',
  'resetAiTestScene',
]);
expectIncludes('src/core/simulation/SimulationTick.ts', ['getAiTestTimeScale']);
expectIncludes('src/rendering/PixiOverlayRenderer.ts', ['directional_fire', 'arcDegrees']);
expectIncludes('src/ui/SceneExport.ts', ['scene-export-v3', 'coverProtection', 'directionDegrees', 'soldier:']);

if (failures.length > 0) {
  console.error('AI test lab smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AI test lab smoke passed.');
