import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'src/ai-node-editor/CombatCatalogEditor.ts',
  'src/ai-node-editor/CombatCatalogEditorSchema.ts',
  'src/ai-node-editor/combat-catalog-editor.css',
  'src/core/infantry-combat/catalogs/CombatCatalogStorage.ts',
];
for (const file of requiredFiles) {
  if (!existsSync(path.join(repoRoot, file))) fail(`Не найден обязательный файл: ${file}`);
}

const html = read('ai-node-editor.html');
contains(html, '/src/ai-node-editor/combat-catalog-editor.css', 'HTML должен подключать стили каталога.');
contains(html, '/src/ai-node-editor/CombatCatalogEditor.ts', 'HTML должен подключать модуль каталога.');

const editor = read('src/ai-node-editor/CombatCatalogEditor.ts');
for (const needle of [
  'registerAiEditorSection', "id: 'combatCatalogs'", "labelRu: 'Вооружение'",
  'Боеприпасы', 'Оружие', 'Комплекты снаряжения',
  'data-combat-exact-ref="ammo"', 'data-combat-exact-ref="primary"', 'data-combat-exact-ref="secondary"',
  'Создать черновик новой ревизии', 'Сохранить', 'Опубликовать', 'Архивировать', 'Отменить изменения',
  'validateCombatCatalogBundle', 'messageRu', 'issue.severity', 'issue.path', 'issue.code',
  'add-reload-stage', 'remove-reload-stage', 'move-reload-stage-up', 'move-reload-stage-down',
  'real-wargame-combat-catalog-v1.json', 'Импорт', 'Экспорт', 'Сбросить каталоги',
  'CombatCatalogStorageAdapter', 'COMBAT_CATALOG_STORAGE_KEY',
]) contains(editor, needle, `Редактор должен содержать контракт: ${needle}`);

const schema = read('src/ai-node-editor/CombatCatalogEditorSchema.ts');
for (const needle of [
  'projectileMassKilograms', 'muzzleVelocityMetersPerSecond', 'bodyPenetrationBudget',
  'woundEffectMultiplier', 'tracerVisualProfileId', 'maximumLifetimeSeconds',
  'weaponClass', 'availableFireModes', 'roundsPerMinute', 'shortBurstRounds', 'longBurstRounds',
  'capacityRounds', 'baseDispersionRadians', 'aimQualityPerSecond', 'recoilPitchRadiansPerShot',
  'recoilYawRadiansPerShot', 'recoilRecoveryPerSecond', 'readySeconds', 'recoverySeconds',
  'allowFireWhileMoving', 'movingDispersionMultiplier', 'postureDispersionMultiplier',
  'deploySeconds', 'undeploySeconds', 'deployedTraverseArcRadians', 'undeployedSustainedFireMultiplier',
  'assistantDeployMultiplier', 'assistantReloadMultiplier', 'soundRadiusMeters',
  'muzzleFlashVisibility', 'muzzleForwardOffsetMeters',
  'reserveRoundsByAmmoDefinitionId', 'maximumReserveRoundsByAmmoDefinitionId',
  'firstAidCharges', 'proficiencyByWeaponClass',
]) contains(schema, needle, `Схема должна описывать поле: ${needle}`);

const storage = read('src/core/infantry-combat/catalogs/CombatCatalogStorage.ts');
contains(storage, 'real-wargame.combat-catalog.bundle.v1', 'Хранилище должно использовать постоянный ключ.');
const forbiddenDeterminism = [
  ['Date', 'now'].join('.'),
  ['performance', 'now'].join('.'),
  ['Math', 'random'].join('.'),
  ['random', 'UUID'].join(''),
];
for (const source of [editor, schema, storage]) {
  for (const forbidden of forbiddenDeterminism) {
    notContains(source, forbidden, `Запрещена недетерминированность: ${forbidden}`);
  }
}
for (const forbidden of ["../core/combat", 'WeaponModel', 'FireAction', 'UnitModel', 'Graph v2']) {
  notContains(editor, forbidden, `Редактор не должен зависеть от старого runtime: ${forbidden}`);
}

console.log('combat-catalog-editor: smoke passed');

function read(file) { return readFileSync(path.join(repoRoot, file), 'utf8'); }
function contains(content, needle, message) { if (!content.includes(needle)) fail(message); }
function notContains(content, needle, message) { if (content.includes(needle)) fail(message); }
function fail(message) { console.error(`[FAIL] ${message}`); process.exit(1); }
