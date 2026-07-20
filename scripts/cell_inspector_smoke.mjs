import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync(new URL('../src/ui/CellInspector.ts', import.meta.url), 'utf8');
const content = readFileSync(new URL('../src/ui/CellInspectorContent.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/TacticalWorkspace.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/cell-inspector.css', import.meta.url), 'utf8');

assert.match(controller, /event\.key !== 'Control'/, 'cell inspector must react specifically to the Control key');
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
assert.match(content, /readReadyWorldField/, 'danger and stealth must consume a prepared awareness snapshot');
assert.match(content, /__realWargameRouteCostDebug/, 'route cost must check that the worker result is already ready');
assert.match(content, /fieldRevision/, 'memory view must check for an already prepared visibility field');
assert.doesNotMatch(content, /GridPathfinder|findPath|searchTacticalPositions\(/, 'hover inspection must not run pathfinding or tactical searches');
assert.doesNotMatch(content, /for\s*\(let\s+y\s*=\s*0;\s*y\s*<\s*state\.map\.height/, 'hover inspection must not scan the full map');
assert.doesNotMatch(controller, /requestAnimationFrame\([^)]*refresh/, 'hover inspection must not poll every animation frame');

assert.match(workspace, /installCellInspector\(state\)/, 'workspace must install the cell inspector');
assert.match(workspace, /teardownCellInspector\(\)/, 'workspace teardown must destroy the cell inspector');
assert.match(css, /position:\s*fixed/, 'popover must remain screen-space DOM');
assert.match(css, /pointer-events:\s*none/, 'popover must not intercept map input');
assert.match(css, /font-family:\s*Arial/, 'popover must use a normal readable browser font');

console.log('cell inspector smoke passed');
