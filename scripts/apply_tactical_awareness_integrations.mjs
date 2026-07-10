import fs from 'node:fs';

// One-time deterministic integration patch. The workflow deletes this file after success.
function replaceOnce(file, from, to) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}\n${from}`);
  fs.writeFileSync(file, source.replace(from, to), 'utf8');
  console.log(`patched ${file}`);
}

replaceOnce('src/core/map/MapModel.ts',
`export interface CoverProperties {
  coverProtection: number;
  concealment: number;`,
`export interface CoverProperties {
  coverProtection: number;
  coverReliability: number;
  concealment: number;`);
replaceOnce('src/core/map/MapModel.ts',
`  coverProtection?: number;
  concealment?: number;`,
`  coverProtection?: number;
  coverReliability?: number;
  concealment?: number;`);
replaceOnce('src/core/map/MapModel.ts',
`  coverProtection?: number;
  concealment?: number;
  penetrable?: boolean;`,
`  coverProtection?: number;
  coverReliability?: number;
  concealment?: number;
  penetrable?: boolean;`);
replaceOnce('src/core/map/MapModel.ts',
`export function getDefaultObjectCoverProperties(kind: MapObjectKind): CoverProperties {
  switch (kind) {
    case 'structure':
      return { coverProtection: 92, concealment: 95, penetrable: false, coverPosture: 'standing' };
    case 'cover':
      return { coverProtection: 88, concealment: 70, penetrable: false, coverPosture: 'crouched' };
    case 'ditch':
      return { coverProtection: 82, concealment: 65, penetrable: false, coverPosture: 'prone' };
    case 'logs':
      return { coverProtection: 76, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'rock':
      return { coverProtection: 72, concealment: 40, penetrable: false, coverPosture: 'crouched' };
    case 'crates':
      return { coverProtection: 58, concealment: 55, penetrable: true, coverPosture: 'crouched' };
    case 'fence':
      return { coverProtection: 35, concealment: 70, penetrable: true, coverPosture: 'crouched' };
    case 'tree':
      return { coverProtection: 42, concealment: 55, penetrable: true, coverPosture: 'standing' };
    case 'post':
      return { coverProtection: 45, concealment: 35, penetrable: true, coverPosture: 'crouched' };
    case 'well':
      return { coverProtection: 62, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'bridge':
      return { coverProtection: 20, concealment: 10, penetrable: true, coverPosture: 'prone' };
  }
}`,
`export function getDefaultObjectCoverProperties(kind: MapObjectKind): CoverProperties {
  switch (kind) {
    case 'structure': return { coverProtection: 92, coverReliability: 96, concealment: 95, penetrable: false, coverPosture: 'standing' };
    case 'cover': return { coverProtection: 88, coverReliability: 90, concealment: 70, penetrable: false, coverPosture: 'crouched' };
    case 'ditch': return { coverProtection: 82, coverReliability: 86, concealment: 65, penetrable: false, coverPosture: 'prone' };
    case 'logs': return { coverProtection: 76, coverReliability: 72, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'rock': return { coverProtection: 72, coverReliability: 68, concealment: 40, penetrable: false, coverPosture: 'crouched' };
    case 'crates': return { coverProtection: 58, coverReliability: 62, concealment: 55, penetrable: true, coverPosture: 'crouched' };
    case 'fence': return { coverProtection: 35, coverReliability: 46, concealment: 70, penetrable: true, coverPosture: 'crouched' };
    case 'tree': return { coverProtection: 42, coverReliability: 34, concealment: 55, penetrable: true, coverPosture: 'standing' };
    case 'post': return { coverProtection: 45, coverReliability: 38, concealment: 35, penetrable: true, coverPosture: 'crouched' };
    case 'well': return { coverProtection: 62, coverReliability: 64, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'bridge': return { coverProtection: 20, coverReliability: 28, concealment: 10, penetrable: true, coverPosture: 'prone' };
  }
}`);
replaceOnce('src/core/map/MapModel.ts',
`    coverProtection: clampPercent(object.coverProtection ?? defaults.coverProtection),
    concealment: clampPercent(object.concealment ?? defaults.concealment),`,
`    coverProtection: clampPercent(object.coverProtection ?? defaults.coverProtection),
    coverReliability: clampPercent(object.coverReliability ?? defaults.coverReliability),
    concealment: clampPercent(object.concealment ?? defaults.concealment),`);
replaceOnce('src/core/map/MapModel.ts',
`      coverProtection: clampPercent(object.coverProtection ?? cover.coverProtection),
      concealment: clampPercent(object.concealment ?? cover.concealment),`,
`      coverProtection: clampPercent(object.coverProtection ?? cover.coverProtection),
      coverReliability: clampPercent(object.coverReliability ?? cover.coverReliability),
      concealment: clampPercent(object.concealment ?? cover.concealment),`);

replaceOnce('src/core/editor/GameEditorDrafts.ts',
`  coverProtection: number;
  concealment: number;`,
`  coverProtection: number;
  coverReliability: number;
  concealment: number;`);
replaceOnce('src/core/editor/GameEditorDrafts.ts',
`  heightCells: number;
  strength: number;`,
`  heightCells: number;
  rotationDegrees: number;
  strength: number;`);
replaceOnce('src/core/editor/GameEditorDrafts.ts',
`  sourceVisible: boolean;
  sourceKnown: boolean;`,
`  sourceVisible: boolean;
  sourceKnown: boolean;
  knowledgeConfidence: number;
  uncertaintyCells: number;`);
replaceOnce('src/core/editor/GameEditorDrafts.ts',
`    coverProtection: cover.coverProtection,
    concealment: cover.concealment,`,
`    coverProtection: cover.coverProtection,
    coverReliability: cover.coverReliability,
    concealment: cover.concealment,`);
replaceOnce('src/core/editor/GameEditorDrafts.ts',
`      heightCells: 3,
      strength: 70,`,
`      heightCells: 3,
      rotationDegrees: 0,
      strength: 70,`);
replaceOnce('src/core/editor/GameEditorDrafts.ts',
`      sourceVisible: true,
      sourceKnown: true,`,
`      sourceVisible: true,
      sourceKnown: true,
      knowledgeConfidence: 100,
      uncertaintyCells: 0.15,`);

replaceOnce('src/core/editor/GameEditorPlacement.ts',
`      coverProtection: draft.coverProtection,
      concealment: draft.concealment,`,
`      coverProtection: draft.coverProtection,
      coverReliability: draft.coverReliability,
      concealment: draft.concealment,`);
replaceOnce('src/core/editor/GameEditorPlacement.ts',
`      runtime: {
        posture: draft.posture,
        stress: draft.stress,
        suppression: draft.suppression,
        ammo: Math.round(draft.ammo),
        weaponReady: draft.weaponReady,
      },`,
`      initialState: {
        posture: draft.posture,
        stress: draft.stress,
        suppression: draft.suppression,
        ammo: Math.round(draft.ammo),
        weaponReady: draft.weaponReady,
        fatigue: draft.condition.fatigue,
        morale: draft.condition.morale,
        confusion: draft.condition.confusion,
        health: draft.condition.health,
      },`);
replaceOnce('src/core/editor/GameEditorPlacement.ts',
`    heightCells: draft.heightCells,
    strength: draft.strength,`,
`    heightCells: draft.heightCells,
    rotationDegrees: draft.rotationDegrees,
    strength: draft.strength,`);
replaceOnce('src/core/editor/GameEditorPlacement.ts',
`    sourceVisible: draft.sourceVisible,
    sourceKnown: draft.sourceKnown,`,
`    sourceVisible: draft.sourceVisible,
    sourceKnown: draft.sourceKnown,
    knowledgeConfidence: draft.knowledgeConfidence,
    uncertaintyCells: draft.uncertaintyCells,`);

replaceOnce('src/core/simulation/SimulationState.ts',
`  selectionBox: SelectionBox | null;
  editor: EditorState;`,
`  selectionBox: SelectionBox | null;
  simulationTimeSeconds: number;
  editor: EditorState;`);
replaceOnce('src/core/simulation/SimulationState.ts',
`    selectionBox: null,
    editor: {`,
`    selectionBox: null,
    simulationTimeSeconds: 0,
    editor: {`);

replaceOnce('src/core/simulation/SimulationTick.ts',
`import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';`,
`import { syncSoldierThreatMemory } from '../knowledge/SoldierThreatMemory';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';`);
replaceOnce('src/core/simulation/SimulationTick.ts',
`  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);

  for (const unit of state.units) {
    updateMetrics(unit, state, scaledDeltaSeconds);`,
`  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);
  state.simulationTimeSeconds += scaledDeltaSeconds;

  for (const unit of state.units) {
    updateMetrics(unit, state, scaledDeltaSeconds);
    syncSoldierThreatMemory(state, unit, scaledDeltaSeconds);`);

replaceOnce('src/core/cover/CoverEvaluation.ts',
`import type { UnitPosture } from '../behavior/BehaviorModel';`,
`import type { UnitPosture } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover } from './SmallArmsCoverEvaluation';`);
replaceOnce('src/core/cover/CoverEvaluation.ts',
`export function evaluateCoverBetween(
  map: TacticalMap,
  threatPosition: GridPosition,
  unitPosition: GridPosition,
  posture: UnitPosture,
): CoverProtectionResult {
  let best: CoverProtectionResult = {
    object: null,
    protection: 0,
    concealment: 0,
    blocksThreat: false,
  };

  for (const object of map.objects) {
    const properties = resolveObjectCoverProperties(object);
    if (!postureFitsCover(posture, properties.coverPosture)) continue;

    const center = objectCenter(object);
    const segment = distanceToSegment(center, threatPosition, unitPosition);
    const hitRadius = Math.max(0.3, Math.min(object.widthCells, object.heightCells) * 0.7);

    if (segment.t <= 0.05 || segment.t >= 0.97 || segment.distance > hitRadius) continue;

    const protection = clampPercent(properties.coverProtection * (properties.penetrable ? 0.55 : 1));
    if (protection <= best.protection) continue;

    best = {
      object,
      protection,
      concealment: properties.concealment,
      blocksThreat: protection > 0,
    };
  }

  return best;
}`,
`export function evaluateCoverBetween(
  map: TacticalMap,
  threatPosition: GridPosition,
  unitPosition: GridPosition,
  posture: UnitPosture,
): CoverProtectionResult {
  const result = evaluateSmallArmsCover(map, threatPosition, unitPosition, posture);
  return {
    object: result.object,
    protection: result.expectedProtection,
    concealment: result.concealment,
    blocksThreat: result.expectedProtection > 0,
  };
}`);

replaceOnce('src/core/pressure/ThreatEvaluation.ts',
`import { evaluateCoverBetween } from '../cover/CoverEvaluation';`,
`import { evaluateSmallArmsCover } from '../cover/SmallArmsCoverEvaluation';`);
replaceOnce('src/core/pressure/ThreatEvaluation.ts',
`  coverProtection: number;
}`,
`  coverProtection: number;
  expectedProtection: number;
}`);
replaceOnce('src/core/pressure/ThreatEvaluation.ts',
`  const cover = evaluateCoverBetween(map, source, unit.position, unit.behaviorRuntime.posture);
  const coverMultiplier = 1 - cover.protection / 100;`,
`  const cover = evaluateSmallArmsCover(map, source, unit.position, unit.behaviorRuntime.posture);
  const coverMultiplier = 1 - cover.expectedProtection / 100;`);
replaceOnce('src/core/pressure/ThreatEvaluation.ts',
`    coverProtection: cover.protection,
  };`,
`    coverProtection: cover.expectedProtection,
    expectedProtection: cover.expectedProtection,
  };`);

replaceOnce('src/ai-node-editor/ai-test-lab-node-options.ts',
`  { value: 'bestCoverQuality', labelRu: 'Качество лучшего укрытия', labelEn: 'Best cover quality' },`,
`  { value: 'bestCoverQuality', labelRu: 'Качество лучшего укрытия', labelEn: 'Best cover quality' },
  { value: 'currentPositionDanger', labelRu: 'Опасность текущей позиции', labelEn: 'Current position danger' },
  { value: 'currentExpectedProtection', labelRu: 'Ожидаемая защита позиции', labelEn: 'Current expected protection' },
  { value: 'bestSafePositionScore', labelRu: 'Оценка лучшей безопасной позиции', labelEn: 'Best safe position score' },
  { value: 'distanceToBestSafePosition', labelRu: 'Расстояние до безопасной позиции', labelEn: 'Distance to best safe position' },
  { value: 'routeDanger', labelRu: 'Опасность текущего маршрута', labelEn: 'Current route danger' },
  { value: 'threatConfidence', labelRu: 'Уверенность в главной угрозе', labelEn: 'Main threat confidence' },`);

replaceOnce('src/core/ai/AiGameBridge.ts',
`import { distance, type GridPosition } from '../geometry';`,
`import { distance, type GridPosition } from '../geometry';
import { buildSoldierAwarenessReport } from '../knowledge/SoldierAwarenessGrid';`);
replaceOnce('src/core/ai/AiGameBridge.ts',
`  const underFire = threats.danger > 0 || threats.suppression > 0;

  return {`,
`  const underFire = threats.danger > 0 || threats.suppression > 0;
  const awareness = buildSoldierAwarenessReport(state, unit);
  const bestSafe = awareness.bestSafePositions[0];

  return {`);
replaceOnce('src/core/ai/AiGameBridge.ts',
`    bestCoverQuality: Math.max(0, Math.round(bestCover.score)),
    current_action:`,
`    bestCoverQuality: Math.max(0, Math.round(bestCover.score)),
    currentPositionDanger: awareness.currentPosition.danger,
    currentExpectedProtection: awareness.currentPosition.expectedProtection,
    bestSafePositionScore: Math.max(0, Math.round(bestSafe?.score ?? 0)),
    distanceToBestSafePosition: Math.round((bestSafe?.distanceCells ?? 9999) * state.map.metersPerCell),
    routeDanger: awareness.routeDanger,
    threatConfidence: awareness.threatConfidence,
    current_action:`);
replaceOnce('src/core/ai/AiGameBridge.ts',
`    best_cover_position: bestCover.position,`,
`    best_cover_position: bestSafe?.position ?? bestCover.position,`);

replaceOnce('src/ui/SceneExport.ts', `version: 'scene-export-v3'`, `version: 'scene-export-v4'`);
replaceOnce('src/ui/SceneExport.ts',
`          coverProtection: roundOne(cover.coverProtection),
          concealment: roundOne(cover.concealment),`,
`          coverProtection: roundOne(cover.coverProtection),
          coverReliability: roundOne(cover.coverReliability),
          concealment: roundOne(cover.concealment),`);
replaceOnce('src/ui/SceneExport.ts',
`        heightCells: roundThree(zone.heightCells),
        strength: roundOne(zone.strength),`,
`        heightCells: roundThree(zone.heightCells),
        rotationDegrees: roundOne(zone.rotationDegrees ?? 0),
        strength: roundOne(zone.strength),`);
replaceOnce('src/ui/SceneExport.ts',
`        sourceVisible: settings.sourceVisible,
        sourceKnown: settings.sourceKnown,`,
`        sourceVisible: settings.sourceVisible,
        sourceKnown: settings.sourceKnown,
        knowledgeConfidence: roundOne(zone.knowledgeConfidence ?? 100),
        uncertaintyCells: roundThree(zone.uncertaintyCells ?? 0.15),
        knowledgeSource: zone.knowledgeSource,`);
replaceOnce('src/ui/SceneExport.ts',
`    soldier: {
      traits: { ...unit.soldier.traits },
      condition: { ...unit.soldier.condition },
    },
    runtime: {`,
`    soldier: {
      traits: { ...unit.soldier.traits },
      condition: { ...unit.soldier.condition },
    },
    initialState: { ...unit.initialState },
    tacticalKnowledge: JSON.parse(JSON.stringify(unit.tacticalKnowledge)),
    runtime: {`);

console.log('tactical awareness integrations applied');
