import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync('src/runtime/AwarenessLayerFieldController.ts', 'utf8');
const parity = readFileSync('src/ui/DangerPanelAwarenessParity.ts', 'utf8');

assert.equal(
  controller.includes('syncDangerPanelFromAwareness(this.state)'),
  true,
  'the live awareness controller must refresh the danger panel from the shared snapshot',
);
assert.equal(
  parity.includes('readReadyWorldField(unit.id)'),
  true,
  'the danger panel adapter must read the same published field as the map and Ctrl inspector',
);
assert.equal(
  parity.includes('evaluateThreatsAtPosition('),
  false,
  'the parity adapter must not introduce another synchronous danger calculation',
);
for (const label of ['Текущая опасность', 'Подавление', 'Защита позиции', 'Уверенность в угрозах']) {
  assert.equal(parity.includes(`'${label}'`), true, `the shared field must own the panel metric: ${label}`);
}

console.log('danger UI source parity smoke: ok');
