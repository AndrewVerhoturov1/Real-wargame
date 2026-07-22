# Этап 1A — корректирующий проход после оркестраторской проверки

## Роль

Ты — отдельный технический исполнитель корректирующего прохода этапа **1A новой системы стрелкового боя**. Это не этап 1B. Не добавляй редакторы, scene embedding или runtime.

## Репозиторий и ветка

Репозиторий:

`AndrewVerhoturov1/Real-wargame`

Обязательная базовая ветка программы:

`real-wargame-preview`

Обязательный preview SHA:

`fe0ba5f16d91bb765366c0ad56525684b3e47527`

Рабочая ветка исправления:

`feature/20260722-shooting-stage-01a-catalog-core`

Ожидаемый исходный HEAD рабочей ветки:

`a99419d5143e2814936fde3a1645a9266a4412ce`

Перед изменениями проверь удалённые refs.

Если `real-wargame-preview` отличается от обязательного SHA или рабочая ветка отличается от ожидаемого HEAD:

1. не начинай исправления;
2. зафиксируй фактические SHA;
3. сравни расхождение;
4. верни оркестратору отчёт о влиянии изменений.

Не изменяй `real-wargame-preview` и `main`. Исправления добавляй новым осмысленным коммитом в существующую рабочую ветку. Не переписывай и не force-push существующий коммит без отдельного разрешения.

## Источники истины

Прочитай:

1. `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md` из ветки `planning/20260722-shooting-system-architecture` @ `58309fd1d7c5f436d57fb1136f077afa29f53eb5`;
2. исходный промт `docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core.md` из ветки `planning/20260722-shooting-system-implementation`;
3. этот корректирующий промт.

При конфликте этот корректирующий промт уточняет только перечисленные ниже замечания и scope. Остальные требования исходного этапа 1A сохраняются.

## Решение по scope

В исходном промте был перечислен закрытый набор файлов. Исполнитель без предварительного согласования добавил пять внутренних validation-файлов. Оркестратор фиксирует это как нарушение процесса, но **ретроспективно разрешает сохранить** следующие файлы, поскольку они остаются чистыми внутренними модулями каталога:

- `src/core/infantry-combat/catalogs/CombatCatalogValidationDefinitions.ts`;
- `src/core/infantry-combat/catalogs/CombatCatalogValidationPrimitives.ts`;
- `src/core/infantry-combat/catalogs/CombatCatalogValidationReferences.ts`;
- `src/core/infantry-combat/catalogs/CombatCatalogValidationSupport.ts`.

Примечание: в отчёте этапа было заявлено пять дополнительных validation-файлов, но фактически дополнительных файлов четыре; `CombatCatalogValidation.ts` уже входил в исходный разрешённый список.

В корректирующем проходе можно изменять только 15 уже существующих файлов коммита `a99419d...`. Новые файлы не создавать. `package.json` можно менять только при необходимости корректировки трёх catalog smoke-команд.

## Блокирующее замечание 1 — опубликованные записи могут зависеть от draft

### Проблема

Текущая проверка ссылок считает любой существующий `definitionId + revision` допустимой целью независимо от `status`.

Из-за этого:

- published/archived `WeaponDefinitionV1` может ссылаться на draft-ревизию боеприпаса;
- published/archived `LoadoutTemplateV1` может ссылаться на draft-ревизию оружия;
- связанный draft затем можно заменить через `save*Draft` с сохранением номера draft revision;
- смысл уже опубликованной записи фактически меняется, хотя опубликованная ревизия должна быть неизменяемой.

### Требуемое поведение

1. Draft weapon может ссылаться на существующую draft/published/archived ammo revision, чтобы редактор мог собирать черновики.
2. Published или archived weapon может ссылаться только на published или archived ammo revision.
3. Draft loadout может ссылаться на существующую draft/published/archived weapon revision.
4. Published или archived loadout может ссылаться только на published или archived weapon revision.
5. Попытка публикации weapon/loadout с draft-зависимостью должна завершаться ошибкой до mutation.
6. После отклонённой публикации `exportJson()` должен быть побайтово равен состоянию до операции.
7. Используй устойчивые validation codes, например:
   - `unstable_ammo_reference`;
   - `unstable_weapon_reference`.

### Обязательные тесты

Добавь узкие assertions в `scripts/combat_catalog_core_smoke.ts`:

- создать ammo draft revision 2;
- создать и попытаться опубликовать weapon draft, ссылающийся на ammo draft revision 2;
- подтвердить отказ и отсутствие частичной mutation;
- опубликовать ammo revision 2;
- подтвердить, что публикация weapon после этого проходит;
- аналогично проверить loadout, ссылающийся на weapon draft;
- подтвердить, что archived exact target остаётся допустимым stable target.

Сначала получи ожидаемое падение нового assertion на текущей реализации, затем внеси минимальное исправление.

## Блокирующее замечание 2 — валидатор допускает несколько draft одного ID

### Проблема

`duplicateRevisions` запрещает только одинаковые пары `ID + revision`. Поэтому импорт может содержать две draft-записи одного definition ID с разными revisions и считаться valid.

При этом registry предполагает единственный draft:

- `publishDraft` требует ровно один draft;
- `saveDraft` использует один найденный draft и удаляет все draft-записи этого ID.

Валидатор допускает состояние, которое публичный API не может однозначно обслуживать.

### Требуемое поведение

1. Для каждого ammo/weapon/loadout definition ID допускается не более одной записи со статусом `draft`.
2. Published и archived revisions того же ID могут существовать в любом количестве при уникальных revision.
3. Import bundle с несколькими drafts одного ID должен быть invalid.
4. Validation output не должен зависеть от порядка входных массивов.
5. Используй один устойчивый code, например `multiple_drafts_for_definition`.

### Обязательные тесты

Добавь в core smoke проверку для ammo, weapon и loadout либо общую параметризованную проверку всех трёх коллекций.

Добавь в serialization smoke подтверждение, что перестановка массивов не меняет порядок/содержание issues для multiple drafts.

Сначала получи ожидаемое падение на текущей реализации.

## Блокирующее замечание 3 — wall-clock в smoke wrappers

В обоих `.mjs` используется:

```js
?run=${Date.now()}
```

Исходный промт прямо запрещает wall-clock time.

Удали зависимость от `Date.now()`. Для каждого smoke модуль импортируется один раз в отдельном Node-процессе после пересборки временного каталога, поэтому wall-clock cache busting не требуется. Используй прямой `pathToFileURL(entryFile).href` либо другой полностью детерминированный способ без случайности и времени.

Добавь проверку отсутствия `Date.now`, `performance.now`, `Math.random` и `crypto.randomUUID` во всех файлах этапа 1A.

## Неблокирующее процессное замечание

В итоговом отчёте не называй дополнительные validation-файлы «разрешёнными исходным промтом». Укажи, что они сохранены по явному scope amendment этого корректирующего промта.

## TDD

Для каждого из трёх исправлений:

1. добавь узкий assertion;
2. выполни соответствующий smoke на исходном HEAD и зафиксируй ожидаемое падение;
3. внеси минимальное исправление;
4. повтори smoke до PASS;
5. не расширяй API и не рефактори unrelated code.

## Обязательные итоговые проверки

На полном рабочем дереве с установленными зависимостями выполни:

```bash
npm run combat-catalogs:smoke
npm run typecheck
npm run build
node --check scripts/combat_catalog_core_smoke.mjs
node --check scripts/combat_catalog_serialization_smoke.mjs
git diff --check fe0ba5f16d91bb765366c0ad56525684b3e47527...HEAD
git status --short
```

Также выполни детерминированный поиск запрещённых источников:

```bash
grep -R -nE 'Date\.now|performance\.now|Math\.random|randomUUID' \
  src/core/infantry-combat/catalogs \
  scripts/combat_catalog_core_smoke.ts \
  scripts/combat_catalog_core_smoke.mjs \
  scripts/combat_catalog_serialization_smoke.ts \
  scripts/combat_catalog_serialization_smoke.mjs
```

Ожидаемый результат grep — отсутствие совпадений.

GitHub Actions, Playwright, Chromium и deployment не запускать.

Если полного дерева или зависимостей снова нет, не заменяй общепроектные проверки частичной компиляцией и не объявляй этап готовым к приёмке. Зафиксируй инфраструктурный блокер и верни отчёт оркестратору.

## Запрещено

Не изменять:

- runtime стрельбы;
- `SimulationState`;
- `UnitModel`;
- `SceneExport`;
- `SimulationTick`;
- movement/posture/perception/geometry;
- UI и статичные редакторы;
- Graph v2;
- `src/core/combat/**`;
- workflows;
- сцены и сохранения.

Не создавать runtime, adapters или файлы этапа 1B.

## Финальный отчёт

Укажи:

1. проверенные preview SHA и исходный branch HEAD;
2. новый branch HEAD и список новых commits;
3. полный diff файлов относительно `a99419d...` и относительно `fe0ba5f...`;
4. red runs и причины падений для каждого замечания;
5. green results всех обязательных команд;
6. точные validation codes;
7. подтверждение transactional rollback;
8. подтверждение отсутствия wall-clock/randomness;
9. подтверждение, что новых файлов не создано;
10. подтверждение, что preview/main/runtime/deployment не затронуты.
