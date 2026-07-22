# Промт исполнителю — Stage 01A: Combat Catalog Core

## Роль

Ты — отдельный технический исполнитель узкого этапа 1A. Ты реализуешь только чистое ядро каталогов новой системы стрелкового боя. Ты не проектируешь всю систему заново и не расширяешь scope.

## Репозиторий и ветки

- Репозиторий: `AndrewVerhoturov1/Real-wargame`.
- Базовая ветка: `real-wargame-preview`.
- Обязательный base SHA: `fe0ba5f16d91bb765366c0ad56525684b3e47527`.
- Рабочая ветка: `feature/20260722-shooting-stage-01a-catalog-core`.
- Перед работой проверь удалённый HEAD `real-wargame-preview`.
- Если HEAD отличается от указанного base SHA, не начинай реализацию. Зафиксируй новый SHA, сравни изменения и верни оркестратору отчёт о конфликте или отсутствии конфликта.
- Не изменяй `real-wargame-preview` и `main`.
- Не делай force-push и не переписывай историю.

## Источник истины

Архитектурная спецификация:

- ветка: `planning/20260722-shooting-system-architecture`;
- commit: `58309fd1d7c5f436d57fb1136f077afa29f53eb5`;
- файл: `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md`.

План внедрения:

- ветка: `planning/20260722-shooting-system-implementation`;
- файл: `plans/2026-07-22-shooting-system-rebuild.md`;
- раздел: «Этап 1A — чистое ядро каталогов».

Архитектурные решения не пересматривай. При техническом противоречии остановись и опиши его, не создавай обход.

## Прочитать до изменения

1. `AGENTS.md`.
2. `docs/ai/repo-context.json`.
3. `docs/performance/PERFORMANCE_PRINCIPLES.md`.
4. `.agents/skills/real-wargame-performance/SKILL.md`.
5. `docs/workflow/CI_RISK_BASED_ACCEPTANCE.md`.
6. `docs/orchestration/RESULT_TEMPLATE.md`.
7. Архитектурную спецификацию из указанной planning-ветки.
8. План внедрения из указанной planning-ветки.
9. Образцы текущих реестров и сериализации:
   - `src/core/movement/MovementProfileTypes.ts`;
   - `src/core/movement/MovementProfileRegistry.ts`;
   - `src/core/movement/MovementProfileImportValidation.ts`;
   - `src/core/map/EnvironmentMaterialProfile.ts`.
10. Образцы smoke wrapper:
   - `scripts/environment_profile_revisions_smoke.ts`;
   - `scripts/environment_profile_revisions_smoke.mjs`.

## Цель этапа

Создать чистое платформенно-независимое ядро:

- определения боеприпасов;
- определения оружия;
- шаблоны снаряжения;
- неизменяемые опубликованные ревизии;
- точные ссылки `definitionId + revision`;
- проверку данных;
- детерминированный канонический JSON import/export;
- встроенную revision 1 для винтовки Мосина, ППШ-41, ДП-27 и четырёх шаблонов снаряжения.

Этап не подключается к игре и не меняет runtime.

## Разрешённый scope

Создать:

- `src/core/infantry-combat/catalogs/CombatCatalogTypes.ts`
- `src/core/infantry-combat/catalogs/CombatCatalogDefaults.ts`
- `src/core/infantry-combat/catalogs/CombatCatalogValidation.ts`
- `src/core/infantry-combat/catalogs/CombatCatalogRegistry.ts`
- `src/core/infantry-combat/catalogs/CombatCatalogSerialization.ts`
- `src/core/infantry-combat/catalogs/index.ts`
- `scripts/combat_catalog_core_smoke.ts`
- `scripts/combat_catalog_core_smoke.mjs`
- `scripts/combat_catalog_serialization_smoke.ts`
- `scripts/combat_catalog_serialization_smoke.mjs`

Изменить:

- `package.json` — добавить:
  - `combat-catalog-core:smoke`;
  - `combat-catalog-serialization:smoke`;
  - `combat-catalogs:smoke`.

Можно изменить только эти пути. Если необходим другой файл — остановись и запроси изменение scope у оркестратора.

## Запрещённый scope

Не изменять:

- `SimulationState`;
- `UnitModel`;
- `SceneExport`;
- `SimulationTick`;
- movement;
- posture;
- perception;
- geometry;
- spatial indexes;
- UI и `ai-node-editor.html`;
- Graph v2;
- `src/core/combat/**`;
- существующие scene data;
- deployment/workflows.

Не добавлять:

- weapon runtime;
- projectile runtime;
- damage/wounds;
- suppression;
- reload action runtime;
- отдельные классы под Mosin/PPSh/DP;
- DOM, PixiJS, localStorage;
- singleton runtime registry;
- `WeakMap`;
- случайность;
- wall-clock time.

## Обязательные интерфейсы

Реализуй точные публичные имена:

```ts
export interface DefinitionRef {
  definitionId: string;
  revision: number;
}

export type WeaponClass = "rifle" | "submachine_gun" | "machine_gun" | "pistol";
export type FireMode = "single" | "short_burst" | "long_burst" | "suppress";
export type WeaponProficiency = "untrained" | "trained" | "specialist";
export type ReloadStageKind = "open" | "load" | "close";
export type CatalogEntryStatus = "draft" | "published" | "archived";

export interface AmmoDefinitionV1 {
  schemaVersion: 1;
  ammoDefinitionId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  projectileMassKilograms: number;
  muzzleVelocityMetersPerSecond: number;
  bodyPenetrationBudget: number;
  woundEffectMultiplier: number;
  tracer: boolean;
  tracerVisualProfileId: string | null;
  maximumLifetimeSeconds: number;
}

export interface ReloadStageDefinitionV1 {
  stageId: string;
  kind: ReloadStageKind;
  durationSeconds: number;
  interruptible: boolean;
  movementAllowed: boolean;
  loadedRoundsAppliedAtCompletion: boolean;
}

export interface WeaponDefinitionV1 {
  schemaVersion: 1;
  weaponDefinitionId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  weaponClass: WeaponClass;
  ammo: DefinitionRef;
  availableFireModes: FireMode[];
  roundsPerMinute: number;
  shortBurstRounds: number;
  longBurstRounds: number;
  capacityRounds: number;
  baseDispersionRadians: number;
  aimQualityPerSecond: number;
  recoilPitchRadiansPerShot: number;
  recoilYawRadiansPerShot: number;
  recoilRecoveryPerSecond: number;
  readySeconds: number;
  recoverySeconds: number;
  reloadStages: ReloadStageDefinitionV1[];
  allowFireWhileMoving: boolean;
  movingDispersionMultiplier: number;
  postureDispersionMultiplier: Record<"standing" | "crouched" | "prone", number>;
  deploySeconds: number;
  undeploySeconds: number;
  deployedTraverseArcRadians: number;
  undeployedSustainedFireMultiplier: number;
  assistantDeployMultiplier: number;
  assistantReloadMultiplier: number;
  soundRadiusMeters: number;
  muzzleFlashVisibility: number;
  muzzleForwardOffsetMeters: number;
}

export interface LoadoutWeaponTemplateV1 {
  definition: DefinitionRef;
  loadedRounds: number;
}

export interface LoadoutTemplateV1 {
  schemaVersion: 1;
  loadoutTemplateId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  primary: LoadoutWeaponTemplateV1;
  secondary: LoadoutWeaponTemplateV1 | null;
  reserveRoundsByAmmoDefinitionId: Record<string, number>;
  maximumReserveRoundsByAmmoDefinitionId: Record<string, number>;
  firstAidCharges: number;
  role: "rifleman" | "submachine_gunner" | "machine_gunner" | "assistant_machine_gunner";
  proficiencyByWeaponClass: Record<WeaponClass, WeaponProficiency>;
}

export interface CombatCatalogBundleV1 {
  formatVersion: 1;
  revision: number;
  ammoDefinitions: AmmoDefinitionV1[];
  weaponDefinitions: WeaponDefinitionV1[];
  loadoutTemplates: LoadoutTemplateV1[];
}

export interface CatalogValidationIssue {
  path: string;
  code: string;
  severity: "error" | "warning";
  messageRu: string;
}

export interface CatalogValidationResult {
  valid: boolean;
  issues: CatalogValidationIssue[];
}

export class CombatCatalogRegistry {
  static fromUnknown(value: unknown): CombatCatalogRegistry;
  static importJson(json: string): CombatCatalogRegistry;
  exportJson(): string;
  toData(): CombatCatalogBundleV1;
  listAmmoDefinitions(options?: { includeArchived?: boolean }): AmmoDefinitionV1[];
  listWeaponDefinitions(options?: { includeArchived?: boolean }): WeaponDefinitionV1[];
  listLoadoutTemplates(options?: { includeArchived?: boolean }): LoadoutTemplateV1[];
  resolveAmmo(ref: DefinitionRef): AmmoDefinitionV1;
  resolveWeapon(ref: DefinitionRef): WeaponDefinitionV1;
  resolveLoadout(ref: DefinitionRef): LoadoutTemplateV1;
  saveAmmoDraft(definition: AmmoDefinitionV1): AmmoDefinitionV1;
  saveWeaponDraft(definition: WeaponDefinitionV1): WeaponDefinitionV1;
  saveLoadoutDraft(template: LoadoutTemplateV1): LoadoutTemplateV1;
  publishAmmoRevision(definitionId: string): AmmoDefinitionV1;
  publishWeaponRevision(definitionId: string): WeaponDefinitionV1;
  publishLoadoutRevision(definitionId: string): LoadoutTemplateV1;
  archiveAmmoRevision(ref: DefinitionRef): AmmoDefinitionV1;
  archiveWeaponRevision(ref: DefinitionRef): WeaponDefinitionV1;
  archiveLoadoutRevision(ref: DefinitionRef): LoadoutTemplateV1;
}

export function createDefaultCombatCatalogRegistry(): CombatCatalogRegistry;
export function validateCombatCatalogBundle(value: unknown): CatalogValidationResult;
export function serializeCombatCatalogBundle(bundle: CombatCatalogBundleV1): string;
```

Методы возвращают защитные глубокие копии или неизменяемые значения. Внешний код не должен менять registry через полученный объект.

## Встроенные ID

Ammo revision 1:

- `ammo_762x54r_ball`;
- `ammo_762x25_tokarev`.

Weapon revision 1:

- `weapon_mosin_m9130`;
- `weapon_ppsh41`;
- `weapon_dp27`.

Loadout revision 1:

- `loadout_rifleman`;
- `loadout_submachine_gunner`;
- `loadout_machine_gunner`;
- `loadout_assistant_machine_gunner`.

Начальные числа выбери умеренными и явно подпиши в коде как настроечные значения прототипа. Не заявляй их исторически точными.

## Контракт проверки данных

Обязательно:

1. ID: `/^[a-z][a-z0-9_]{2,63}$/`.
2. revision: integer `>= 1`.
3. все числа finite.
4. физически обязательные массы, скорости, lifetime, capacity и durations `> 0`.
5. остальные количества и коэффициенты `>= 0`.
6. fire modes уникальны.
7. automatic modes требуют `roundsPerMinute > 0`.
8. `shortBurstRounds <= longBurstRounds <= capacityRounds`.
9. reload stages имеют уникальные `stageId`.
10. stage с `kind: "load"` существует ровно один раз.
11. `loadedRoundsAppliedAtCompletion` равен `true` ровно у load stage.
12. weapon ammo ref разрешается на точную revision.
13. loadout weapon refs разрешаются на точные revisions.
14. loaded rounds не превышают capacity.
15. reserve не превышает maximum reserve.
16. published revision нельзя заменить через save-draft.
17. публикация draft создаёт следующую revision и не меняет старую.
18. archived revision разрешается по точной ссылке, но list без `includeArchived` её скрывает.
19. каноническая serialization сортирует entries по ID + revision и object keys лексикографически.
20. invalid import не меняет существующий registry object.

## TDD — обязательный порядок

Для каждого поведения:

1. Добавь один узкий assertion в соответствующий smoke.
2. Запусти только этот smoke и подтверди ожидаемое падение по отсутствующей функции или поведению.
3. Реализуй минимальный код.
4. Повтори smoke до passing.
5. После зелёного результата переходи к следующему assertion.
6. Не пиши production implementation заранее.

Минимальная последовательность red/green:

1. default bundle valid;
2. ID и finite number validation;
3. exact revision resolution;
4. immutable published revision;
5. publish creates next revision;
6. archive visibility;
7. cross-reference validation;
8. canonical JSON;
9. input array order independence;
10. repeated import idempotence.

В финальном отчёте перечисли команды red runs и ожидаемые причины падения хотя бы для первых трёх циклов; затем перечисли финальные green runs.

## Обязательные smoke cases

`combat_catalog_core_smoke.ts`:

- built-in IDs существуют и имеют статус published;
- built-in bundle valid;
- invalid ID;
- NaN, Infinity, negative;
- missing ammo ref;
- missing weapon ref;
- loaded > capacity;
- reserve > max;
- duplicate fire modes/stages;
- invalid reload load-stage;
- published immutable;
- publish next revision;
- archive exact resolution/list filtering;
- defensive copy.

`combat_catalog_serialization_smoke.ts`:

- canonical JSON stable;
- входные arrays в обратном порядке дают тот же output;
- порядок вставки object keys не меняет output;
- export → import → export даёт побайтовое равенство;
- import → import идемпотентен;
- неизвестный будущий `formatVersion` отклоняется явно;
- malformed JSON даёт понятную ошибку;
- invalid import не изменяет уже созданный registry.

## Save/load, ownership, determinism, performance

- Runtime save/load: не применимо, потому что этап не подключён к simulation state.
- Catalog JSON round-trip: обязателен.
- Ownership: не применимо.
- Determinism: канонический JSON и результаты validation не зависят от порядка входных arrays/maps.
- Worst-case validation: `O(A + W + L + R)`, где A — ammo revisions, W — weapon revisions, L — loadouts, R — суммарные cross-references/stages.
- Full-map work: отсутствует.
- Per-tick work: отсутствует.
- Queues/caches/workers: отсутствуют.
- UI/renderer ownership: отсутствует.

## Разрешённые команды проверки

Разрешены только локальные не браузерные команды:

```bash
npm run combat-catalog-core:smoke
npm run combat-catalog-serialization:smoke
npm run combat-catalogs:smoke
npm run typecheck
npm run build
git diff --check
git status --short
```

Не запускать:

- GitHub Actions;
- Playwright;
- Chromium;
- deployment;
- broad full matrix;
- browser performance;
- Vercel.

## Commit

После passing checks:

```bash
git add package.json src/core/infantry-combat/catalogs scripts/combat_catalog_core_smoke.ts scripts/combat_catalog_core_smoke.mjs scripts/combat_catalog_serialization_smoke.ts scripts/combat_catalog_serialization_smoke.mjs
git commit -m "feat: add versioned combat catalogs"
```

Не делай дополнительные cleanup/refactor commits вне scope.

## Остановиться при конфликте

Остановись и верни `BLOCKED`, если:

- preview HEAD изменился;
- required interface невозможно реализовать без изменения другого файла;
- существующий repository contract противоречит schema;
- validation требует runtime/scene/UI knowledge;
- возникает необходимость импортировать старый combat runtime;
- built-in data требует отдельной исторической экспертизы для прохождения tests;
- package scripts нельзя добавить без изменения общей test infrastructure.

Не скрывай конфликт временным adapter.

## Формат финального отчёта

```text
task: shooting stage 01A catalog core
status: COMPLETED / PARTIAL / BLOCKED
delivery_state: code_ready / implementation
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:

Что сделано:
- ...

Acceptance evidence:
- criterion -> file/test

TDD evidence:
- red command -> expected failure
- green command -> pass

Checks actually run:
- command — passed/failed

Changed files:
- path — purpose

Architecture boundaries:
- imports from legacy combat: none
- SimulationState/UnitModel/SceneExport changed: no
- DOM/Pixi/localStorage imports: none
- WeakMap: none

Performance impact:
hot_path: none
worst_case_complexity:
main_thread_work: none
full_map_builds: none
shared_prepared_data: immutable catalog bundle
worker_and_queue_budget: none
cache_owner_key_limit: none
invalidation_revisions: definitionId + revision
stale_result_rejection: not applicable
teardown: not applicable
remaining_performance_risks:

Deployment:
deployment_requested: no
deployment_status: not_run
Playwright/Chromium/GitHub Actions: not_run

preview_touched: no
main_touched: no
preview_transfer_approval: pending
```

После отчёта не переноси ветку в preview и не создавай deployment.
