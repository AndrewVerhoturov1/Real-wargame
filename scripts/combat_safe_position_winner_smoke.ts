import assert from 'node:assert/strict';
import { evaluateCoverBetween } from '../src/core/cover/CoverEvaluation';
import { recordCombatThreatEvidence, type CombatThreatEvidence } from '../src/core/combat/CombatThreatEvidence';
import {
  buildSoldierAwarenessReport,
  type SoldierAwarenessCell,
  type SoldierAwarenessReport,
  type SoldierSafePosition,
} from '../src/core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import { advanceVisualContact, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyOpenFieldThreatChangesWinner();
verifyWallWinnerUsesThreatProtectedSide();
verifyThreatDirectionFlipsProtectedSide();
verifyVisualThreatIsMorePreciseThanUnknownFireSector();
verifyPreferenceDecaysWithoutHiddenPositionLeak();

console.log('Combat safe-position winner smoke passed: 5 deterministic winner, wall-side, precision, decay and hidden-position checks.');

function verifyOpenFieldThreatChangesWinner(): void {
  const state = makeOpenState();
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const baseline = buildSoldierAwarenessReport(state, blue);
  const baselineWinner = winner(baseline, 'open-field baseline');

  assert.ok(
    distanceCells(baselineWinner.position, blue.position) < 0.01,
    `without threats the nearest current cell must win (winner=${formatPosition(baselineWinner.position)}, unit=${formatPosition(blue.position)})`,
  );

  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const threatened = buildSoldierAwarenessReport(state, blue);
  const threatenedWinner = winner(threatened, 'open-field visual threat');

  assert.notDeepEqual(
    threatenedWinner.position,
    baselineWinner.position,
    `a confirmed subjective threat must change the safe-position winner (baseline=${formatPosition(baselineWinner.position)}, threatened=${formatPosition(threatenedWinner.position)})`,
  );
  assert.ok(
    Math.abs(threatenedWinner.score - baselineWinner.score) >= 2,
    `the winner score must materially change after contact (baseline=${baselineWinner.score}, threatened=${threatenedWinner.score})`,
  );
  assert.ok(
    threatenedWinner.danger < threatened.currentPosition.danger,
    `the new winner must be safer than the original position (winner danger=${threatenedWinner.danger}, current danger=${threatened.currentPosition.danger})`,
  );
}

function verifyWallWinnerUsesThreatProtectedSide(): void {
  const state = makeWallState('east');
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  const baseline = buildSoldierAwarenessReport(state, blue);
  const baselineWinner = winner(baseline, 'east-threat wall baseline');
  assert.ok(
    baselineWinner.position.x > WALL_CENTER_X,
    `before a threat, distance should prefer the near/east face of the wall (winner=${formatPosition(baselineWinner.position)})`,
  );

  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const report = buildSoldierAwarenessReport(state, blue);
  const protectedWinner = winner(report, 'east-threat wall contact');
  const exposedPosition = { x: WALL_CENTER_X + 1, y: WALL_TEST_Y };
  const exposedCell = cellAt(report, exposedPosition);
  const protectedCell = cellAt(report, protectedWinner.position);
  const directionalCover = evaluateCoverBetween(
    state.map,
    subjectiveThreatPosition(blue, red.id),
    protectedWinner.position,
    blue.behaviorRuntime.posture,
  );

  assert.notDeepEqual(
    protectedWinner.position,
    baselineWinner.position,
    `the wall scenario must change winner from near/exposed to protected side (baseline=${formatPosition(baselineWinner.position)}, threatened=${formatPosition(protectedWinner.position)})`,
  );
  assert.ok(
    protectedWinner.position.x < WALL_CENTER_X,
    `an eastern threat must produce a winner west/behind the wall (winner x=${protectedWinner.position.x}, wall x=${WALL_CENTER_X})`,
  );
  assert.equal(directionalCover.blocksThreat, true, 'the winning position must geometrically place the wall between the subjective threat and the candidate');
  assert.ok(
    protectedCell.expectedProtectionAgainstThreat > exposedCell.expectedProtectionAgainstThreat + 40,
    `directed protection must distinguish the two wall faces (protected=${protectedCell.expectedProtectionAgainstThreat}, exposed=${exposedCell.expectedProtectionAgainstThreat})`,
  );
  assert.equal(
    protectedCell.protectedAgainstThreatId,
    `unit:${red.id}`,
    'directed cover diagnostics must name the concrete subjective threat that the wall protects against',
  );
  assert.ok(
    protectedCell.danger + 20 < exposedCell.danger,
    `the protected wall face must have materially lower danger (protected=${protectedCell.danger}, exposed=${exposedCell.danger})`,
  );
  assert.ok(
    protectedWinner.danger < report.currentPosition.danger,
    `the wall winner must be safer than the soldier starting on the threat side (winner=${protectedWinner.danger}, start=${report.currentPosition.danger})`,
  );
}

function verifyThreatDirectionFlipsProtectedSide(): void {
  const eastState = makeWallState('east');
  const eastBlue = unit(eastState, 'blue-1');
  const eastRed = unit(eastState, 'red-1');
  installVisualContact(eastBlue, eastRed, eastState.simulationTimeSeconds);
  syncSoldierThreatMemory(eastState, eastBlue, 0.1);
  const eastWinner = winner(buildSoldierAwarenessReport(eastState, eastBlue), 'east threat');

  const westState = makeWallState('west');
  const westBlue = unit(westState, 'blue-1');
  const westRed = unit(westState, 'red-1');
  installVisualContact(westBlue, westRed, westState.simulationTimeSeconds);
  syncSoldierThreatMemory(westState, westBlue, 0.1);
  const westReport = buildSoldierAwarenessReport(westState, westBlue);
  const westWinner = winner(westReport, 'west threat');
  const westWinnerCell = cellAt(westReport, westWinner.position);

  assert.ok(eastWinner.position.x < WALL_CENTER_X, `east threat must prefer west face, got ${formatPosition(eastWinner.position)}`);
  assert.ok(westWinner.position.x > WALL_CENTER_X, `west threat must prefer east face, got ${formatPosition(westWinner.position)}`);
  assert.equal(westWinnerCell.protectedAgainstThreatId, `unit:${westRed.id}`);
  assert.ok(
    evaluateCoverBetween(
      westState.map,
      subjectiveThreatPosition(westBlue, westRed.id),
      westWinner.position,
      westBlue.behaviorRuntime.posture,
    ).blocksThreat,
    'the flipped winner must also be geometrically protected from its own concrete threat direction',
  );
}

function verifyVisualThreatIsMorePreciseThanUnknownFireSector(): void {
  const exactState = makeOpenState();
  const exactBlue = unit(exactState, 'blue-1');
  const exactRed = unit(exactState, 'red-1');
  const exactBaseline = buildSoldierAwarenessReport(exactState, exactBlue);
  installVisualContact(exactBlue, exactRed, exactState.simulationTimeSeconds);
  syncSoldierThreatMemory(exactState, exactBlue, 0.1);
  const exactReport = buildSoldierAwarenessReport(exactState, exactBlue);
  const exactThreat = threat(exactBlue, `unit:${exactRed.id}`);

  const unknownState = makeOpenState();
  const unknownBlue = unit(unknownState, 'blue-1');
  const unknownRed = unit(unknownState, 'red-1');
  const unknownBaseline = buildSoldierAwarenessReport(unknownState, unknownBlue);
  recordCombatThreatEvidence(unknownBlue, broadUnknownFireEvidence(unknownState, unknownRed.position));
  syncSoldierThreatMemory(unknownState, unknownBlue, 0.1);
  const unknownReport = buildSoldierAwarenessReport(unknownState, unknownBlue);
  const unknownThreat = unknownBlue.tacticalKnowledge.threats.find((item) => item.id.startsWith('unknown-fire:'));
  assert.ok(unknownThreat, 'unknown incoming fire must create an approximate subjective threat');

  const exactAffected = countMateriallyAffectedCells(exactBaseline, exactReport);
  const unknownAffected = countMateriallyAffectedCells(unknownBaseline, unknownReport);

  assert.ok(
    exactThreat.arcDegrees + 40 < unknownThreat.arcDegrees,
    `visual contact must retain a narrower directional arc (visual=${exactThreat.arcDegrees}, unknown=${unknownThreat.arcDegrees})`,
  );
  assert.ok(
    exactThreat.uncertaintyCells < unknownThreat.uncertaintyCells,
    `visual contact must retain lower source uncertainty (visual=${exactThreat.uncertaintyCells}, unknown=${unknownThreat.uncertaintyCells})`,
  );
  assert.ok(
    exactAffected < unknownAffected,
    `the exact contact must produce a narrower safe-position preference footprint (visual affected=${exactAffected}, unknown affected=${unknownAffected})`,
  );
  assert.ok(
    dangerFootprint(exactReport) < dangerFootprint(unknownReport),
    `the visual danger sector must cover fewer cells than broad unknown fire (visual=${dangerFootprint(exactReport)}, unknown=${dangerFootprint(unknownReport)})`,
  );
}

function verifyPreferenceDecaysWithoutHiddenPositionLeak(): void {
  const state = makeWallState('east');
  const blue = unit(state, 'blue-1');
  const red = unit(state, 'red-1');
  installVisualContact(blue, red, state.simulationTimeSeconds);
  syncSoldierThreatMemory(state, blue, 0.1);
  const hotReport = buildSoldierAwarenessReport(state, blue);
  const remembered = subjectiveThreatPosition(blue, red.id);
  const hotGap = wallDangerGap(hotReport);
  const diagnosticsBeforeRepeat = getDirectionalTacticalFieldDiagnostics(state.map);
  const repeatedReport = buildSoldierAwarenessReport(state, blue);
  const diagnosticsAfterRepeat = getDirectionalTacticalFieldDiagnostics(state.map);

  assert.equal(repeatedReport.cacheKey, hotReport.cacheKey);
  assert.equal(
    diagnosticsAfterRepeat.fullMapScanCount,
    diagnosticsBeforeRepeat.fullMapScanCount,
    'unchanged subjective knowledge must reuse the heavy directional awareness field instead of scanning the map again',
  );

  blue.perceptionKnowledge.contacts.splice(0, blue.perceptionKnowledge.contacts.length);
  red.position = { x: 2.5, y: 2.5 };
  state.simulationTimeSeconds += 0.1;
  syncSoldierThreatMemory(state, blue, 0.1);
  const hiddenThreat = threat(blue, `unit:${red.id}`);
  assert.deepEqual(
    { x: hiddenThreat.x, y: hiddenThreat.y },
    remembered,
    'losing contact must preserve only the observer last-known threat position',
  );
  assert.notDeepEqual(
    { x: hiddenThreat.x, y: hiddenThreat.y },
    red.position,
    'hidden objective movement must not enter UnitTacticalKnowledge',
  );
  const hiddenReport = buildSoldierAwarenessReport(state, blue);
  assert.ok(
    winner(hiddenReport, 'hidden movement').position.x < WALL_CENTER_X,
    'hidden objective movement to the opposite side must not flip a preference based on remembered eastern threat data',
  );

  state.simulationTimeSeconds += 40;
  syncSoldierThreatMemory(state, blue, 40);
  const fadedOnce = buildSoldierAwarenessReport(state, blue);
  const fadedOnceGap = wallDangerGap(fadedOnce);

  state.simulationTimeSeconds += 40;
  syncSoldierThreatMemory(state, blue, 40);
  const fadedTwice = buildSoldierAwarenessReport(state, blue);
  const fadedTwiceGap = wallDangerGap(fadedTwice);

  assert.ok(
    hotGap > fadedOnceGap && fadedOnceGap > fadedTwiceGap,
    `the old wall-side preference must weaken deterministically as subjective confidence decays (hot=${hotGap}, first=${fadedOnceGap}, second=${fadedTwiceGap})`,
  );

  state.simulationTimeSeconds += 200;
  syncSoldierThreatMemory(state, blue, 200);
  const expired = buildSoldierAwarenessReport(state, blue);
  assert.equal(blue.tacticalKnowledge.threats.some((item) => item.id === `unit:${red.id}`), false);
  assert.equal(wallDangerGap(expired), 0, 'after subjective threat removal the old directional danger preference must disappear');
}

const WALL_CENTER_X = 12.5;
const WALL_TEST_Y = 6.5;

function makeOpenState(): SimulationState {
  const state = createInitialState({
    width: 30,
    height: 21,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'blue-1', label: 'Blue', labelRu: 'Синий', type: 'infantry_squad', side: 'blue', x: 10, y: 10, facingDegrees: 0, viewRangeCells: 30 },
    { id: 'red-1', label: 'Red', labelRu: 'Красный', type: 'infantry_squad', side: 'red', x: 22, y: 10, facingDegrees: 180, viewRangeCells: 30 },
  ]);
  unit(state, 'blue-1').position = { x: 10.5, y: 10.5 };
  unit(state, 'red-1').position = { x: 22.5, y: 10.5 };
  return state;
}

function makeWallState(threatSide: 'east' | 'west'): SimulationState {
  const objects = Array.from({ length: 7 }, (_, index) => ({
    id: `winner-wall-${index}`,
    kind: 'structure' as const,
    x: 12,
    y: 3 + index,
    widthCells: 1,
    heightCells: 1,
    rotationRadians: 0,
    losHeightMeters: 2.5,
    coverProtection: 92,
    coverReliability: 96,
    concealment: 10,
    labels: { en: 'Wall', ru: 'Стена' },
  }));
  const state = createInitialState({
    width: 26,
    height: 14,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects,
  }, [
    { id: 'blue-1', label: 'Blue', labelRu: 'Синий', type: 'infantry_squad', side: 'blue', x: threatSide === 'east' ? 15 : 9, y: 6, facingDegrees: threatSide === 'east' ? 0 : 180, viewRangeCells: 30 },
    { id: 'red-1', label: 'Red', labelRu: 'Красный', type: 'infantry_squad', side: 'red', x: threatSide === 'east' ? 22 : 2, y: 6, facingDegrees: threatSide === 'east' ? 180 : 0, viewRangeCells: 30 },
  ]);
  unit(state, 'blue-1').position = { x: threatSide === 'east' ? 15.5 : 9.5, y: WALL_TEST_Y };
  unit(state, 'red-1').position = { x: threatSide === 'east' ? 22.5 : 2.5, y: WALL_TEST_Y };
  return state;
}

function broadUnknownFireEvidence(state: SimulationState, estimatedSourcePosition: { x: number; y: number }): CombatThreatEvidence {
  return {
    id: 'broad-unknown-sector',
    kind: 'near_miss',
    sourceUnitId: null,
    estimatedSourcePosition: { ...estimatedSourcePosition },
    directionDegrees: 180,
    confidence: 58,
    uncertaintyCells: 8,
    strength: 68,
    suppression: 28,
    stressPerSecond: 4,
    rangeCells: 70,
    arcDegrees: 150,
    createdSeconds: state.simulationTimeSeconds,
    lastUpdatedSeconds: state.simulationTimeSeconds,
    evidenceCount: 1,
  };
}

function installVisualContact(observer: UnitModel, target: UnitModel, nowSeconds: number): void {
  const id = `perception:unit:${target.id}`;
  const previous = observer.perceptionKnowledge.contacts.find((item) => item.id === id) ?? null;
  const contact = advanceVisualContact(previous, {
    id,
    stimulusId: `unit:${target.id}`,
    sourceUnitId: target.id,
    labelRu: target.labels.ru,
    position: { ...target.position },
    evidencePerSecond: 180,
    deltaSeconds: 1,
    nowSeconds,
    source: 'visual',
  });
  upsertPerceptionContact(observer.perceptionKnowledge, contact);
}

function subjectiveThreatPosition(observer: UnitModel, sourceUnitId: string): { x: number; y: number } {
  const memory = threat(observer, `unit:${sourceUnitId}`);
  return { x: memory.x, y: memory.y };
}

function threat(observer: UnitModel, id: string): UnitModel['tacticalKnowledge']['threats'][number] {
  const found = observer.tacticalKnowledge.threats.find((item) => item.id === id);
  assert.ok(found, `subjective threat ${id} must exist`);
  return found;
}

function winner(report: SoldierAwarenessReport, label: string): SoldierSafePosition {
  const found = report.bestSafePositions[0];
  assert.ok(found, `${label} must produce at least one ranked safe-position candidate`);
  return found;
}

function cellAt(report: SoldierAwarenessReport, position: { x: number; y: number }): SoldierAwarenessCell {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  const width = Math.max(...report.cells.map((cell) => cell.x)) + 1;
  const found = report.cells[y * width + x];
  assert.ok(found, `awareness cell ${x}:${y} must exist`);
  return found;
}

function countMateriallyAffectedCells(baseline: SoldierAwarenessReport, threatened: SoldierAwarenessReport): number {
  assert.equal(baseline.cells.length, threatened.cells.length);
  return threatened.cells.reduce((count, cell, index) => (
    cell.safety <= baseline.cells[index].safety - 2 ? count + 1 : count
  ), 0);
}

function dangerFootprint(report: SoldierAwarenessReport): number {
  return report.cells.filter((cell) => cell.danger > 0).length;
}

function wallDangerGap(report: SoldierAwarenessReport): number {
  const protectedCell = cellAt(report, { x: WALL_CENTER_X - 1, y: WALL_TEST_Y });
  const exposedCell = cellAt(report, { x: WALL_CENTER_X + 1, y: WALL_TEST_Y });
  return exposedCell.danger - protectedCell.danger;
}

function distanceCells(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function formatPosition(position: { x: number; y: number }): string {
  return `${position.x.toFixed(1)}:${position.y.toFixed(1)}`;
}

function unit(state: SimulationState, id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}
