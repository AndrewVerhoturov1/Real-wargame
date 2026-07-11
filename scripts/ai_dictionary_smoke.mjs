import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const catalog = [read('src/core/ai/AiConceptCatalog.ts'), read('src/core/ai/AiConceptTypes.ts'), read('src/core/ai/AiConceptValues.ts'), read('src/core/ai/AiConceptOperations.ts')].join('\n');
const panel = read('src/ui/AiDictionaryPanel.ts');
const game = read('src/ui/AiDictionaryGameIntegration.ts');
const editor = read('src/ai-node-editor/AiDictionaryEditorIntegration.ts');
const workbench = read('src/ai-node-editor/AiDictionaryWorkbench.ts');
const gameEntry = read('src/main.ts');
const editorHtml = read('ai-node-editor.html');
const languageRules = read('docs/ai/DEVELOPMENT_LANGUAGE_RULES.md');

for (const key of [
  'danger', 'stress', 'suppression', 'fatigue', 'morale', 'health', 'ammo',
  'enemyVisible', 'enemyKnown', 'underFire', 'hasOrder', 'isInCover', 'weaponReady',
  'currentPositionDanger', 'currentExpectedProtection', 'bestSafePositionScore',
  'distanceToBestSafePosition', 'routeDanger', 'threatConfidence',
  'directionToThreat', 'threatDistance', 'coverProtection', 'bestCoverQuality',
  'current_action', 'self_position', 'order_target_position', 'retreat_position',
  'best_cover_position', 'current_target', 'remembered_enemy_position',
  'resilience', 'caution', 'decisiveness', 'discipline', 'initiative', 'tactics',
  'weaponSkill', 'confusion', 'attention', 'view', 'intuition', 'speed', 'stealth',
  'posture', 'behaviorProfile',
]) {
  assert.ok(catalog.includes(`'${key}'`) || catalog.includes(`"${key}"`), `catalog is missing ${key}`);
}

assert.match(catalog, /labelRu:/, 'Russian labels are required');
assert.match(catalog, /descriptionRu:/, 'Russian descriptions are required');
assert.match(catalog, /readiness:\s*'simplified'/, 'simplified readiness must be represented');
assert.match(catalog, /readiness:\s*'planned'/, 'planned readiness must be represented');
assert.match(catalog, /getAiConceptsForNodeType/, 'catalog must drive node choices');
assert.match(catalog, /validateAiBlackboardSnapshot/, 'catalog must validate live snapshots');

assert.match(panel, /DEFAULT_AI_DICTIONARY_LANGUAGE\s*=\s*'ru'/, 'Russian must be default');
assert.match(panel, /data-ai-dictionary-search/, 'dictionary must have search');
assert.match(panel, /data-ai-dictionary-readiness/, 'dictionary must have readiness filters');
assert.match(panel, /data-ai-dictionary-live-value/, 'dictionary must expose live values');
assert.match(panel, /data-ai-dictionary-add-node/, 'dictionary must support adding a node');
assert.match(panel, /data-ai-dictionary-show-map/, 'dictionary must support map focus where possible');

assert.match(game, /buildBlackboardForUnit/, 'game dictionary must use the real soldier blackboard');
assert.match(game, /installAiDictionaryPanel/, 'game integration must install the shared panel');
assert.match(game, /real-wargame\.ai-dictionary\.snapshot\.v1/, 'game integration must share expanded live values with the editor');
assert.match(editor, /ai-graph-runtime-debug/, 'editor dictionary must read live debug data');
assert.match(editor, /real-wargame\.ai-node-editor\.graph\.v6/, 'editor integration must update the real graph');
assert.match(editor, /location\.reload/, 'editor must visibly refresh after adding a node');
assert.match(workbench, /custom-memory/, 'workbench must provide custom memory');
assert.match(workbench, /analyzeGraph/, 'workbench must provide human graph diagnostics');
assert.match(workbench, /decision-history/, 'workbench must store recent decisions');
assert.match(workbench, /DEFAULT|language === 'ru'|return 'ru'/, 'workbench must remain Russian-first');

assert.match(gameEntry, /installAiDictionaryGameIntegration/, 'game entry must install dictionary');
assert.match(editorHtml, /AiDictionaryEditorIntegration\.ts/, 'AI editor must install dictionary');
assert.match(editorHtml, /ai-dictionary\.css/, 'AI editor must load dictionary styles');
assert.match(editorHtml, /AiDictionaryWorkbench\.ts/, 'AI editor must load the authoring workbench');
assert.match(editorHtml, /ai-dictionary-workbench\.css/, 'AI editor must load workbench styles');

assert.match(languageRules, /English/, 'development language rule must state English');
assert.match(languageRules, /Russian/, 'development language rule must require Russian translation');
assert.match(languageRules, /default/i, 'language rule must state the default language');

console.log('AI dictionary smoke checks passed.');
