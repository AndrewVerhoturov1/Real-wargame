import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hosts, tabs, extension] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
]);

assert.match(tabs, /private readonly listeners/);
assert.match(tabs, /removeEventListener/);
assert.match(tabs, /if \(this\.destroyed\) return/);
assert.match(tabs, /sessionStorage/);
assert.match(tabs, /normalizeCombatLabWorkspaceTab/);
assert.match(hosts, /return isCombatLabWorkspaceTab\(value\) \? value : 'scene'/, 'Unknown persisted tabs must fall back to Scene.');
assert.match(extension, /this\.workspace\.destroy\(\)/);
assert.match(extension, /this\.legacyRoot\.replaceChildren\(\)/);
assert.match(extension, /isActive\('metrics'\)/);
assert.match(extension, /isActive\('journal'\)/);
assert.equal((extension.match(/new CombatLabExperimentDraft/g) ?? []).length, 1);
assert.equal((extension.match(/CombatLabExperimentVisualController\.create/g) ?? []).length, 1);
assert.equal((extension.match(/new CombatLabBatchClient/g) ?? []).length, 1);
assert.equal((extension.match(/new MutationObserver/g) ?? []).length, 1,
  'Only the focused legacy-metrics observer may remain in the extension.');
assert.match(extension, /observer\.observe\(diagnostics,/,
  'The remaining observer must watch only the diagnostics node.');
assert.doesNotMatch(extension, /installWorkspaceLabelLocalizer|observer\.observe\(host,|createTreeWalker|NodeFilter\.SHOW_TEXT|replaceAll\(/);
assert.doesNotMatch(extension, /new CombatLabScenarioExecutor/);
assert.doesNotMatch(extension, /tickSimulation\(/);
assert.doesNotMatch(extension, /new (?:PIXI\.)?Application\s*\(/);
console.log('Combat Lab workspace lifecycle smoke passed.');