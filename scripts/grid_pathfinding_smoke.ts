import assert from 'node:assert/strict';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import {
  buildNavigationGrid,
  isNavigationCellPassable,
} from '../src/core/pathfinding/GridNavigation';
import {
  findGridPath,
  getGridPathfinderDiagnostics,
  resetGridPathfinderDiagnostics,
} from '../src/core/pathfinding/GridPathfinder';

verifyRotatedObjectOccupancy();
verifyWaterAndBridge();
verifyWallGapRoute();
verifyNoCornerCutting();
verifyTerrainCosts();
verifyBlockedGoalAdjustment();
verifyExactBlockedGoalFailure();
verifyEnclosedGoalFailure();
verifyDeterminism();
verifyScratchReuse();
verifyPerformanceBound();

console.log('Grid pathfinding smoke passed: canonical object geometry, terrain, A*, exact goals, failure, determinism, performance.');

function verifyRotatedObjectOccupancy(): void {
  const map = normalizeMap(makeMap(9, 9, {
    objects: [{
      id: 'rotated_wall',
      kind: 'structure',
      x: 4,
      y: 4,
      widthCells: 4,
      heightCells: 0.6,
      rotationDegrees: 45,
    }],
  }));
  const grid = buildNavigationGrid(map);
  assert.equal(isNavigationCellPassable(grid, 4, 4), false, 'object center cell must block movement');
  assert.equal(isNavigationCellPassable(grid, 3, 3), false, 'rotated footprint must block its diagonal span');
  assert.equal(isNavigationCellPassable(grid, 2, 4), true, 'rotation must not block the whole axis-aligned bounding box');
}

function verifyWaterAndBridge(): void {
  const waterCells = [];
  for (let y = 1; y <= 5; y += 1) waterCells.push({ x: 3, y, terrain: 'water' as const });
  const map = normalizeMap(makeMap(7, 7, {
    cells: waterCells,
    objects: [{
      id: 'bridge',
      kind: 'bridge',
      x: 3,
      y: 3,
      widthCells: 1,
      heightCells: 1.2,
      rotationDegrees: 0,
    }],
  }));
  const grid = buildNavigationGrid(map);
  assert.equal(isNavigationCellPassable(grid, 3, 1), false, 'water outside a bridge must be blocked');
  assert.equal(isNavigationCellPassable(grid, 3, 3), true, 'bridge footprint must make water passable');
}

function verifyWallGapRoute(): void {
  const cells = [];
  for (let y = 0; y < 7; y += 1) {
    if (y !== 3) cells.push({ x: 4, y, terrain: 'water' as const });
  }
  const map = normalizeMap(makeMap(9, 7, { cells }));
  const result = findGridPath(map, { x: 1.5, y: 1.5 }, { x: 7.5, y: 1.5 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.cells.some((cell) => cell.x === 4 && cell.y === 3), 'route must use the only wall gap');
  assert.ok(result.waypoints.length >= 2);
  assert.deepEqual(result.waypoints.at(-1), result.resolvedGoal);
}

function verifyNoCornerCutting(): void {
  const map = normalizeMap(makeMap(3, 3, {
    cells: [
      { x: 1, y: 0, terrain: 'water' },
      { x: 0, y: 1, terrain: 'water' },
    ],
  }));
  const result = findGridPath(map, { x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 });
  assert.equal(result.ok, false, 'diagonal movement through two blocked cardinal neighbours must be forbidden');
  if (!result.ok) assert.equal(result.code, 'no_route');
}

function verifyTerrainCosts(): void {
  const cells = [];
  for (let x = 0; x < 7; x += 1) {
    cells.push({ x, y: 2, terrain: 'rough' as const });
    cells.push({ x, y: 1, terrain: 'road' as const });
  }
  const map = normalizeMap(makeMap(7, 5, { cells }));
  const result = findGridPath(map, { x: 0.5, y: 2.5 }, { x: 6.5, y: 2.5 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.cells.some((cell) => cell.y === 1), 'A* must prefer a slightly longer but cheaper road route');
}

function verifyBlockedGoalAdjustment(): void {
  const map = normalizeMap(makeMap(8, 8, {
    objects: [{
      id: 'goal_house',
      kind: 'structure',
      x: 6,
      y: 6,
      widthCells: 1,
      heightCells: 1,
    }],
  }));
  const requested = { x: 6.5, y: 6.5 };
  const result = findGridPath(map, { x: 1.5, y: 1.5 }, requested);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.goalAdjusted, true);
  assert.notDeepEqual(result.resolvedGoal, requested);
  assert.match(result.reasonRu, /ближай/i);
}

function verifyExactBlockedGoalFailure(): void {
  const map = normalizeMap(makeMap(8, 8, {
    objects: [{
      id: 'exact_goal_house',
      kind: 'structure',
      x: 6,
      y: 6,
      widthCells: 1,
      heightCells: 1,
    }],
  }));
  const result = findGridPath(
    map,
    { x: 1.5, y: 1.5 },
    { x: 6.5, y: 6.5 },
    { allowGoalAdjustment: false },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'goal_unreachable');
    assert.match(result.reasonRu, /точн/i);
  }
}

function verifyEnclosedGoalFailure(): void {
  const cells = [];
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      if (x === 1 || x === 5 || y === 1 || y === 5) cells.push({ x, y, terrain: 'water' as const });
    }
  }
  const map = normalizeMap(makeMap(7, 7, { cells }));
  const result = findGridPath(map, { x: 0.5, y: 0.5 }, { x: 3.5, y: 3.5 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'no_route');
}

function verifyDeterminism(): void {
  const cells = [];
  for (let y = 0; y < 12; y += 1) {
    if (y !== 6) cells.push({ x: 5, y, terrain: 'water' as const });
  }
  const map = normalizeMap(makeMap(12, 12, { cells }));
  const first = findGridPath(map, { x: 1.5, y: 2.5 }, { x: 10.5, y: 2.5 });
  const second = findGridPath(map, { x: 1.5, y: 2.5 }, { x: 10.5, y: 2.5 });
  assert.deepEqual(second, first, 'same map and endpoints must produce byte-stable route data');
}


function verifyScratchReuse(): void {
  resetGridPathfinderDiagnostics();
  const map = normalizeMap(makeMap(64, 64));
  const first = findGridPath(map, { x: 1.5, y: 1.5 }, { x: 62.5, y: 62.5 });
  const second = findGridPath(map, { x: 2.5, y: 2.5 }, { x: 62.5, y: 62.5 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const diagnostics = getGridPathfinderDiagnostics();
  assert.ok(diagnostics.searches >= 4, 'two planned routes must execute tactical and baseline searches');
  assert.equal(diagnostics.scratchAllocations, 1, 'same-size sequential A* searches must share one scratch set');
  assert.ok(diagnostics.scratchReuses >= 3, 'subsequent tactical/baseline searches must reuse scratch arrays');
}

function verifyPerformanceBound(): void {
  const cells = [];
  for (let x = 8; x < 120; x += 8) {
    const gapY = (x * 7) % 120 + 4;
    for (let y = 0; y < 128; y += 1) {
      if (Math.abs(y - gapY) > 1) cells.push({ x, y, terrain: 'water' as const });
    }
  }
  const map = normalizeMap(makeMap(128, 128, { cells }));
  const startedAt = Date.now();
  const result = findGridPath(map, { x: 1.5, y: 1.5 }, { x: 126.5, y: 126.5 }, { maxVisitedCells: 20000 });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.ok, true);
  assert.ok(elapsedMs < 1500, `128x128 pathfinding took ${elapsedMs} ms`);
  assert.ok(result.visitedCells <= 20000);
}

function makeMap(
  width: number,
  height: number,
  overrides: Pick<TacticalMapData, 'cells' | 'objects'> = {},
): TacticalMapData {
  return {
    width,
    height,
    cellSize: 24,
    metersPerCell: 10,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells: overrides.cells ?? [],
    objects: overrides.objects ?? [],
  };
}
