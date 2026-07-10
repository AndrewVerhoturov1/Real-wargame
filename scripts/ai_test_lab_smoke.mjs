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

expectIncludes('src/core/units/UnitModel.ts', [
  'speedCellsPerSecond ?? 0.5',
  'initialState: UnitInitialState',
  'tacticalKnowledge: UnitTacticalKnowledge',
  'applyInitialStateToRuntime',
]);
expectIncludes('src/data/units/test_units.json', ['"speedCellsPerSecond": 0.5']);
expectIncludes('src/core/behavior/BehaviorModel.ts', [
  'suppression: number',
  'ammo: number',
  'weaponReady: boolean',
  'export interface UnitInitialState',
  'createUnitInitialState',
]);
expectIncludes('src/core/pressure/PressureZone.ts', [
  "export type PressureZoneMode = 'area' | 'directional_fire'",
  'directionDegrees',
  'arcDegrees',
  'rangeCells',
  'suppression',
  'sourceVisible',
  'sourceKnown',
  'knowledgeConfidence',
  'uncertaintyCells',
]);
expectIncludes('src/core/pressure/ThreatEvaluation.ts', [
  'evaluateThreatsAtPosition',
  'isInsideDirectionalThreat',
  'expectedProtection',
]);
expectIncludes('src/core/map/MapModel.ts', [
  'coverProtection',
  'coverReliability',
  'concealment',
  'penetrable',
  'coverPosture',
]);
expectIncludes('src/core/cover/CoverEvaluation.ts', [
  'findBestCoverForThreat',
  'evaluateCoverBetween',
]);
expectIncludes('src/core/cover/SmallArmsCoverEvaluation.ts', [
  'evaluateSmallArmsCover',
  'evaluateForestCover',
  'evaluateReliefCover',
  'expectedProtection',
]);
expectIncludes('src/core/knowledge/SoldierThreatMemory.ts', [
  'KnownThreatMemory',
  'syncSoldierThreatMemory',
  'confidence',
  'uncertaintyCells',
]);
expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'SoldierAwarenessMode',
  'buildSoldierAwarenessReport',
  'bestSafePositions',
  'routeDanger',
]);
expectIncludes('src/core/testing/AiLabRuntime.ts', [
  "export type AiLabTool = 'select' | 'place_fighter' | 'place_threat' | 'place_cover' | 'delete'",
  'setAiLabTool',
  'setAwarenessMode',
  'duplicateSelectedLabEntity',
]);
expectIncludes('src/core/testing/AiLabInteraction.ts', [
  'beginAiLabPointerAction',
  'updateAiLabPointerAction',
  'finishAiLabPointerAction',
  'resolveAiLabCursor',
  "'direction'",
  "'range'",
  "'arc_left'",
  "'arc_right'",
  "'min_range'",
  "'radius'",
  "'rect_rotate'",
]);
expectIncludes('src/input/BoardInputController.ts', [
  'getAiLabRuntime',
  'beginAiLabPointerAction',
  'resolveAiLabCursor',
]);
expectIncludes('src/rendering/PixiThreatEditorRenderer.ts', [
  'НАПРАВЛЕНИЕ',
  'ДАЛЬНОСТЬ',
  'ШИРИНА СЕКТОРА',
  'МЁРТВАЯ ЗОНА',
]);
expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'buildSoldierAwarenessReport',
  'bestSafePositions',
  'awarenessMode',
]);
expectIncludes('src/rendering/PixiApp.ts', [
  'PixiThreatEditorRenderer',
  'PixiAwarenessHeatmapRenderer',
  'awarenessHeatmapRenderer.render(this.state)',
  'threatEditorRenderer.render(this.state)',
]);
expectIncludes('src/ui/AiTestLabControls.ts', [
  'Постоянные характеристики',
  'Начальное состояние',
  'Текущее состояние — изменяется игрой',
  'Разместить бойца',
  'Разместить угрозу',
  'Разместить укрытие',
  'Карта бойца',
  'Скопировать текущее в начальное',
  'Сила защиты',
  'Надёжность защиты',
  'Ожидаемая защита',
]);
expectIncludes('src/ai-test-lab.css', [
  'body.ai-lab-open #app',
  '.ai-lab-top-tools',
  '.ai-lab-dock',
  '.ai-lab-bottom-bar',
  'cursor-crosshair-threat',
]);
expectIncludes('src/core/ai/AiGameBridge.ts', [
  'evaluateNow()',
  'unit.behaviorRuntime.ammo',
  'unit.behaviorRuntime.weaponReady',
  'directionToThreat',
  'coverProtection',
  'currentPositionDanger',
  'currentExpectedProtection',
  'bestSafePositionScore',
  'distanceToBestSafePosition',
  'routeDanger',
  'threatConfidence',
]);
expectIncludes('src/ai-node-editor/ai-test-lab-node-options.ts', [
  'currentPositionDanger',
  'currentExpectedProtection',
  'bestSafePositionScore',
  'distanceToBestSafePosition',
  'routeDanger',
  'threatConfidence',
]);
expectIncludes('src/core/testing/AiTestLabRuntime.ts', [
  'AI_TEST_TIME_SCALES = [0.25, 0.5, 1, 2, 4, 10] as const',
  'getAiTestTimeScale',
  'setAiTestTimeScale',
  'resetSelectedUnitForTest',
  'resetAiTestScene',
]);
expectIncludes('src/core/simulation/SimulationTick.ts', [
  'getAiTestTimeScale',
  'syncSoldierThreatMemory',
]);
expectIncludes('src/ui/SceneExport.ts', [
  'scene-export-v4',
  'coverReliability',
  'directionDegrees',
  'initialState',
  'tacticalKnowledge',
]);
expectIncludes('tests/preview-screenshots.spec.ts', [
  '15-ai-lab-integrated-layout.png',
  '16-ai-lab-threat-handles.png',
  '17-ai-lab-threat-reshaped.png',
  '18-ai-lab-soldier-state.png',
  '19-ai-lab-awareness-danger.png',
  '20-ai-lab-awareness-safe.png',
]);

if (failures.length > 0) {
  console.error('AI test lab smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AI test lab smoke passed.');
