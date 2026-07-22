# Новая система стрелкового боя — план поэтапного внедрения

> **Для технических исполнителей:** каждый этап выполняется отдельным исполнителем в отдельной ветке. Исполнитель читает собственный промт этапа и применяет TDD: сначала узкий падающий тест, затем минимальная реализация, затем целевые проверки и осмысленный commit.

**Цель:** полностью заменить временную систему стрельбы новой детерминированной физической платформой пехотного боя, сохраняя проект работоспособным после каждого принятого этапа.

**Архитектура:** новая платформа создаётся в независимом корне `src/core/infantry-combat/`. Существующий `src/core/combat/` считается временным legacy-слоем и не является источником истины. Новая система подключается к единому `SimulationTick`, существующим movement/posture, perception, geometry, spatial index и save/load только через явно описанные интерфейсы.

**Стек:** TypeScript 5, Vite 5, PixiJS 8 только в UI; чистое ядро не импортирует DOM или PixiJS.

## 1. Зафиксированный baseline

- Репозиторий: `AndrewVerhoturov1/Real-wargame`.
- Базовая ветка: `real-wargame-preview`.
- Фактический удалённый HEAD на 2026-07-22: `fe0ba5f16d91bb765366c0ad56525684b3e47527`.
- Архитектурная ветка: `planning/20260722-shooting-system-architecture`.
- Фактический HEAD архитектурной ветки: `58309fd1d7c5f436d57fb1136f077afa29f53eb5`.
- Архитектурный файл: `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md`.
- Сравнение с утверждённым baseline: расхождений нет.
- Архитектурный файл пока не находится в `real-wargame-preview`; исполнители читают его из указанной planning-ветки и не переносят planning-ветку автоматически.

Перед выдачей каждого следующего исполнительского промта оркестратор заново проверяет HEAD preview. Если он изменился, оркестратор сравнивает diff, обновляет только технические пути и base SHA этого этапа и останавливается при архитектурном конфликте.

## 2. Фактические границы текущего кода

1. `src/core/simulation/SimulationTick.ts` — тонкая оболочка над `SimulationTickLegacy.ts`.
2. Старый огневой цикл вызывается внутри фазы `simulation.combat` через `FireAction`, `CombatEngagement`, `CombatEvents`, `CombatDamage` и `WeaponModel`.
3. `FireAction` и `WeaponModel` хранят долгоживущее состояние в `WeakMap`; это несовместимо с целевой моделью.
4. `src/ui/SceneExport.ts` сохраняет старые `runtime.weapon` и `runtime.combat`; версия сцены — `scene-export-v10-physical-posture-action-2m-grid`.
5. Длительная смена позы уже сериализуема и имеет `ownerToken`, но пока является отдельным действием, а не участником общего координатора каналов.
6. `BallisticTrace` использует `MapObjectSpatialIndex` для объектов, но перебирает все динамические units. Это не принимается как готовый алгоритм массовых физических пуль.
7. `MapObjectGeometry`, `MapObjectSpatialIndex`, `BallisticLineProbe`, `VisibilityRayKernel`, movement, perception contacts и save/load являются повторно используемыми контрактами.
8. Статичные редакторы подключаются через `AiEditorSectionRegistry`; профили движения дают проверенный образец registry, JSON import/export, localStorage и UI lifecycle.

## 3. Глобальные ограничения

- `main` не изменять и не развёртывать без отдельного разрешения пользователя.
- Каждый технический этап начинается от фактического актуального HEAD `real-wargame-preview`.
- Никакой этап не переносится в `real-wargame-preview` без отдельного явного разрешения.
- Deployment, Playwright, Chromium и GitHub Actions не запускать без отдельного разрешения.
- В новой платформе запрещены импорты из:
  - `src/core/combat/FireAction.ts`;
  - `src/core/combat/WeaponModel.ts`;
  - `src/core/combat/CombatEvents.ts`;
  - `src/core/combat/CombatDamage.ts`;
  - `src/core/combat/CombatSuppression.ts`;
  - `src/core/combat/CombatEngagement.ts`;
  - `src/core/combat/CombatRules.ts`.
- Единственное допустимое направление временной совместимости: legacy/orchestration-слой вызывает новый публичный API. Новый core не читает legacy runtime-state.
- Все временные адаптеры хранятся только в `src/core/infantry-combat/compat/`, перечисляются в статусе и удаляются на этапе 15.
- Долгоживущее состояние хранится в `SimulationState`, `UnitModel` или вложенных сериализуемых структурах. `WeakMap` разрешён только для восстанавливаемых кэшей.
- Результат не зависит от порядка `state.units`, каталожных массивов и event buffers.
- Изменения fixed combat step сначала собираются в bounded buffers, стабильно сортируются и затем применяются.
- Новые физические и чистые AI-модули не импортируют PixiJS, DOM, localStorage и UI.
- Не создавать второй полный spatial index, параллельную геометрию или отдельный трассировщик без измеримого доказательства необходимости.
- Любой этап с runtime-состоянием включает save/load, determinism и ownership/cancellation tests.
- Любой этап горячего пути фиксирует worst-case complexity, hard caps, allocations и диагностические счётчики.

## 4. Канонические корни и интерфейсы

```text
src/core/infantry-combat/
  catalogs/
  actions/
  fire/
  projectiles/
  hits/
  physiology/
  suppression/
  equipment/
  perception/
  diagnostics/
  graph/
  action-ports/
  compat/
```

С этапа 2B используется расширяемый `UnitModel.infantryCombat`; с этапа 3A добавляется `SimulationState.infantryCombat`:

```ts
interface SimulationState {
  infantryCombat: InfantryCombatSimulationState;
}

interface UnitModel {
  infantryCombat: UnitInfantryCombatState;
}

interface DefinitionRef {
  definitionId: string;
  revision: number;
}

interface ActionIdentity {
  actionId: string;
  owner: PhysicalActionOwner;
  ownerToken: string;
  sequence: number;
}
```

`InfantryCombatSimulationState` хранит fixed-step accumulator, projectiles, bounded buffers, exactly-once ledger, ground equipment и diagnostic revisions.

`UnitInfantryCombatState` хранит actions, equipment, active fire task, aim, recoil, wounds, blood loss, fatigue, suppression и capabilities.

Каталоги не становятся runtime-истиной конкретного бойца. При создании weapon instance или применении loadout копируется immutable snapshot точной revision.

## 5. Карта этапов

| Этап | Результат | Рекомендуемая ветка | Зависит от |
|---|---|---|---|
| 0 | Архитектурная спецификация | выполнен | — |
| 1A | Чистые каталоги, revisions, validation, JSON round-trip | `feature/20260722-shooting-stage-01a-catalog-core` | 0 |
| 1B | Статичные редакторы, browser storage, scene embedding | `feature/20260722-shooting-stage-01b-catalog-editors` | 1A |
| 2A | Чистое ядро `PhysicalActionCoordinator` | `feature/20260722-shooting-stage-02a-action-coordinator-core` | 1A |
| 2B | Интеграция coordinator с movement/posture | `feature/20260722-shooting-stage-02b-action-coordinator-integration` | 2A |
| 3A | Один полный винтовочный выстрел | `feature/20260722-shooting-stage-03a-rifle-shot` | 1B, 2B |
| 3B | Длительная поэтапная перезарядка | `feature/20260722-shooting-stage-03b-reload-action` | 3A |
| 4 | Пакетный ProjectileRuntime и benchmark 100×100 | `feature/20260722-shooting-stage-04-projectile-benchmark` | 3B |
| 5 | Aim, perception lead и recoil | `feature/20260722-shooting-stage-05-aim-lead-recoil` | 4 |
| 6 | Hit, body penetration и wounds | `feature/20260722-shooting-stage-06-wounds` | 5 |
| 7 | Blood loss, fatigue и first aid | `feature/20260722-shooting-stage-07-physiology-first-aid` | 6 |
| 8 | Автоматический огонь и suppression | `feature/20260722-shooting-stage-08-auto-fire-suppression` | 7 |
| 9 | Пулемёт, deploy и помощник | `feature/20260722-shooting-stage-09-machine-gun-crew` | 8 |
| 10 | Secondary и ground equipment | `feature/20260722-shooting-stage-10-ground-equipment` | 9 |
| 11 | Perception signals | `feature/20260722-shooting-stage-11-perception-signals` | 10 |
| 12A | Полная core-диагностика | `feature/20260722-shooting-stage-12a-diagnostics` | 11 |
| 12B | UI диагностики и завершение редакторов | `feature/20260722-shooting-stage-12b-combat-ui` | 12A |
| 13 | Graph v2 commands/facts | `feature/20260722-shooting-stage-13-graph-v2` | 12B |
| 14 | Action-port integration на новом runtime | `feature/20260722-shooting-stage-14-action-ports` | 13 |
| 15 | Финальное переключение и удаление legacy | `feature/20260722-shooting-stage-15-final-cutover` | 14 |

Зависимые этапы не выполняются параллельно. Verification-ветка создаётся после исполнительской ветки и не заменяет её.

## 6. Сквозные gates

### Exactly-once

После появления `commitShot` fixtures обязаны доказывать:

- один `shotId` списывает ровно один патрон;
- один `shotId` создаёт не более одной пули;
- повторная обработка commitment не меняет state;
- каждый impact имеет устойчивый уникальный ID;
- applied-impact ledger исключает повторное применение;
- save/load не меняет итог.

### Save/load

К финалу покрыты: readying, aiming, commitment, полёт, impact, recovery, каждый reload stage, deploy/undeploy, first aid, switch, pickup, active suppression и ненулевой fixed-step accumulator.

### Determinism

Каждый механизм сравнивается при:

1. одинаковом seed и inputs;
2. разном дроблении внешнего `dt`;
3. save/load посередине;
4. перестановке units и внутренних arrays;
5. сравнении итогового физического state без UI и wall-clock diagnostics.

### Performance

- запрещён `projectile × all units × all objects`;
- после прогрева нет allocations внутри projectile substep;
- buffers имеют hard cap и saturation diagnostics;
- lifetime, distance и penetration count ограничены;
- UI/VFX не влияют на physical state;
- этапы 5–15 блокируются, если benchmark этапа 4 показывает непригодность архитектуры.

## 7. Этап 1A — чистое ядро каталогов

### Создать

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

### Изменить

- `package.json`

### Результат и gates

- `AmmoDefinitionV1`, `WeaponDefinitionV1`, `LoadoutTemplateV1`.
- `DefinitionRef` закрепляет точную revision.
- `CombatCatalogRegistry` поддерживает draft, publish-next-revision, archive, resolve и defensive copies.
- Built-ins: `ammo_762x54r_ball`, `ammo_762x25_tokarev`, `weapon_mosin_m9130`, `weapon_ppsh41`, `weapon_dp27`, четыре role loadouts.
- Канонический JSON сортирует ID/revision и object keys.
- Tests: invalid IDs/numbers/references, immutable published revision, next revision, archived resolution, built-in validity, byte-stable import/export, order independence.
- UI, scene и runtime не меняются.

### Откат

Удалить новый каталоговый корень, четыре smoke-файла и package scripts. Runtime и scene format не затронуты.

## 8. Этап 1B — статичные редакторы и scene embedding

### Создать

- `src/ai-node-editor/CombatCatalogBrowserStorage.ts`
- `src/ai-node-editor/CombatCatalogEditorIntegration.ts`
- `src/ai-node-editor/CombatCatalogEditorPanel.ts`
- `src/ai-node-editor/combat-catalog-editor.css`
- `scripts/combat_catalog_editor_storage_smoke.ts`
- `scripts/combat_catalog_editor_storage_smoke.mjs`
- `scripts/combat_catalog_scene_roundtrip_smoke.ts`
- `scripts/combat_catalog_scene_roundtrip_smoke.mjs`

### Изменить

- `ai-node-editor.html`
- `src/ui/SceneExport.ts`
- `package.json`

### Интерфейс и gates

```ts
const COMBAT_CATALOG_STORAGE_KEY = "real-wargame.combat-catalogs.v1";
function getCombatCatalogRegistry(): CombatCatalogRegistry;
function saveCombatCatalogRegistry(registry: CombatCatalogRegistry): void;
function replaceCombatCatalogRegistry(value: unknown): CombatCatalogRegistry;
function subscribeCombatCatalogRegistry(listener: (registry: CombatCatalogRegistry) => void): () => void;
```

Через `AiEditorSectionRegistry` добавляются «Боеприпасы», «Оружие», «Комплекты снаряжения». UI поддерживает create/copy draft, publish, archive, import/export, reload stages, validation и тестовые расчёты времени полёта, расхода магазина и рассеивания.

`SceneExport.ts` повышается до `scene-export-v11-combat-catalogs`, добавляет `combatCatalogs`; старые сцены получают built-ins. Некорректный bundle отклоняется транзакционно.

### Откат

Удалить UI/storage и вернуть scene v10. До переноса обязательна отдельная round-trip проверка v10/v11.

## 9. Этап 2A — ядро PhysicalActionCoordinator

### Создать

- `src/core/infantry-combat/actions/ActionIdentity.ts`
- `src/core/infantry-combat/actions/PhysicalActionCoordinatorTypes.ts`
- `src/core/infantry-combat/actions/PhysicalActionCompatibility.ts`
- `src/core/infantry-combat/actions/PhysicalActionCoordinator.ts`
- `src/core/infantry-combat/actions/PhysicalActionCoordinatorSerialization.ts`
- `src/core/infantry-combat/actions/index.ts`
- `scripts/physical_action_coordinator_smoke.ts`
- `scripts/physical_action_coordinator_smoke.mjs`

### Изменить

- `package.json`

### Интерфейс и gates

```ts
type PhysicalActionChannel = "locomotion" | "posture" | "weapon";
type PhysicalActionStatus = "waiting" | "running" | "completed" | "cancelled" | "denied" | "failed";

interface PhysicalActionCoordinatorState {
  schemaVersion: 1;
  nextSequence: number;
  active: PhysicalActionRecord[];
  waiting: PhysicalActionRecord[];
  completedLedger: PhysicalActionRecord[];
}
```

Core не знает movement, posture, weapon или tactics. Он атомарно захватывает каналы, ждёт, отклоняет stale token/sequence, отменяет и завершает exactly once.

### Откат

Core ещё не подключён к UnitModel и удаляется без migration.

## 10. Этап 2B — интеграция coordinator

### Создать

- `src/core/infantry-combat/actions/PostureActionBinding.ts`
- `src/core/infantry-combat/actions/MovementActionBinding.ts`
- `src/core/infantry-combat/actions/WeaponPreparationActionBinding.ts`
- `scripts/physical_action_integration_smoke.ts`
- `scripts/physical_action_integration_smoke.mjs`
- `scripts/physical_action_save_load_smoke.ts`
- `scripts/physical_action_save_load_smoke.mjs`

### Изменить

- `src/core/units/UnitModel.ts`
- `src/core/actions/PostureTransition.ts`
- `src/core/movement/MovementRuntime.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/core/simulation/SimulationTickLegacy.ts`
- `src/ui/SceneExport.ts`
- `package.json`

`UnitModel` получает `infantryCombat.actions`. Posture работает под `posture`, movement под `locomotion`, weapon preparation под `weapon`. Legacy `runtime.physicalAction` мигрируется и продолжает progress.

Gates: stale token не отменяет новое действие; locks сохраняются; cancel/complete exactly once; save/load running/waiting actions; тактических решений нет.

### Откат

Удалить bindings и вернуть unit/scene fields к этапу 1B; старый posture runtime остаётся.

## 11. Этап 3A — один полный винтовочный выстрел

### Создать

- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/core/infantry-combat/fire/FireTask.ts`
- `src/core/infantry-combat/fire/FireTaskRuntime.ts`
- `src/core/infantry-combat/fire/WeaponInstance.ts`
- `src/core/infantry-combat/fire/LoadoutApplication.ts`
- `src/core/infantry-combat/fire/AimQualityRuntime.ts`
- `src/core/infantry-combat/fire/MuzzleGeometry.ts`
- `src/core/infantry-combat/fire/FriendlyFireRisk.ts`
- `src/core/infantry-combat/fire/CombatLedger.ts`
- `src/core/infantry-combat/fire/ShotCommitService.ts`
- `src/core/infantry-combat/projectiles/ProjectileTypes.ts`
- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/infantry-combat/projectiles/ProjectileCollisionResolver.ts`
- `src/core/infantry-combat/diagnostics/CombatDiagnostics.ts`
- `scripts/rifle_shot_exactly_once_smoke.ts`
- `scripts/rifle_shot_exactly_once_smoke.mjs`
- `scripts/rifle_shot_save_load_smoke.ts`
- `scripts/rifle_shot_save_load_smoke.mjs`
- `scripts/rifle_shot_geometry_smoke.ts`
- `scripts/rifle_shot_geometry_smoke.mjs`

### Изменить

- `src/core/units/UnitModel.ts`
- `src/core/simulation/SimulationState.ts`
- `src/core/simulation/SimulationStateLegacy.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

### Результат и gates

- полный `FireTask` из спецификации;
- loadout copied into unit; runtime не зависит от template;
- accepted → weapon_ready → aiming → firing → recovery;
- posture muzzle table и forward offset;
- `muzzleBlocked` без расхода патрона;
- pre-commit friendly risk;
- atomic `commitShot`;
- одна physical projectile с fixed `1/30`, gravity и swept segment;
- один impact;
- exactly-once и save/load во всех критических точках.

Stage 3A поддерживает только `single`; новый код не импортирует старую стрельбу.

### Откат

Удалить `infantryCombat` state и новые modules/tests. Legacy path остаётся включённым до stage 15.

## 12. Этап 3B — длительная перезарядка

### Создать

- `src/core/infantry-combat/fire/ReloadAction.ts`
- `src/core/infantry-combat/fire/ReloadStageRuntime.ts`
- `scripts/reload_action_stages_smoke.ts`
- `scripts/reload_action_stages_smoke.mjs`
- `scripts/reload_action_save_load_smoke.ts`
- `scripts/reload_action_save_load_smoke.mjs`

### Изменить

- `src/core/infantry-combat/fire/WeaponInstance.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

### Gates

- 2–3 catalog-defined stages;
- interruption сохраняет фактическое состояние;
- reserve уменьшается только в `load` completion;
- loaded rounds не исчезают;
- weapon channel и movement restrictions идут через coordinator;
- save/load в каждой стадии;
- повторный tick не повторяет перенос rounds.

### Откат

Удалить reload runtime; single fire stage 3A остаётся, пустое оружие возвращает `reloadRequired`.

## 13. Этап 4 — ProjectileRuntime и benchmark

### Создать

- `src/core/infantry-combat/projectiles/ProjectileBuffer.ts`
- `src/core/infantry-combat/projectiles/ProjectileEventBuffers.ts`
- `src/core/infantry-combat/projectiles/ProjectileDiagnostics.ts`
- `src/core/infantry-combat/projectiles/ProjectileBenchmarkFixture.ts`
- `scripts/projectile_runtime_determinism_smoke.ts`
- `scripts/projectile_runtime_determinism_smoke.mjs`
- `scripts/projectile_runtime_bounds_smoke.ts`
- `scripts/projectile_runtime_bounds_smoke.mjs`
- `scripts/projectile_100x100_benchmark.ts`
- `scripts/projectile_100x100_benchmark.mjs`

### Изменить

- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/infantry-combat/projectiles/ProjectileCollisionResolver.ts`
- `src/core/simulation/SimulationTick.ts`
- `package.json`

### Условный, но точный performance gate

`src/core/spatial/UnitSpatialIndex.ts` создаётся только если измерение доказывает путь `activeProjectiles × state.units.length` и в актуальном preview отсутствует пригодный канонический unit query. Созданный индекс становится единственным общим динамическим unit index.

Benchmark фиксирует active projectiles, fixed steps, broad/narrow tests, impacts, near-miss candidates, saturation, allocations after warmup и simulation cost average/p50/p95/p99/max. Hard caps записываются в `ProjectileRuntimeConfig`.

Stage 5 не начинается, если остаётся полный scan units/objects на projectile или per-substep allocations.

### Откат

Вернуть минимальный stage-3A projectile runtime.

## 14. Этап 5 — aim, lead и recoil

### Создать

- `src/core/infantry-combat/fire/AimSolutionRuntime.ts`
- `src/core/infantry-combat/fire/AimTrackingScheduler.ts`
- `src/core/infantry-combat/fire/AngularDispersion.ts`
- `src/core/infantry-combat/fire/RecoilRuntime.ts`
- `src/core/infantry-combat/fire/PredictedHitProbability.ts`
- `scripts/aim_solution_determinism_smoke.ts`
- `scripts/aim_solution_determinism_smoke.mjs`
- `scripts/aim_perception_boundary_smoke.ts`
- `scripts/aim_perception_boundary_smoke.mjs`

### Изменить

- `src/core/perception/PerceptionContact.ts`
- `src/core/infantry-combat/fire/FireTaskRuntime.ts`
- `src/core/infantry-combat/fire/ShotCommitService.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Tracking читает только perceived position, estimated velocity, age и uncertainty из `PerceptionContactMemory` и обновляется 5 Hz. Probability — только факт. Seed dispersion зависит от stable IDs. Diagnostics раскладывает base/aim/movement/posture/fatigue/wounds/skill/proficiency/recoil; отсутствующие stage-6/7 factors равны нейтральным 1.

### Откат

Stage-3A прямое направление используется только как migration fallback старых snapshots.

## 15. Этап 6 — hit, penetration и wounds

### Создать

- `src/core/infantry-combat/hits/CoarseBodyGeometry.ts`
- `src/core/infantry-combat/hits/BodyPenetrationResolver.ts`
- `src/core/infantry-combat/hits/HitResolver.ts`
- `src/core/infantry-combat/hits/WoundTypes.ts`
- `src/core/infantry-combat/hits/WoundRuntime.ts`
- `src/core/infantry-combat/hits/PhysicalCapabilities.ts`
- `scripts/body_hit_geometry_smoke.ts`
- `scripts/body_hit_geometry_smoke.mjs`
- `scripts/wound_determinism_smoke.ts`
- `scripts/wound_determinism_smoke.mjs`
- `scripts/body_penetration_smoke.ts`
- `scripts/body_penetration_smoke.mjs`

### Изменить

- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/infantry-combat/projectiles/ProjectileCollisionResolver.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Четыре зоны, три тяжести, максимум четыре aggregate slots. Seed variation сдвигает только соседнюю severity. Penetration impact ID = `shotId + ordinal`; действует hard cap.

### Откат

Impacts снова terminal без wound application.

## 16. Этап 7 — blood loss, fatigue и first aid

### Создать

- `src/core/infantry-combat/physiology/BloodLossRuntime.ts`
- `src/core/infantry-combat/physiology/FatigueRuntime.ts`
- `src/core/infantry-combat/physiology/ConsciousnessRuntime.ts`
- `src/core/infantry-combat/physiology/ApplyFirstAidAction.ts`
- `scripts/blood_loss_fixed_rate_smoke.ts`
- `scripts/blood_loss_fixed_rate_smoke.mjs`
- `scripts/fatigue_fixed_rate_smoke.ts`
- `scripts/fatigue_fixed_rate_smoke.mjs`
- `scripts/first_aid_save_load_smoke.ts`
- `scripts/first_aid_save_load_smoke.mjs`

### Изменить

- `src/core/infantry-combat/hits/WoundRuntime.ts`
- `src/core/infantry-combat/hits/PhysicalCapabilities.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Blood loss обновляется 1 Hz, fatigue 4 Hz, оба с сериализуемыми accumulators. First aid занимает weapon channel; charge списывается при завершении. Severe — один charge, critical — две стадии. Тактических решений нет.

### Откат

Stage-6 wounds сохраняются без progression.

## 17. Этап 8 — автоматический огонь и suppression

### Создать

- `src/core/infantry-combat/fire/AutomaticFireRuntime.ts`
- `src/core/infantry-combat/fire/SuppressAreaSupportPoints.ts`
- `src/core/infantry-combat/suppression/SuppressionTypes.ts`
- `src/core/infantry-combat/suppression/SuppressionImpulseBuffer.ts`
- `src/core/infantry-combat/suppression/SuppressionRuntime.ts`
- `scripts/automatic_fire_cadence_smoke.ts`
- `scripts/automatic_fire_cadence_smoke.mjs`
- `scripts/suppression_physical_sources_smoke.ts`
- `scripts/suppression_physical_sources_smoke.mjs`
- `scripts/automatic_fire_performance_smoke.ts`
- `scripts/automatic_fire_performance_smoke.mjs`

### Изменить

- `src/core/infantry-combat/fire/FireTaskRuntime.ts`
- `src/core/infantry-combat/fire/ShotCommitService.ts`
- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Каждый shot очереди — отдельный commit/projectile. Near miss и impact только физические. Continuous-fire bonus усиливает подтверждённые события. Aggregation window 0.2 s по `sourceId + affectedUnitId`.

### Откат

Automatic modes запрещаются, single остаётся.

## 18. Этап 9 — пулемёт и помощник

### Создать

- `src/core/infantry-combat/fire/DeployWeaponAction.ts`
- `src/core/infantry-combat/fire/DeployedWeaponConstraint.ts`
- `src/core/infantry-combat/fire/CrewAssistAction.ts`
- `src/core/infantry-combat/fire/AmmoTransferAction.ts`
- `scripts/machine_gun_deploy_smoke.ts`
- `scripts/machine_gun_deploy_smoke.mjs`
- `scripts/machine_gun_assistant_smoke.ts`
- `scripts/machine_gun_assistant_smoke.mjs`

### Изменить

- `src/core/infantry-combat/fire/FireTaskRuntime.ts`
- `src/core/infantry-combat/fire/WeaponInstance.ts`
- `src/core/infantry-combat/fire/ReloadAction.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Deploy state фиксирует position/direction/traverse arc. Assistant ускоряет deploy, reload и ammo transfer, но не обязателен. Потеря assistant не ломает weapon state. Нагрев и неисправности отсутствуют.

### Откат

Machine gun остаётся usable undeployed с табличным штрафом; assistant actions удаляются.

## 19. Этап 10 — secondary и ground equipment

### Создать

- `src/core/infantry-combat/equipment/SwitchWeaponAction.ts`
- `src/core/infantry-combat/equipment/GroundEquipmentTypes.ts`
- `src/core/infantry-combat/equipment/GroundEquipmentRuntime.ts`
- `src/core/infantry-combat/equipment/PickupEquipmentAction.ts`
- `scripts/weapon_switch_save_load_smoke.ts`
- `scripts/weapon_switch_save_load_smoke.mjs`
- `scripts/ground_equipment_pickup_smoke.ts`
- `scripts/ground_equipment_pickup_smoke.mjs`

### Изменить

- `src/core/infantry-combat/fire/WeaponInstance.ts`
- `src/core/infantry-combat/InfantryCombatState.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Ground equipment хранится в simulation state. Pickup частичный до max reserve; заменённое weapon остаётся на земле. Полного inventory нет.

### Откат

Snapshots с ground equipment отклоняются явной migration error, а не молчаливой потерей.

## 20. Этап 11 — perception signals

### Создать

- `src/core/infantry-combat/perception/PerceptionSignalTypes.ts`
- `src/core/infantry-combat/perception/ShotSoundEmitter.ts`
- `src/core/infantry-combat/perception/MuzzleFlashEmitter.ts`
- `src/core/infantry-combat/perception/IncomingFireEmitter.ts`
- `src/core/infantry-combat/perception/CombatContactUpdater.ts`
- `scripts/combat_perception_uncertainty_smoke.ts`
- `scripts/combat_perception_uncertainty_smoke.mjs`
- `scripts/shot_sound_spatial_query_smoke.ts`
- `scripts/shot_sound_spatial_query_smoke.mjs`

### Изменить

- `src/core/perception/PerceptionContact.ts`
- `src/core/infantry-combat/fire/ShotCommitService.ts`
- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Sound listeners выбираются spatial query, затем distance attenuation и один coarse occlusion test. Выстрел не раскрывает точную позицию. Повторные signals уменьшают uncertainty.

### Откат

Combat signals отключаются, visual perception остаётся.

## 21. Этап 12A — core diagnostics

### Создать

- `src/core/infantry-combat/diagnostics/CombatDiagnosticTypes.ts`
- `src/core/infantry-combat/diagnostics/CombatDiagnosticSnapshot.ts`
- `src/core/infantry-combat/diagnostics/CombatPerformanceCounters.ts`
- `src/core/infantry-combat/diagnostics/CombatLedgerDiagnostics.ts`
- `scripts/combat_diagnostics_snapshot_smoke.ts`
- `scripts/combat_diagnostics_snapshot_smoke.mjs`

### Изменить

- `src/core/infantry-combat/diagnostics/CombatDiagnostics.ts`
- `src/core/infantry-combat/fire/FireTaskRuntime.ts`
- `src/core/infantry-combat/fire/AimSolutionRuntime.ts`
- `src/core/infantry-combat/projectiles/ProjectileRuntime.ts`
- `src/core/infantry-combat/hits/WoundRuntime.ts`
- `src/core/infantry-combat/physiology/BloodLossRuntime.ts`
- `src/core/infantry-combat/physiology/FatigueRuntime.ts`
- `src/core/infantry-combat/suppression/SuppressionRuntime.ts`
- `src/core/debug/SimulationStepPerformanceDiagnostics.ts`
- `package.json`

UI не пересчитывает physics. Snapshot immutable и revision-driven.

### Откат

Удалить snapshots/counters; semantics не меняются.

## 22. Этап 12B — UI diagnostics и завершение редакторов

### Создать

- `src/ui/CombatDiagnosticsPanel.ts`
- `src/ui/combat-diagnostics-panel.css`
- `src/ai-node-editor/CombatCatalogTestCalculations.ts`
- `scripts/combat_diagnostics_ui_contract_smoke.ts`
- `scripts/combat_diagnostics_ui_contract_smoke.mjs`

### Изменить

- `index.html`
- `ai-node-editor.html`
- `src/ui/TacticalWorkspace.ts`
- `src/ai-node-editor/CombatCatalogEditorPanel.ts`
- `package.json`

UI показывает phases, aim decomposition, muzzle/risk, projectiles, hits, wounds, physiology, suppression, ammo/reload, ledger и performance counters. UI только читает snapshots.

### Откат

Удалить panels/styles; runtime diagnostics остаются.

## 23. Этап 13 — Graph v2 integration

### Создать

- `src/core/infantry-combat/graph/CombatGraphCommands.ts`
- `src/core/infantry-combat/graph/CombatGraphFacts.ts`
- `src/core/infantry-combat/graph/CombatGraphRuntimeAdapter.ts`
- `scripts/combat_graph_commands_smoke.ts`
- `scripts/combat_graph_commands_smoke.mjs`
- `scripts/combat_graph_subjective_facts_smoke.ts`
- `scripts/combat_graph_subjective_facts_smoke.mjs`

### Изменить

- `src/core/ai/contracts/AiNodeContractRegistry.ts`
- `src/core/ai/AiBlackboard.ts`
- `src/core/ai/AiGraphRuntime.ts`
- `package.json`

Команды: FireTask, reload, deploy, medicine, switch, pickup, crew assist. Факты: canFire/reason, phase, aim/probability/risk/muzzle, ammo, recoil/deployment, suppression, fatigue, blood/capabilities. Adapter переводит команды и публикует facts; решения остаются в Graph v2.

### Откат

Удалить contracts/adapter; physics API остаётся callable tests/player.

## 24. Этап 14 — action-port integration

### Создать

- `src/core/infantry-combat/action-ports/ActionPortCombatTask.ts`
- `src/core/infantry-combat/action-ports/ActionPortCombatRuntime.ts`
- `scripts/action_port_new_fire_runtime_smoke.ts`
- `scripts/action_port_new_fire_runtime_smoke.mjs`
- `scripts/action_port_combat_save_load_smoke.ts`
- `scripts/action_port_combat_save_load_smoke.mjs`

### Изменить

- `src/core/tactical/action-ports/TacticalActionPortSolver.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/core/units/UnitModel.ts`
- `src/ui/SceneExport.ts`
- `package.json`

Поток: anchor → port → posture → observe/new FireTask → return. Runtime не вызывает `requestFireAction`, не пересчитывает global tactical position и использует coordinator ownership.

### Откат

Action-port combat task отключается; base observation/return остаётся.

## 25. Этап 15 — финальное переключение

### Создать

- `scripts/legacy_combat_absence_smoke.ts`
- `scripts/legacy_combat_absence_smoke.mjs`
- `scripts/combat_scene_migration_smoke.ts`
- `scripts/combat_scene_migration_smoke.mjs`

### Удалить после доказанного отсутствия consumers

- `src/core/combat/FireAction.ts`
- `src/core/combat/WeaponModel.ts`
- `src/core/combat/CombatEvents.ts`
- `src/core/combat/CombatDamage.ts`
- `src/core/combat/CombatSuppression.ts`
- `src/core/combat/CombatEngagement.ts`
- `src/core/combat/CombatRules.ts`
- `src/core/infantry-combat/compat/**`

### Изменить

- `src/core/simulation/SimulationTickLegacy.ts`
- `src/core/units/UnitModel.ts`
- `src/ui/SceneExport.ts`
- `package.json`
- `docs/subprojects/infantry-combat-prototype-v1/STATUS.md`
- `docs/subprojects/infantry-combat-prototype-v1/ROADMAP.md`
- `docs/subprojects/infantry-combat-prototype-v1/DECISIONS.md`
- `docs/subprojects/infantry-combat-prototype-v1/WORKLOG.md`
- `docs/subprojects/infantry-combat-prototype-v1/subproject.json`

Старые saves проходят только принятую migration policy. Ни одного legacy consumer не остаётся. Удаление legacy — последний commit этапа после passing absence/migration tests, поэтому rollback до него является обычным revert.

## 26. Проверка результата исполнителя

Оркестратор после каждого отчёта:

1. проверяет branch HEAD и base SHA;
2. сравнивает branch с текущим preview;
3. читает полный diff;
4. проверяет случайные файлы и расширение scope;
5. сопоставляет acceptance criteria с кодом/tests;
6. проверяет публичные interfaces и направление dependencies;
7. проверяет save/load долгоживущего state;
8. проверяет ownership/cancellation;
9. проверяет stable IDs, ordering и determinism;
10. ищет `WeakMap`, full scans, unbounded arrays и per-step allocations;
11. проверяет отсутствие legacy combat dependency;
12. проверяет reuse geometry/spatial contracts;
13. требует свежие outputs фактически выполненных команд;
14. для этапов 2A–8, 13–15 и stage 4 назначает независимого verification-исполнителя;
15. запрашивает живую проверку только там, где tests не доказывают UX;
16. отдельно просит разрешение на перенос в preview.

## 27. Покрытие архитектуры

- Каталоги, revisions, loadouts, static editors: 1A–1B.
- Центральные channels и ownership: 2A–2B.
- FireTask, muzzle, risk, commitShot, exactly-once: 3A.
- Reload stages и interruption: 3B.
- Fixed 1/30, physical projectiles, swept collision, broad phase, benchmark: 3A–4.
- Perception lead 5 Hz, aimQuality, probability, recoil, skill factors: 5.
- Coarse body, four zones, penetration, severity, capabilities: 6.
- Bleeding, bloodLoss 1 Hz, fatigue 4 Hz, first aid: 7.
- PPSh, bursts, physical suppression и area points: 8.
- Machine gun, deploy, traverse, assistant: 9.
- Secondary, reserve caps, ground equipment, pickup: 10.
- Sound, flash, incoming fire, uncertainty: 11.
- Diagnostics/UI: 12A–12B.
- Graph v2 commands/facts: 13.
- Action ports на новом runtime: 14.
- Migration, compatibility removal и cutover: 15.
- Явные исключения v1 не реализуются.

## 28. Первый технический этап

Первым техническим этапом является **1A — чистое ядро каталогов**.

Он не меняет runtime, сцену, редактор, `UnitModel`, `SimulationState`, старую стрельбу, Graph v2 или deployment. Это узкий фундамент, который можно независимо проверить и полностью откатить.

Предлагаемая ветка:

```text
feature/20260722-shooting-stage-01a-catalog-core
```

Исполнительский промт:

```text
docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core.md
```

До явного разрешения пользователя техническая ветка не создаётся и реализация не начинается.
