import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
const start = source.indexOf('function renderDanger(');
const end = source.indexOf('\nfunction ', start + 1);
assert.ok(start >= 0 && end > start, 'renderDanger source must be discoverable');
const renderDangerSource = source.slice(start, end);

assert.equal(
  renderDangerSource.includes('evaluateThreatsAtPosition('),
  false,
  'the danger panel must not use a second synchronous danger algorithm',
);
assert.equal(
  renderDangerSource.includes('readReadyWorldField('),
  true,
  'the danger panel must read the same published awareness field as the map and Ctrl inspector',
);

console.log('danger UI source parity smoke: ok');
