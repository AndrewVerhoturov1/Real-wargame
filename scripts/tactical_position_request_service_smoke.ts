import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

verifyRendererDoesNotOwnTacticalSearch();

console.log('Tactical position request service smoke passed: renderer is a pure snapshot consumer.');

function verifyRendererDoesNotOwnTacticalSearch(): void {
  const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  const legacyRenderer = readFileSync('src/rendering/PixiAwarenessHeatmapRendererLegacy.ts', 'utf8');
  const combined = `${renderer}\n${legacyRenderer}`;

  for (const forbidden of [
    'getTacticalPositionProvider',
    'provider?.generate',
    'provider.generate',
    'requestTacticalPositions(',
    'requestWorldField(',
    'ensureAwarenessTacticalPositionProvider',
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `renderer source must not own tactical calculation: found ${forbidden}`,
    );
  }
}
