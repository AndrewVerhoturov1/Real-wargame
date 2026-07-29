import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [results, distribution] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabBatchResultsView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabMetricDistributionView.ts', 'utf8'),
]);
for (const text of ['Результаты серии', 'Успех', 'Неудачи', 'Причины неудач', 'Характерные прогоны', 'Повторить визуально']) assert.match(results, new RegExp(text));
assert.match(results, /onReplayRepresentative\(representative\)/);
assert.match(results, /combatLabMetricLabelRu/);
assert.doesNotMatch(results, /CombatLabExperimentVisualController|CombatLabRepresentativeRunReplay/);
assert.match(distribution, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg', 'svg'\)/);
assert.match(distribution, /MAX_BUCKETS = 40/);
assert.match(distribution, /distribution\.histogram\.slice\(0, MAX_BUCKETS\)/);
assert.doesNotMatch(results + distribution, /chart\.js|d3|plotly|canvas/i);
console.log('Combat Lab batch result render contract smoke passed.');
