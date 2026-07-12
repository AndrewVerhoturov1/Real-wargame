import assert from 'node:assert/strict';
import { resolveMapGridLod } from '../src/rendering/MapGridLod';

const hiddenFineAtOverview = resolveMapGridLod({
  showGrid: true,
  metersPerCell: 2,
  cellSize: 4.8,
  zoom: 1,
  editorEnabled: false,
});
assert.equal(hiddenFineAtOverview.majorVisible, true);
assert.equal(hiddenFineAtOverview.minorVisible, false);
assert.equal(hiddenFineAtOverview.majorSpacingCells, 5);

const visibleFineWhenZoomed = resolveMapGridLod({
  showGrid: true,
  metersPerCell: 2,
  cellSize: 4.8,
  zoom: 3,
  editorEnabled: false,
});
assert.equal(visibleFineWhenZoomed.majorVisible, true);
assert.equal(visibleFineWhenZoomed.minorVisible, true);
assert.ok(visibleFineWhenZoomed.minorAlpha > 0.5);

const editorShowsFineEarlier = resolveMapGridLod({
  showGrid: true,
  metersPerCell: 2,
  cellSize: 4.8,
  zoom: 2,
  editorEnabled: true,
});
assert.equal(editorShowsFineEarlier.minorVisible, true);

const legacyGridUsesTenMetreLines = resolveMapGridLod({
  showGrid: true,
  metersPerCell: 10,
  cellSize: 24,
  zoom: 1,
  editorEnabled: false,
});
assert.equal(legacyGridUsesTenMetreLines.majorVisible, true);
assert.equal(legacyGridUsesTenMetreLines.majorSpacingCells, 1);
assert.equal(legacyGridUsesTenMetreLines.minorVisible, false);

const disabled = resolveMapGridLod({
  showGrid: false,
  metersPerCell: 2,
  cellSize: 4.8,
  zoom: 4,
  editorEnabled: true,
});
assert.equal(disabled.majorVisible, false);
assert.equal(disabled.minorVisible, false);

console.log('Map grid LOD smoke passed: 10m lines remain at overview and 2m lines appear only when useful.');
