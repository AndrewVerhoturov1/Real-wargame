from pathlib import Path

path = Path('src/core/pathfinding/GridPathfinder.ts')
text = path.read_text(encoding='utf-8')

marker = "type SearchResult = SearchSuccess | SearchFailure;\n"
addition = """

interface AStarScratch {
  readonly gScore: Float64Array;
  readonly parent: Int32Array;
  readonly seenGeneration: Uint32Array;
  readonly closedGeneration: Uint32Array;
  readonly open: BinaryHeap;
  generation: number;
  inUse: boolean;
}

export interface GridPathfinderDiagnostics {
  readonly searches: number;
  readonly scratchAllocations: number;
  readonly scratchReuses: number;
}
"""
if addition.strip() not in text:
    if text.count(marker) != 1:
        raise SystemExit(f'GridPathfinder: SearchResult marker count={text.count(marker)}')
    text = text.replace(marker, marker + addition, 1)

old_cache = "const baselineCache = new WeakMap<TacticalMap, Map<string, SearchSuccess>>();\n"
new_cache = """const baselineCache = new WeakMap<TacticalMap, Map<string, SearchSuccess>>();
const aStarScratchPool = new Map<number, AStarScratch[]>();
const pathfinderDiagnostics = {
  searches: 0,
  scratchAllocations: 0,
  scratchReuses: 0,
};

export function getGridPathfinderDiagnostics(): GridPathfinderDiagnostics {
  return { ...pathfinderDiagnostics };
}

export function resetGridPathfinderDiagnostics(): void {
  pathfinderDiagnostics.searches = 0;
  pathfinderDiagnostics.scratchAllocations = 0;
  pathfinderDiagnostics.scratchReuses = 0;
}
"""
if new_cache not in text:
    if text.count(old_cache) != 1:
        raise SystemExit(f'GridPathfinder: baseline cache marker count={text.count(old_cache)}')
    text = text.replace(old_cache, new_cache, 1)

start = text.find('function runAStar(')
end = text.find('\nexport function evaluateGridPathCost(', start)
if start < 0 or end < 0:
    raise SystemExit('GridPathfinder: runAStar boundaries missing')
new_run = """function runAStar(
  fields: RouteCostFields,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  maxVisitedCells: number,
): SearchResult {
  const cellCount = fields.width * fields.height;
  const scratch = acquireAStarScratch(cellCount);
  const {
    gScore,
    parent,
    seenGeneration,
    closedGeneration,
    open,
    generation,
  } = scratch;
  pathfinderDiagnostics.searches += 1;

  try {
    const startIndex = indexOf(fields, start.x, start.y);
    const goalIndex = indexOf(fields, goal.x, goal.y);
    seenGeneration[startIndex] = generation;
    gScore[startIndex] = 0;
    parent[startIndex] = -1;

    const startH = heuristic(start.x, start.y, goal.x, goal.y);
    open.push({ index: startIndex, f: startH, h: startH });
    let visitedCells = 0;

    while (open.size > 0) {
      const current = open.pop();
      if (!current) break;
      if (closedGeneration[current.index] === generation) continue;
      closedGeneration[current.index] = generation;
      visitedCells += 1;

      if (visitedCells > maxVisitedCells) {
        return {
          ok: false,
          code: 'search_limit',
          visitedCells,
          reason: 'Path search exceeded its visited-cell limit.',
          reasonRu: 'Поиск пути превысил лимит проверенных клеток.',
        };
      }

      if (current.index === goalIndex) {
        return {
          ok: true,
          cells: reconstructPath(fields, parent, current.index),
          cost: gScore[current.index],
          visitedCells,
        };
      }

      const currentX = current.index % fields.width;
      const currentY = Math.floor(current.index / fields.width);

      for (const [dx, dy, stepLength] of DIRECTIONS) {
        const nextX = currentX + dx;
        const nextY = currentY + dy;
        if (!isFieldPassable(fields, nextX, nextY)) continue;
        if (
          dx !== 0
          && dy !== 0
          && (
            !isFieldPassable(fields, currentX + dx, currentY)
            || !isFieldPassable(fields, currentX, currentY + dy)
          )
        ) {
          continue;
        }

        const nextIndex = indexOf(fields, nextX, nextY);
        if (closedGeneration[nextIndex] === generation) continue;
        const stepCost = evaluateGridPathStepCost(fields, current.index, nextIndex, stepLength);
        if (!Number.isFinite(stepCost)) continue;
        const tentativeG = gScore[current.index] + stepCost;
        const previousG = seenGeneration[nextIndex] === generation
          ? gScore[nextIndex]
          : Number.POSITIVE_INFINITY;
        if (tentativeG + 1e-9 >= previousG) continue;

        seenGeneration[nextIndex] = generation;
        parent[nextIndex] = current.index;
        gScore[nextIndex] = tentativeG;
        const h = heuristic(nextX, nextY, goal.x, goal.y);
        open.push({ index: nextIndex, f: tentativeG + h, h });
      }
    }

    return {
      ok: false,
      code: 'no_route',
      visitedCells,
      reason: 'No passable route connects the start and goal.',
      reasonRu: 'Между стартом и целью нет проходимого маршрута.',
    };
  } finally {
    scratch.inUse = false;
  }
}

function acquireAStarScratch(cellCount: number): AStarScratch {
  let pool = aStarScratchPool.get(cellCount);
  if (!pool) {
    pool = [];
    aStarScratchPool.set(cellCount, pool);
  }
  let scratch = pool.find((candidate) => !candidate.inUse);
  if (!scratch) {
    scratch = {
      gScore: new Float64Array(cellCount),
      parent: new Int32Array(cellCount),
      seenGeneration: new Uint32Array(cellCount),
      closedGeneration: new Uint32Array(cellCount),
      open: new BinaryHeap(),
      generation: 0,
      inUse: false,
    };
    pool.push(scratch);
    pathfinderDiagnostics.scratchAllocations += 1;
  } else {
    pathfinderDiagnostics.scratchReuses += 1;
  }
  scratch.inUse = true;
  scratch.generation = (scratch.generation + 1) >>> 0;
  if (scratch.generation === 0) {
    scratch.seenGeneration.fill(0);
    scratch.closedGeneration.fill(0);
    scratch.generation = 1;
  }
  scratch.open.clear();
  return scratch;
}
"""
if 'function acquireAStarScratch' not in text:
    text = text[:start] + new_run + text[end:]

heap_marker = """  get size(): number {
    return this.values.length;
  }
"""
heap_addition = """

  clear(): void {
    this.values.length = 0;
  }
"""
if heap_addition.strip() not in text:
    if text.count(heap_marker) != 1:
        raise SystemExit(f'GridPathfinder: heap marker count={text.count(heap_marker)}')
    text = text.replace(heap_marker, heap_marker + heap_addition, 1)

for stale in (
    'const gScore = new Float64Array(cellCount);',
    'const parent = new Int32Array(cellCount);',
    'const closed = new Uint8Array(cellCount);',
    'gScore.fill(Number.POSITIVE_INFINITY);',
    'parent.fill(-1);',
):
    if stale in text:
        raise SystemExit(f'GridPathfinder: stale per-search allocation remains: {stale}')

path.write_text(text, encoding='utf-8')

smoke = Path('scripts/grid_pathfinding_smoke.ts')
smoke_text = smoke.read_text(encoding='utf-8')
old_import = "import { findGridPath } from '../src/core/pathfinding/GridPathfinder';"
new_import = """import {
  findGridPath,
  getGridPathfinderDiagnostics,
  resetGridPathfinderDiagnostics,
} from '../src/core/pathfinding/GridPathfinder';"""
if new_import not in smoke_text:
    if smoke_text.count(old_import) != 1:
        raise SystemExit('grid_pathfinding_smoke: import marker missing')
    smoke_text = smoke_text.replace(old_import, new_import, 1)
if 'verifyScratchReuse();' not in smoke_text:
    smoke_text = smoke_text.replace('verifyDeterminism();\n', 'verifyDeterminism();\nverifyScratchReuse();\n', 1)
function_marker = '\nfunction verifyPerformanceBound(): void {'
function_body = """

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
"""
if 'function verifyScratchReuse()' not in smoke_text:
    if smoke_text.count(function_marker) != 1:
        raise SystemExit('grid_pathfinding_smoke: performance function marker missing')
    smoke_text = smoke_text.replace(function_marker, function_body + function_marker, 1)
smoke.write_text(smoke_text, encoding='utf-8')
