# Prompt исполнителю КОНТЕКСТ — единое контекстное меню сущностей в новом дизайне

Ты — исполнитель **КОНТЕКСТ**.

В начале каждого отчёта напиши:

> Я — КОНТЕКСТ. Отвечаю за единое контекстное меню сущностей и безопасную маршрутизацию действий из карты.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-entity-context-menu
```

Перед созданием ветки заново получи exact current HEAD `real-wargame-preview`.

## Главная цель

Сделать в новом дизайне Полигона **единое контекстное меню сущности**, которое вызывается непосредственно из карты и помогает перейти к информации, редактору или уже существующему действию над выбранной сущностью.

Это не просто декоративное меню по правой кнопке. Оно должно стать общим presentation/router-механизмом для настоящих сущностей, не создавая новый domain owner.

Первая обязательная область — сущности карты:

- настоящий `UnitModel`;
- настоящий map object;
- при необходимости точка/клетка карты как отдельный context target без создания fake entity.

## Критическое ограничение: правая кнопка уже занята

На текущей базе secondary-button input уже используется для боевого управления:

- `TacticalOrderRadialInput` — hold/gesture, quick move, radial tactical orders;
- `BoardInputController` — existing right-click/right-drag move/facing path;
- `MapInputOwnership` уже используется для arbitration разных input owners.

Нельзя просто добавить `contextmenu` listener и забрать всю правую кнопку.

## Обязательные источники

Прочитай:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `src/input/BoardInputController.ts`;
- `src/input/TacticalOrderRadialInput.ts`;
- `src/input/MapInputOwnership.ts`;
- unit/map-object hit testing APIs;
- `src/combat-lab/game-editors/CombatLabGameEditorLinks.ts`;
- `src/game-editors/GameEditorRegistry.ts`;
- right-panel navigation/seam после/из ПУЛЬСА, если он уже доступен на текущей базе.

## Сначала зафиксируй arbitration contract

До implementation опиши таблицу:

```text
pointer target
+ gesture
+ current mode
→ owner
→ action
```

Минимальный ожидаемый UX-контракт:

### По настоящей сущности

Короткое secondary-click взаимодействие непосредственно по entity target открывает entity context menu и **не выдаёт move order в ту же точку**.

### По пустой земле

Существующий quick move / right-drag facing / hold-radial tactical order сохраняется.

### Hold / drag

Существующие tactical-order gestures не должны случайно превращаться в entity menu из-за маленького движения указателя или порядка listeners.

Если после исследования текущей gesture model безопаснее использовать другой минимальный trigger для entity menu, допустимо выбрать его, но нельзя ломать текущий right-button combat flow. Решение обязательно зафиксировать в handoff и тестах.

## Требуемый результат

### 1. Общий target descriptor

Menu получает реальную identity сущности, например:

```text
kind: unit | map-object | map-point
id / stable identity
world/grid anchor
optional display label
```

Descriptor — presentation/router data. Не копируй туда mutable gameplay state как новый store.

### 2. Меню бойца

Минимально полезные действия:

- выбрать этого бойца / сфокусировать существующий selection;
- открыть правую вкладку `Юнит`;
- открыть `Внимание`;
- открыть `Память`;
- открыть authoritative editor/профиль через существующий editor-open route там, где это имеет смысл;
- другие действия только если они уже существуют как canonical product command.

Не добавлять fake команды ради заполнения меню.

### 3. Меню map object

Минимально:

- показать/открыть `Инфо` по объекту/точке;
- открыть связанный настоящий editor, если для типа объекта уже есть штатный edit path;
- удалить/изменить объект только если это уже разрешённый editor action и текущий режим допускает его.

В LIVE режиме не превращать context menu в обход editor/write boundaries.

### 4. Меню точки карты

Если target не entity, допустим компактный map-point context:

- `Инфо` / закрепить Info point;
- существующие команды карты только через canonical command API.

Не создавать сущность «точка» в simulation только ради меню.

### 5. Новый дизайн

Меню должно визуально принадлежать ARKA shell:

- компактное;
- чёткая иерархия group/action;
- без browser-native context menu;
- viewport clamping у краёв экрана;
- keyboard/Escape/outside-click close;
- не закрываться мгновенно из-за того же pointer event;
- поддерживать disabled/unavailable state;
- не перекрывать критически right panel/topbar.

### 6. Linked entity routing

Используй уже существующие механизмы:

- selection API ПУЛЬСА;
- right-panel seam ПУЛЬСА;
- editor-open API РЕДАКТОРОВ;
- Info/Attention/Memory views ЛИНЗЫ.

Если соседний seam ещё не принят, делай action adapters через явные injected callbacks/events с документированным контрактом. Не query случайные DOM nodes как постоянную архитектуру.

## Явно НЕ твоя зона

Не реализуй заново:

- tactical order semantics;
- movement/pathfinding;
- attention commands;
- Unit editor logic;
- Info/Memory computation;
- unit selection store;
- map renderer;
- unit renderer.

Контекстное меню маршрутизирует к owners, а не становится owner.

## Проверки

Минимум:

1. hit target: unit/map-object/empty map;
2. short entity secondary click открывает menu и не выдаёт move order;
3. empty-ground quick move сохраняется;
4. right-drag facing сохраняется;
5. hold/radial tactical order сохраняется;
6. input lease/arbitration teardown;
7. Escape/outside click/selection change close;
8. editor-open/right-panel actions идут через утверждённые APIs;
9. TypeScript/noEmit;
10. production build;
11. browser/screenshot QA exact final SHA.

Обязательно проверить режимы:

- entity под курсором + selected units есть;
- entity под курсором + selection отсутствует;
- пустая земля + selection есть;
- editor mode;
- AI Lab/open special mode, если он влияет на input ownership.

## Performance

Context hit testing не должен делать тяжёлый полный world scan на каждый pointer move. Используй уже имеющиеся локальные/hit-test механизмы или bounded query.

Menu не должен создавать recurring ticker/polling, если достаточно событий selection/input.

## Критерии ACCEPT

- entity menu существует как единый механизм;
- реальный target identity не копируется в новый domain store;
- existing tactical right-button controls не потеряны;
- action routing использует owners/editor/right-panel APIs;
- новый visual style совместим с ARKA;
- меню корректно закрывается и не течёт по listeners;
- tests доказывают arbitration, а не только snapshot DOM;
- visual QA привязана к exact final SHA.

## Возврат результата

Верни:

```text
executor: КОНТЕКСТ
base_commit:
feature_branch:
current_commit:
input_arbitration_contract:
context_targets_supported:
actions_supported:
changed_files:
checks_run:
not_checked:
performance_impact:
visual_qa:
blockers:
next_integration_point: РЕДАКТОРЫ + КОНТЕКСТ + ПУЛЬС/ЛИНЗА navigation
preview_touched: no
main_touched: no
deployment_touched: no
```

Не делай merge/transfer/deployment самостоятельно.
