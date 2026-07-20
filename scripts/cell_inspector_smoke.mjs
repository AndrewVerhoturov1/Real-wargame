import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync(new URL('../src/ui/CellInspector.ts', import.meta.url), 'utf8');
const content = readFileSync(new URL('../src/ui/CellInspectorContent.ts', import.meta.url), 'utf8');
const dangerContent = readFileSync(new URL('../src/ui/CellInspectorDangerContent.ts', import.meta.url), 'utf8');
const memoryContent = readFileSync(new URL('../src/ui/CellInspectorMemoryContent.ts', import.meta.url), 'utf8');
const targetResolver = readFileSync(new URL('../src/ui/CellInspectorTarget.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/TacticalWorkspace.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/cell-inspector.css', import.meta.url), 'utf8');

assert.match(controller, /event\.key !== 'Control'/, 'cell inspector must react specifically to the Control key');
assert.match(controller, /event\.repeat\s*\|\|\s*controlHeld|controlHeld\s*\|\|\s*event\.repeat/, 'repeated Control keydown must not refresh the inspector');
assert.match(controller, /buildCachedMemoryCellInspectorContent/, 'memory hover must use the revision-cached visibility snapshot');
assert.match(controller, /buildDetailedDangerCellInspectorContent/, 'danger hover must use the detailed prepared-field explanation');
assert.match(controller, /resolveCellInspectorTarget/, 'controller must resolve the effective hover target before reading layer content');
assert.match(controller, /snappedUnitId/, 'controller must retain magnetic hover state between refreshes');
assert.match(controller, /dataset\.snappedUnitId/, 'popover must expose whether inspection is snapped to a soldier');
assert.match(controller, /addEventListener\('keydown'/, 'cell inspector must install keydown handling');
assert.match(controller, /addEventListener\('keyup'/, 'cell inspector must install keyup handling');
assert.match(controller, /addEventListener\('blur'/, 'cell inspector must hide when the window loses focus');
assert.match(controller, /addEventListener\('pointerleave'/, 'cell inspector must hide when the pointer leaves the map');
assert.match(controller, /removeEventListener\('keydown'/, 'cell inspector teardown must remove keydown handling');
assert.match(controller, /removeEventListener\('keyup'/, 'cell inspector teardown must remove keyup handling');
assert.match(controller, /removeEventListener\('blur'/, 'cell inspector teardown must remove blur handling');
assert.match(controller, /window\.clearInterval/, 'cell inspector teardown must stop its bounded refresh timer');
assert.match(controller, /popover\.remove\(\)/, 'cell inspector teardown must remove its DOM node');
assert.match(controller, /renderKey !== lastRenderKey/, 'unchanged content must not rebuild the popover DOM');

for (const layer of ['info', 'danger', 'positions', 'stealth', 'memory', 'routeCost']) {
  assert.match(content, new RegExp(`'${layer}'`), `cell inspector content must support ${layer}`);
}
assert.match(content, /readReadyWorldField/, 'danger and stealth compatibility content must consume a prepared awareness snapshot');
assert.match(dangerContent, /readReadyWorldField/, 'detailed danger hover must consume a prepared awareness snapshot');
assert.match(dangerContent, /protectedThreatIndex/, 'danger explanation must resolve the threat against which the cell has protection');
assert.match(dangerContent, /Основная причина/, 'danger content must state the dominant reason in plain language');
assert.match(dangerContent, /Известных угроз/, 'danger content must show how many known threats are considered');
assert.match(dangerContent, /Открытость склона/, 'danger content must expose slope-driven exposure');
assert.match(dangerContent, /Надёжность оценки/, 'danger content must expose estimate reliability');
assert.doesNotMatch(dangerContent, /getOrRequest|buildSoldierAwarenessReport|GridPathfinder|findPath/, 'danger hover must not trigger field construction or pathfinding');
assert.doesNotMatch(dangerContent, /for\s*\(let\s+y\s*=\s*0;\s*y\s*<\s*state\.map\.height/, 'danger hover must not scan the full map');
assert.match(content, /__realWargameRouteCostDebug/, 'route cost must check that the worker result is already ready');
assert.match(content, /fieldRevision/, 'memory view must check for an already prepared visibility field');
assert.doesNotMatch(content, /GridPathfinder|findPath|searchTacticalPositions\(/, 'hover inspection must not run pathfinding or tactical searches');
assert.doesNotMatch(content, /for\s*\(let\s+y\s*=\s*0;\s*y\s*<\s*state\.map\.height/, 'hover inspection must not scan the full map');
assert.doesNotMatch(controller, /requestAnimationFrame\([^)]*refresh/, 'hover inspection must not poll every animation frame');

assert.match(targetResolver, /ACQUIRE_RADIUS_CELLS\s*=\s*2\.5/, 'soldier magnet must have a short 2.5-cell acquisition radius');
assert.match(targetResolver, /RELEASE_RADIUS_CELLS\s*=\s*3\.25/, 'soldier magnet must use a slightly wider release radius to avoid jitter');
assert.match(targetResolver, /previousSnappedUnitId/, 'soldier magnet must preserve the current target inside the release radius');
assert.match(targetResolver, /unit\.id === state\.selectedUnitId/, 'selected soldier must be excluded from magnetic targeting');
assert.match(targetResolver, /contact\.sourceUnitId === unit\.id/, 'enemy snap eligibility must require an exact contact-to-unit match');
assert.match(targetResolver, /contact\.source === 'visual'/, 'enemy snap eligibility must require a visual contact');
assert.match(targetResolver, /contact\.visibleNow/, 'enemy snap eligibility must require the enemy to be currently visible');
assert.match(targetResolver, /candidateDistanceSquared < bestDistanceSquared/, 'nearest eligible soldier must win magnetic targeting');
assert.doesNotMatch(targetResolver, /\.filter\(|\.sort\(|\.map\(/, 'magnetic hover hot path must avoid per-refresh array allocations');

assert.match(memoryContent, /WeakMap<SimulationState, MemoryFieldCacheEntry>/, 'memory inspector must cache prepared fields per simulation state');
assert.match(memoryContent, /cached\.fieldRevision === fieldRevision/, 'memory inspector must reuse one field for the same revision');
assert.match(memoryContent, /sampleSelectedUnitVisibilityField/, 'memory inspector must perform direct cell sampling');
assert.doesNotMatch(memoryContent, /\.filter\(|\.sort\(/, 'memory contact lookup must avoid per-hover array allocations');

assert.match(workspace, /installCellInspector\(state\)/, 'workspace must install the cell inspector');
assert.match(workspace, /teardownCellInspector\(\)/, 'workspace teardown must destroy the cell inspector');
assert.match(css, /position:\s*fixed/, 'popover must remain screen-space DOM');
assert.match(css, /pointer-events:\s*none/, 'popover must not intercept map input');
assert.match(css, /font-family:\s*Arial/, 'popover must use a normal readable browser font');

console.log('cell inspector smoke passed');
