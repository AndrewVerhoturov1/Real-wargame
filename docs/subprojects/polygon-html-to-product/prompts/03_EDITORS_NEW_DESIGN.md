# Prompt исполнителю РЕДАКТОРЫ — существующие редакторы в новом дизайне Полигона

Ты — исполнитель **РЕДАКТОРЫ**.

В начале каждого отчёта напиши:

> Я — РЕДАКТОРЫ. Отвечаю за перенос уже существующих продуктовых редакторов в новый интерфейс Полигона без переписывания их доменной логики.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-editors-new-design
```

Перед созданием ветки заново получи exact current HEAD `real-wargame-preview`.

## Главная цель

В новом shell АРКИ уже есть вкладки `Редактор карты`, `Редактор юнита` и верхняя кнопка `РЕДАКТОРЫ`, но значительная часть реальных editor hosts сейчас спрятана в legacy/hidden hosts либо открывается старым presentation.

Нужно **не создавать редакторы заново**, а встроить уже существующие product editors в новый дизайн Полигона и сохранить их реальные данные, registry, save/apply semantics и linked-entity маршруты.

## Важный факт

Старый `feature/20260812-polygon-global-editors` уже является предком нынешнего preview. Не пытайся повторно вливать эту ветку.

На текущей базе уже существуют:

```text
CombatLabGameEditors
CombatLabGameEditorCatalogue
CombatLabGameEditorOverlay
GameEditorRegistry
createDefaultGameEditorRegistry()
```

Default registry уже содержит, как минимум:

- Граф поведения;
- Профили маршрута;
- Тактические позиции;
- Данные бойца;
- Архетипы бойцов;
- Профили внимания;
- Профили восприятия;
- Профили движения;
- Вооружение;
- Ранения и подавление;
- Профили местности;
- Направленный рельеф.

## Обязательные источники

Прочитай:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- принятые документы Редактора карты / Редактора юнита / Global Editors, если они находятся в `polygon-prototype`;
- `src/combat-lab/main.ts`;
- `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
- `src/combat-lab/game-editors/CombatLabGameEditors.ts`;
- `src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts`;
- `src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts`;
- `src/combat-lab/game-editors/CombatLabGameEditorLinks.ts`;
- `src/game-editors/createDefaultGameEditorRegistry.ts`;
- `src/game-editors/GameEditorRegistry.ts`;
- существующие map editor/workbench modules и Unit data editor modules.

## Сначала сделай инвентаризацию

До изменения кода составь таблицу:

```text
видимый раздел нового Полигона
→ существующий editor/product owner
→ текущий mount/open path
→ что уже работает
→ что скрыто только shell-ом
→ что действительно отсутствует
```

Не считай отсутствующей функцию только потому, что её сейчас не видно в ARKA shell.

## Требуемый результат

### 1. Верхняя кнопка «РЕДАКТОРЫ»

Она должна открывать настоящий каталог общих редакторов в новом visual language.

- использовать существующий `GameEditorRegistry`;
- показывать только реальные registered definitions;
- не заводить второй список редакторов вручную;
- сохранить route/embedded semantics;
- сохранить return target/selected entity context там, где он уже поддерживается.

### 2. Новый дизайн каталога и editor overlay

Привести presentation к принятому shell:

- те же визуальные токены/типографика/границы/радиусы, что у нового Полигона;
- ясная иерархия: группы → редакторы → рабочая область;
- без старой громоздкой debug-подачи;
- responsive поведение;
- нормальные close/back/return interactions;
- отсутствие случайных перекрытий topbar/right/left panels.

Не меняй внутреннюю модель данных редакторов только ради внешнего вида.

### 3. Вкладка «Редактор карты»

Подключить существующие map editor controls/owner к новой левой вкладке.

Требование:

- работает с той же настоящей `TacticalMap/SimulationState.editor`;
- существующие инструменты выбора/рисования/размещения не дублируются;
- карта остаётся той же картой, которую показывает КАРТА;
- новый shell только предоставляет правильный host и presentation.

### 4. Вкладка «Редактор юнита»

Подключить существующий реальный editor path для данных бойца/профилей, не создавая второй UnitModel editor.

Сохраняются решения Interface Linkage v1:

- `Роль` и `Архетип бойца` — разные сущности;
- связанные профили внимания/восприятия/движения/оружие ведут в authoritative editor;
- linked entity не копируется в локальные поля UI;
- если authoring и LIVE semantics пока не разведены полностью, не выдумывать скрытую общую модель — явно сохранить текущий честный scope.

### 5. Linked entity API

Существующие переходы из Unit panel, ЛИНЗЫ и будущего КОНТЕКСТА должны иметь стабильный open path.

Не требуй, чтобы соседние исполнители кликали DOM. Используй/сохрани существующий Combat Lab editor-open request / registry contract.

### 6. Сохранить функции редакторов

Визуальная переделка не должна потерять:

- выбор сущности;
- редактирование реальных полей;
- save/apply, если они есть;
- validation;
- delete warning/usage semantics там, где они реализованы;
- return/navigation;
- authoritative registry updates.

## Явно НЕ твоя зона

Не меняй без необходимости:

- карту/terrain renderer — КАРТА;
- selection и `Юнит` LIVE — ПУЛЬС;
- Info/Attention/Memory — ЛИНЗА;
- unit symbol geometry/LOD — ПЕШКА;
- right-click input arbitration/menu — КОНТЕКСТ;
- simulation runtime только ради editor presentation.

Не добавляй новую product capability только потому, что она была нарисована в HTML.

## Параллельная граница с КОНТЕКСТОМ

КОНТЕКСТ должен открывать редакторы через стабильный editor-open API. Поэтому:

- не ломай `COMBAT_LAB_OPEN_GAME_EDITOR_EVENT`/registry route без миграции;
- если вводишь новый нейтральный open helper, сохрани совместимость или дай маленький adapter;
- опиши точный способ внешнего вызова editor в handoff.

## Проверки

Минимум:

1. inventory smoke: registry definitions не потеряны;
2. open каждый registered embedded editor из нового каталога;
3. route editor (например behavior graph) сохраняет корректную навигацию;
4. Map Editor работает с реальной картой;
5. Unit Editor/Data editor открывается с реальной сущностью/профилями;
6. TypeScript/noEmit;
7. production build;
8. risk-selected CI;
9. browser/screenshot QA exact final SHA.

Визуально проверить минимум:

- `РЕДАКТОРЫ` catalogue;
- 2–3 embedded editor разных групп;
- Map Editor tab;
- Unit Editor tab;
- narrow/desktop layout;
- close/return.

## Критерии ACCEPT

- существующие editors переиспользованы, а не скопированы;
- registry остаётся единственным каталогом;
- новый shell показывает реальный Map Editor и Unit Editor;
- общие редакторы имеют новый presentation;
- функции редакторов не потеряны;
- linked-entity open path стабилен для ПУЛЬСА/ЛИНЗЫ/КОНТЕКСТА;
- нет параллельных profile stores;
- browser QA выполнена по exact final SHA.

## Возврат результата

Верни:

```text
executor: РЕДАКТОРЫ
base_commit:
feature_branch:
current_commit:
editor_inventory:
changed_files:
checks_run:
not_checked:
editor_open_api:
map_editor_status:
unit_editor_status:
visual_qa:
blockers:
next_integration_point: РЕДАКТОРЫ + КОНТЕКСТ
preview_touched: no
main_touched: no
deployment_touched: no
```

Не выполняй merge/transfer/deployment самостоятельно.
