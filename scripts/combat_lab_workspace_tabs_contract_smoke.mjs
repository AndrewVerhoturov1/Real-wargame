import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, extension] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
]);

const primary = [
  ['scene', 'Карта', 'Карта эксперимента'],
  ['program', 'Программа', 'Программа эксперимента'],
  ['laboratory', 'Лаборатория', 'Лаборатория'],
  ['metrics', 'Метрики', 'Метрики текущего прогона'],
  ['journal', 'Журнал', 'Журнал'],
  ['batch', 'Серия', 'Серия прогонов'],
];
for (const [id, label, title] of primary) {
  assert.match(hosts, new RegExp(`'${id}'`));
  assert.match(hosts, new RegExp(`'${label}'`));
  assert.match(hosts, new RegExp(`'${title}'`));
}
assert.equal((hosts.match(/tabId:/g) ?? []).length, 8, 'Polygon shell requires six primary tabs and two preserved product utility tabs.');
assert.match(hosts, /tabId:\s*'parameters'[^\n]*labelRu:\s*'Параметры'/);
assert.match(hosts, /tabId:\s*'settings'[^\n]*labelRu:\s*'Общие редакторы'/);
assert.match(tabs, /shell\.append\(header, primaryTabList, main, timeline\)/, 'Workspace must publish the full Polygon shell.');
assert.match(
  tabs,
  /for\s*\(const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s+of\s+this\.panels\)\s*\2\.hidden\s*=\s*\1\s*!==\s*normalized/,
  'Tab activation must keep only the normalized workspace panel visible regardless of local variable names.',
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
