import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const staticRenderer = readFileSync('src/rendering/PixiStaticTacticalPositionRenderer.ts', 'utf8');
const candidateRenderer = readFileSync('src/rendering/PixiTacticalPositionCandidateRenderer.ts', 'utf8');

assert.ok(staticRenderer.includes('const basis = service.readAnyReady()'));
assert.ok(!staticRenderer.includes('service.request()'), 'opening or rendering a static layer must not start the heavy calculation');
assert.ok(staticRenderer.includes('if (rasterKey !== this.lastRasterKey)'));
assert.ok(staticRenderer.includes('this.texture?.destroy(true)'));

assert.ok(candidateRenderer.includes('private readonly labelPool: Text[] = []'));
assert.ok(candidateRenderer.includes('this.ensureLabel(this.markerCount)'));
assert.ok(candidateRenderer.includes('label.visible = false'));
assert.ok(!candidateRenderer.includes("this.labels.removeChildren().forEach((child) => child.destroy())"), 'candidate labels must not be recreated every frame');

console.log('tactical position renderer allocation smoke: ok');
