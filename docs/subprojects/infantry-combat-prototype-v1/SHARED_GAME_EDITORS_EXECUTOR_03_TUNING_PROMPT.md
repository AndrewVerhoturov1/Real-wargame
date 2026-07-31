# Исполнитель 3 — новые редакторы восприятия, архетипов и состояния бойца

## Роль

Ты — Исполнитель 3 программы объединения игровых редакторов Real-Wargame.

Твоя зона ответственности — три отсутствующих авторитетных области настройки:

1. профили восприятия;
2. архетипы бойцов;
3. профили ранений и подавления.

Ты создаёшь core contracts, browser storage adapters, immutable runtime snapshots и mountable editor definitions поверх общей платформы, уже присутствующей в Wave 2 Foundation SHA.

Ты не изменяешь общее меню, Combat Lab layout, graph editor или batch runtime.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

```text
worker/20260731-gameplay-tuning-editors
```

Создай её строго от точного Wave 2 Foundation SHA, указанного оркестратором в сообщении запуска.

До изменений:

```bash
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/feature/20260731-combat-lab-user-acceptance-fixes
```

Оба значения в момент создания ветки должны подтверждать переданный Wave 2 Foundation SHA. При несовпадении верни `BLOCKED`.

Wave 2 Foundation обязан уже содержать:

- common overlay/menu foundation;
- shared game-editor registry/workspace;
- миграцию существующих редакторов.

Если этих контрактов нет, не создавай параллельную платформу и верни `BLOCKED`.

## Обязательное чтение

Полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `.agents/skills/real-wargame-ai-runtime/SKILL.md`;
7. `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
8. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
9. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
10. shared editor contracts из Wave 2 Foundation;
11. perception runtime, attention/current-view code, contact memory and hearing code;
12. unit/soldier state types, scene serialization and existing editor-of-soldier data;
13. infantry combat Stage 6–9 hit/wound/incapacitation code;
14. suppression accumulation/decay/runtime code;
15. existing profile patterns: movement, attention, navigation, tactical positions, environment and combat catalog;
16. focused smoke scripts for perception, combat stages, suppression, serialization and storage.

Используй `superpowers:test-driven-development`. Перед готовностью используй `superpowers:verification-before-completion`.

## Главный принцип

Ни одного декоративного ползунка.

Каждое редактируемое поле обязано:

1. иметь существующего runtime consumer;
2. менять один канонический versioned profile;
3. проходить normalization/clamping;
4. попадать в immutable runtime snapshot;
5. участвовать в exact revision identity;
6. быть покрыто тестом, доказывающим влияние или совместимость.

Если желаемого параметра ещё нет в runtime, не добавляй его как неиспользуемое поле.

## Сначала составь карту параметров

До кода создай внутреннюю таблицу в отчёте или focused architecture note:

```text
editor field
existing constant/state field
current runtime consumer
new canonical profile path
revision domain
compatibility expectation
```

Если несколько констант описывают одну величину, установи единственного владельца и мигрируй всех потребителей в одном commit.

Не оставляй одновременно старую константу и новый profile value.

## 1. Профили восприятия

### Назначение

Этот редактор регулирует способность обнаруживать, уточнять и помнить контакты.

Он не дублирует `Профили внимания`:

- attention profile отвечает за распределение внимания и направления наблюдения;
- perception profile отвечает за качество сенсорного получения и сохранения информации.

### Ожидаемый core layout

Используй существующую структуру проекта. Допустимый набор focused modules:

```text
src/core/perception/PerceptionProfileTypes.ts
src/core/perception/PerceptionProfileDefaults.ts
src/core/perception/PerceptionProfileNormalization.ts
src/core/perception/PerceptionProfileRegistry.ts
src/core/perception/PerceptionProfileRuntime.ts
src/ui/PerceptionProfileStorage.ts
src/game-editors/editors/perception/PerceptionProfileEditor.ts
```

Точные имена можно согласовать с текущими conventions, но core/storage/editor границы обязательны.

### Допустимые группы полей

Включай только существующие значения runtime:

- дальность или коэффициенты визуального обнаружения;
- ближняя периферическая осведомлённость;
- влияние направления/current-view attention;
- скорость накопления уверенности;
- пороги переходов состояния контакта;
- потеря уверенности и забывание;
- неопределённость приблизительной позиции;
- отличия движущейся и неподвижной цели;
- hearing thresholds, distance falloff and event modifiers, если они уже используются;
- влияние posture, vegetation, lighting or observer condition только там, где оно уже канонически вычисляется.

Не переноси visibility geometry, LOS rasters или attention direction в profile editor.

### Runtime требования

- built-in profile воспроизводит текущие результаты;
- profile selection не зависит от выбранной вкладки;
- per-unit consumer получает frozen snapshot;
- один profile revision не инвалидирует карту целиком без необходимости;
- no localStorage in core;
- no per-frame profile reconstruction.

## 2. Архетипы бойцов

### Назначение

Архетип — reusable набор исходных характеристик и ссылок на другие профили.

Он не копирует целые route/movement/attention/perception/weapon profile objects.

### Ожидаемый контракт

Допустимые focused modules:

```text
src/core/simulation/SoldierArchetypeTypes.ts
src/core/simulation/SoldierArchetypeDefaults.ts
src/core/simulation/SoldierArchetypeNormalization.ts
src/core/simulation/SoldierArchetypeRegistry.ts
src/ui/SoldierArchetypeStorage.ts
src/game-editors/editors/soldier-archetypes/SoldierArchetypeEditor.ts
```

Если в архитектуре есть более точный каталог unit definitions, размести core contract там и объясни выбор.

### Архетип может содержать

Только существующие authoritative base fields, например:

- weapon handling/marksmanship skill, если уже используется;
- reaction/observation skill, если уже используется;
- physical preparation/stamina capacity, если уже используется;
- suppression tolerance, если уже используется;
- default graph ID;
- route profile ID;
- environment-aware movement profile ID;
- attention profile ID;
- perception profile ID;
- tactical-position profile ID;
- directional-terrain profile ID;
- weapon/loadout ID;
- wound/suppression condition profile ID.

Конкретный список определяется картой существующих runtime consumers.

### Ссылочная целостность

Normalization обязан:

- проверять существование referenced IDs;
- использовать explicit built-in fallback;
- не встраивать copies of referenced profiles;
- сохранять stable IDs across serialization;
- обеспечивать deterministic migration старых soldier definitions;
- не менять уже созданного бойца задним числом, если текущая семантика использует snapshot-at-spawn;
- либо применять narrow live revision, если это уже каноническая семантика. Выбери существующее поведение, не изобретай новое.

## 3. Профили ранений и подавления

### Назначение

Объединить редактируемые параметры уже существующих Stage 6–9 wound/incapacitation and suppression mechanics.

### Ожидаемый contract layout

Допустимый набор:

```text
src/core/combat/CombatConditionProfileTypes.ts
src/core/combat/CombatConditionProfileDefaults.ts
src/core/combat/CombatConditionProfileNormalization.ts
src/core/combat/CombatConditionProfileRegistry.ts
src/core/combat/CombatConditionProfileRuntime.ts
src/ui/CombatConditionProfileStorage.ts
src/game-editors/editors/conditions/CombatConditionProfileEditor.ts
```

Название `CombatConditionProfile` предпочтительно, если один profile действительно объединяет wounds and suppression. Если existing architecture требует два профиля, допускается разделение только при доказанном независимом ownership и без двух UI-разделов с повторяющимися полями.

### Допустимые поля

Только реально действующие параметры:

- wound severity thresholds;
- incapacitation/death boundaries, если они являются параметрами, а не неизменной физической структурой;
- penalties to movement, aiming, action timing or perception already consumed by runtime;
- suppression gain from existing event types;
- suppression thresholds/state transitions;
- suppression decay;
- existing tolerance modifiers;
- existing cancellation/continuation probabilities, если они уже каноничны и детерминированы через seed.

### Запрещённые новые механики

Не добавлять:

- bleeding over time, если его нет;
- medical treatment;
- first aid;
- morale/group panic;
- long-term recovery;
- unconsciousness simulation beyond current state machine;
- new RNG behavior without an existing deterministic contract.

## Editor panels

Все три editor definitions подключаются через shared registry из Wave 2 Foundation.

Stable IDs:

```text
perceptionProfiles
soldierArchetypes
conditionProfiles
```

Groups:

```text
perceptionProfiles → soldier
soldierArchetypes → soldier
conditionProfiles → combat
```

Panel requirements:

- list built-in/custom profiles;
- copy built-in before edit or use current repository convention;
- create/rename/delete custom profile;
- reset registry;
- import/export versioned JSON;
- explicit save/cancel or existing proven autosave convention;
- unsaved-change `beforeClose` contract;
- accessible labels and help text;
- clamp visible values using the same schema as core normalization;
- profile ID targeting through `GameEditorOpenRequest.profileId`;
- complete unsubscribe/timer teardown;
- no global DOM host query;
- no editor code in core.

## Compatibility

Built-in profiles must preserve existing representative behavior.

Add tests comparing current defaults to the new built-in profile for:

- perception contact result or deterministic fixture;
- soldier initialization fixture;
- wound/impact outcome fixture;
- suppression gain/decay fixture.

The test must compare observable state, not only constant equality.

## Performance contract

Explicitly document:

```text
hot path
worst-case complexity
profile snapshot owner
revision identity
what changes when one profile is saved
cache/queue impact
teardown
```

Required properties:

- no profile lookup through localStorage in SimulationTick;
- no full registry clone per unit per step;
- no map scan from profile save;
- immutable shared snapshot reused during a simulation cycle;
- deterministic stale-revision handling where async work consumes profile data;
- no UI-owned gameplay calculation;
- no hidden editor polling.

## Запрещено

- менять `src/shared/AppShellMenu.ts`;
- менять common overlay coordinator;
- менять Combat Lab workspace or quick parameters;
- менять Graph v2 behavior semantics;
- дублировать attention profiles;
- создавать второй environment profile editor;
- переносить profile values в DOM;
- добавлять unused future fields;
- ослаблять combat/perception tests;
- менять main/preview;
- создавать PR или deployment.

## TDD и regression tests

Сначала добавь падающие тесты.

Для каждого profile domain обязательны:

1. Versioned serialize/parse.
2. Broken payload fallback.
3. Numeric clamp and enum normalization.
4. Built-in immutability.
5. Custom copy/edit/delete behavior.
6. Semantic revision changes only when inputs change.
7. Frozen runtime snapshot.
8. Core has no DOM/storage imports.
9. Existing deterministic fixture parity.
10. Editor definition registration.
11. Explicit host mount.
12. `profileId` open targeting.
13. `beforeClose` behavior.
14. Idempotent teardown.
15. No accumulating subscription after repeated mount/destroy.

Добавь focused npm scripts для трёх доменов или один агрегирующий script с отдельными диагностическими именами.

## Проверки

Минимально выполни:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run perception:smoke
npm run perception-performance:smoke
npm run attention-profiles:smoke
npm run combat-foundation:smoke
npm run infantry-combat-stage6:verify
npm run infantry-combat-stage7:verify
npm run infantry-combat-stage8:verify
npm run infantry-combat-stage9:verify
npm run editor:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Также выполни каждый новый profile/editor smoke.

Если отдельной suppression-команды нет, используй существующие focused scripts, которые реально покрывают suppression, и перечисли их в отчёте.

## Коммиты

Предпочтительная структура:

```text
test(tuning): define authoritative profile contracts
feat(perception): add versioned perception profiles and editor
feat(soldiers): add reference-based soldier archetypes and editor
feat(combat): add wound and suppression condition profiles and editor
```

Допускаются correction commits. Не force-push после публикации.

## Формат отчёта

Верни:

```text
READY FOR ORCHESTRATOR
BLOCKED
FAIL
```

При готовности:

```text
status: READY FOR ORCHESTRATOR
wave2_foundation_sha:
branch:
previous_head:
current_head:
commits_added:
parameter_mapping:
profile_domains_added:
runtime_consumers_migrated:
legacy_constants_removed:
root_causes:
files_changed:
regression_tests_added_or_updated:
focused_checks:
typecheck:
production_build:
performance_impact:
known_remaining_issues:
deployment_created: false
acceptance_branch_touched: false
preview_branch_touched: false
main_touched: false
```

Не переносить изменения в acceptance-ветку. После push и отчёта остановись.
