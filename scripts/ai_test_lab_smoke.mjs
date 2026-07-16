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

function expectPositiveUnitSpeeds(relativePath) {
  const values = JSON.parse(read(relativePath));
  if (!Array.isArray(values) || values.length === 0) {
    failures.push(`${relativePath}: expected a non-empty unit array`);
    return;
  }
  for (const unit of values) {
    if (typeof unit?.speedCellsPerSecond !== 'number' || unit.speedCellsPerSecond <= 0) {
      failures.push(`${relativePath}: unit ${String(unit?.id ?? 'unknown')} must have a positive speedCellsPerSecond`);
    }
  }
}

expectIncludes('src/core/units/UnitModel.ts', [
  'speedCellsPerSecond ?? 0.5',
  'sourceToRuntimeCellScale',
  'initialState: UnitInitialState',
  'tacticalKnowledge: UnitTacticalKnowledge',
  'applyInitialStateToRuntime',
]);
expectPositiveUnitSpeeds('src/data/units/test_units.json');
expectIncludes('src/core/behavior/BehaviorModel.ts', [
  'suppression: number',
  'ammo: number',
  'weaponReady: boolean',
  'export interface UnitInitialState',
  'createUnitInitialState',
]);
expectIncludes('src/core/pressure/PressureZone.ts', [
  "export type PressureZoneMode = 'area' | 'directional_fire'",
  'sourceToRuntimeCellScale',
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
  'runtimeMetersPerCell',
  'sourceToRuntimeCellScale',
  'coverProtection',
  'coverReliability',
  'concealment',
  'penetrable',
  'coverPosture',
]);
expectIncludes('src/core/simulation/ResolutionAwareScene.ts', [
  'DEFAULT_RUNTIME_METERS_PER_CELL = 2',
  'createResolutionAwareInitialState',
  'replaceSceneAtRuntimeResolution',
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
  'UNCERTAINTY_GROWTH_METERS_PER_SECOND',
  'confidence',
  'uncertaintyCells',
]);
expectIncludes('src/core/knowledge/SoldierAwarenessGrid.ts', [
  'SoldierAwarenessMode',
  'buildSoldierAwarenessReport',
  'SAFE_SEARCH_RADIUS_METERS',
  'bestSafePositions',
  'routeDanger',
  "'stealth'",
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
  'state.editor.enabled',
]);
expectIncludes('src/input/BoardInputController.ts', [
  'getAiLabRuntime',
  'beginAiLabPointerAction',
  'resolveAiLabCursor',
  'selectSimulationCoverAtPosition',
]);
expectIncludes('src/rendering/PixiThreatEditorRenderer.ts', [
  'НАПРАВЛЕНИЕ',
  'ДАЛЬНОСТЬ',
  'ШИРИНА СЕКТОРА',
  'МЁРТВАЯ ЗОНА',
  'state.editor.enabled || runtime.open',
]);
expectIncludes('src/rendering/PixiAwarenessHeatmapRenderer.ts', [
  'buildAwarenessWorldKey',
  'buildBestSafePositionsFromWorldField',
  'currentMode',
  'STEALTH_PIXEL_LUT',
  'drawAwarenessRasterWords',
  'new Worker',
  'AwarenessWorldWorker.ts',
  'workerJobsCoalesced',
  'workerResultsStaleDropped',
]);
expectIncludes('src/workers/AwarenessWorldWorker.ts', [
  'buildAwarenessWorldField',
  'awarenessWorkerTransferables',
  'fieldIdentity',
  'rasterDigest',
]);
expectIncludes('src/core/knowledge/AwarenessWorldFieldBuilder.ts', [
  'buildSoldierAwarenessReport',
  'dangerPixels',
  'stealthPixels',
  'digestAwarenessWorldField',
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
  'scene-export-v10-physical-movement-runtime-2m-grid',
  'replaceSceneAtRuntimeResolution',
  'coverReliability',
  'directionDegrees',
  'initialState',
  'tacticalKnowledge',
]);
expectIncludes('src/ui/TacticalWorkspace.ts', [
  'Симуляция',
  'Редактирование',
  'Слой опасности',
  'Слой скрытности',
  'Обзор и память',
]);
expectIncludes('tests/preview-screenshots.spec.ts', [
  '01-simulation-info.png',
  '02-simulation-sidebar-collapsed.png',
  '03-simulation-danger-layer.png',
  '04-simulation-cover-selected.png',
  '05-simulation-stealth-layer.png',
  '06-simulation-memory-layer.png',
  '07-editor-object-palette.png',
  '08-editor-threat-tools.png',
  '09-editor-terrain-tools.png',
  '10-node-editor-unchanged.png',
]);

if (failures.length > 0) {
  console.error('AI test lab smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AI test lab smoke passed.');
