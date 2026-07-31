import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, extension] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
]);

const expected = [
  ['scene', 'Сцена', 'Начальная сцена'],
  ['program', 'Программа', 'Программа эксперимента'],
  ['batch', 'Серия', 'Серия прогонов'],
  ['parameters', 'Параметры', 'Параметры бойцов'],
  ['metrics', 'Метрики', 'Метрики текущего прогона'],
  ['journal', 'Журнал', 'Журнал'],
];
for (const [id, label, title] of expected) {
  assert.match(hosts, new RegExp(`'${id}'`));
  assert.match(hosts, new RegExp(`'${label}'`));
  assert.match(hosts, new RegExp(`'${title}'`));
}
assert.equal((hosts.match(/tabId:/g) ?? []).length, 6, 'Exactly six workspace tab definitions are required.');
assert.doesNotMatch(hosts, /tabId:\s*'stand'|labelRu:\s*'Стенд'/);
assert.match(tabs, /dock\.append\(header, toolbarHost, tabList, panelHost\)/, 'Run toolbar must sit outside switchable panels.');
assert.match(
  tabs,
  /for\s*\(const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s+of\s+this\.panels\)\s*\2\.hidden\s*=\s*\1\s*!==\s*normalized/,
  'Tab activation must keep only the normalized panel visible regardless of local variable names.',
);
const activateBody = tabs.match(/activate\(tabId:[\s\S]*?\n  getActiveTab\(\)/)?.[0] ?? '';
assert.doesNotMatch(activateBody, /replaceChildren\(/, 'Tab switching must not recreate workspace hosts.');
assert.match(extension, /CombatLabWorkspaceTabs\.create/);
assert.match(extension, /hosts\.scene/);
assert.match(extension, /hosts\.program/);
assert.match(extension, /hosts\.batch/);
assert.match(extension, /hosts\.parameters/);
assert.match(extension, /hosts\.metrics/);
assert.match(extension, /hosts\.journal/);
assert.doesNotMatch(extension, /activateTab\('stand'\)|activateMetricsView\('batch'\)|LegacyStage10HostContract/);
console.log('Combat Lab workspace tabs contract smoke passed.');
