import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const mainSource = await readFile('src/main.ts', 'utf8');
const appSource = await readFile('src/rendering/PixiApp.ts', 'utf8');
const awarenessSource = await readFile('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
const routeSource = await readFile('src/rendering/PixiRouteCostOverlayRenderer.ts', 'utf8');
const visibilitySource = await readFile('src/rendering/PixiVisibilityHeatmapRenderer.ts', 'utf8');
const ownedSources = [mainSource, appSource, awarenessSource, routeSource, visibilitySource].join('\n');

assert.match(mainSource, /void bootstrap\(\)\.catch\(reportBootstrapFailure\)/, 'async bootstrap rejection must be visible and handled');
assert.match(mainSource, /debugPanel\.setAttribute\('role', 'alert'\)/, 'bootstrap failure must expose an accessible visible error');
assert.match(mainSource, /board\?\.destroy\(\)/, 'partially-created board must be torn down after bootstrap failure');

assert.match(appSource, /const app = new Application\(\);[\s\S]*await app\.init\(/, 'Application.init must be awaited after construction');
assert.match(appSource, /preference: 'webgl'/, 'production renderer preference must remain WebGL');
assert.match(appSource, /const canvas = this\.app\.canvas/, 'the v8 canvas property must be used');
assert.match(appSource, /this\.app\.ticker\.add\(this\.tick\)/);
assert.match(appSource, /this\.app\.ticker\.remove\(this\.tick\)/, 'ticker callback registration and removal must stay symmetric');
assert.match(appSource, /tick = \(ticker: Ticker\)/, 'ticker callback must use the v8 Ticker argument');
assert.match(appSource, /if \(this\.destroyed\) return;[\s\S]*this\.app\.stop\(\)/, 'application destruction must be guarded and stop rendering first');
assert.match(appSource, /this\.awarenessHeatmapRenderer\.destroy\(\)/, 'application teardown must terminate the owned awareness worker renderer');
assert.match(appSource, /releaseGlobalResources: true/, 'application teardown must release Pixi global resources');

const awarenessHiddenBranch = awarenessSource.match(/if \(state\.editor\.enabled \|\| mode === 'off' \|\| !unit\) \{[\s\S]*?return;\n    \}/)?.[0] ?? '';
assert.doesNotMatch(awarenessHiddenBranch, /ensureRaster|ensureWorkerConfigured|source\.update/, 'hidden awareness overlay must not allocate or upload');
assert.match(awarenessSource, /new BufferImageSource\(\{[\s\S]*resource: this\.rasterPixels,[\s\S]*width,[\s\S]*height,[\s\S]*format: 'rgba8unorm',[\s\S]*scaleMode: 'nearest'/, 'mutable RGBA byte raster must declare RGBA format and nearest sampling');
assert.match(awarenessSource, /this\.rasterTexture\.source\.update\(\)/, 'mutable awareness bytes must notify the v8 texture source');
assert.match(awarenessSource, /this\.worker\?\.terminate\(\)/);
assert.match(awarenessSource, /window\.clearTimeout\(this\.finalRefreshTimer\)/);
assert.match(awarenessSource, /delete \(window as AwarenessDebugWindow\)\.__realWargameAwarenessDebug/);
assert.match(awarenessSource, /this\.rasterTexture\?\.destroy\(true\)/, 'exclusive awareness texture source must be destroyed explicitly');

const routeHiddenBranch = routeSource.match(/if \(!overlay\.active \|\| state\.editor\.enabled \|\| !unit\) \{[\s\S]*?return;\n    \}/)?.[0] ?? '';
assert.doesNotMatch(routeHiddenBranch, /ensureRaster|drawRouteCostRaster|source\.update|createElement/, 'hidden route overlay must not rebuild or upload');
assert.match(routeSource, /Texture\.from\(\{ resource: this\.staticCanvas, scaleMode: 'nearest' \}\)/);
assert.match(routeSource, /Texture\.from\(\{ resource: this\.dynamicCanvas, scaleMode: 'nearest' \}\)/);
assert.match(routeSource, /this\.staticTexture\.source\.update\(\)/);
assert.match(routeSource, /this\.dynamicTexture\.source\.update\(\)/);
assert.match(routeSource, /this\.staticTexture\?\.destroy\(true\)/);
assert.match(routeSource, /delete \(window as RouteCostDebugWindow\)\.__realWargameRouteCostDebug/);

const fieldBranch = visibilitySource.match(/if \(field\) \{[\s\S]*?\n    \} else if \(this\.rasterSprite\)/)?.[0] ?? '';
assert.match(fieldBranch, /this\.ensureRaster\(state\.map\.width, state\.map\.height\);[\s\S]*field\.revision !== this\.lastFieldRevision/, 'visibility dimensions must be checked before revision reuse');
assert.match(visibilitySource, /Texture\.from\(\{ resource: this\.rasterCanvas, scaleMode: 'nearest' \}\)/);
assert.match(visibilitySource, /this\.rasterTexture\.source\.update\(\)/);
assert.match(visibilitySource, /this\.lastFieldRevision = -1;/, 'raster recreation must invalidate the upload key');
assert.match(visibilitySource, /delete \(window as ViewMemoryDebugWindow\)\.__realWargameViewMemoryDebug/);

assert.doesNotMatch(ownedSources, /\.view\b|beginFill\(|endFill\(|lineStyle\(|drawRect\(|cacheAsBitmap|SCALE_MODES\.|BaseTexture|@pixi\//, 'owned production files must not use active PixiJS v7 compatibility APIs');

for (const file of await listFiles('src/core')) {
  if (!file.endsWith('.ts')) continue;
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /from ['"]pixi\.js['"]|from ['"]@pixi\//, `${file} must remain free of Pixi imports`);
}

console.log('PixiJS 8 raster lifecycle contract smoke passed: async bootstrap, WebGL, ticker symmetry, owned teardown, mutable raster format/update, nearest sampling, hidden zero-work and core boundary.');

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}
