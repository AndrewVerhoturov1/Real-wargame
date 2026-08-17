# Prompt исполнителю ПУЛЬС — настоящий LIVE Unit в новом Полигоне

Ты — исполнитель **ПУЛЬС**.

В начале каждого отчёта напиши:

> Я — ПУЛЬС. Отвечаю за связь нового интерфейса с живым юнитом симуляции.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база на момент подготовки handoff:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-live-unit
```

Перед работой заново получи current exact HEAD `real-wargame-preview`. Не используй этот SHA автоматически, если preview уже сдвинулся.

## Главная цель

Реализовать первый полноценный вертикальный срез нового Полигона:

```text
клик по настоящему бойцу на карте
→ настоящий unitId
→ тот же UnitModel
→ правая вкладка «Юнит» LIVE
→ штатная команда смены позы
→ simulation update/readback
→ тот же UnitModel показывает фактический результат
```

Никакой локальной UI-копии юнита и никакого второго selection store.

## Обязательные источники

Прочитай:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `src/core/simulation/SimulationState.ts`;
- `src/core/units/UnitModel.ts`;
- `src/input/BoardInputController.ts`;
- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- canonical posture/command path, подтверждённый контрактом ПУЛЬСА;
- `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
- `src/combat-lab/main.ts`.

Также изучи уже существующую ветку:

```text
feature/20260816-polygon-live-unit-complete
known head at planning time: adb900a3d43658f42f26d622b009d78886e4c3c8
```

Она **не является разрешённой базой и не должна вливаться целиком**. Используй её только как источник уже сделанных решений/кода после проверки diff и актуальности относительно нового preview.

## Ownership

Canonical selection на базе уже существует через `SimulationState.selectedUnitId/selectedUnitIds`, `selectUnit(...)`, `getSelectedUnit(...)` и map hit testing.

Canonical write path позы должен оставаться штатным product command path из принятого PULSE contract. Не присваивай `UnitModel` поля напрямую из UI.

## Требуемый результат

### 1. Selection

- клик по настоящему бойцу выбирает существующий `unit.id`;
- map и right panel всегда говорят об одном unitId;
- выбор A → панель A;
- выбор B → панель B;
- клик вне юнита/снятие selection корректно очищает панель;
- reset/new run не оставляет stale unit object или stale id;
- не вводить второй глобальный `selectedUnit`.

### 2. Общий right-panel seam

ПУЛЬС владеет **минимальным нейтральным seam**, через который последующие панели получают host/selection presentation, потому что сейчас right-panel hosts спрятаны внутри `CombatLabWorkspaceTabs`.

Нужно сделать стабильную продуктовую границу, достаточную для:

- получить host вкладки `unit`;
- безопасно обновить заголовок «выбранный объект»;
- при необходимости предоставить нейтральные hosts `info/attention/memory` без реализации их содержимого.

Не превращай `CombatLabWorkspaceTabs` в domain store и не помещай туда UnitModel/Attention/Memory logic.

ЛИНЗА должна потом суметь подключить свои installer/views к этому seam без второго selection mechanism.

### 3. Вкладка «Юнит» LIVE

Показывай только данные, имеющие настоящий product source.

Приоритетный объём:

- identity/label/role;
- side/type;
- текущая поза;
- текущий runtime state/action, если различие реально существует;
- мораль/стресс/подавление/состояние здоровья — только то, что реально есть в UnitModel;
- оружие/held item и доступная readiness/ammo информация — только если owner подтверждён;
- связанные authoritative profiles как linked-entity переходы там, где уже есть стабильный editor route.

Если какого-то поля принятого HTML пока нет в продукте — честно показывай unavailable/не выводи его. Не делай demo numbers.

### 4. Первое настоящее изменение — поза

UI должен позволить выбрать допустимую позу в объёме существующего продукта и провести её через canonical command path.

Проверка:

```text
UI request
→ штатная command/session boundary
→ simulation
→ UnitModel фактически изменился
→ UI читает новый UnitModel
```

Не делай optimistic UI, который считается источником истины.

### 5. Linked entity/editor переход

Если Unit panel показывает профиль/оружие как ссылку, используй существующий `GameEditorRegistry`/Combat Lab editor-open request. Не создавай новый редактор и не копируй profile data в панель.

## Явно НЕ твоя зона

Не меняй без необходимости:

- presentation карты — КАРТА;
- геометрию/LOD пешки — ПЕШКА;
- Info/Attention/Memory contents — ЛИНЗА;
- общий redesign редакторов — РЕДАКТОРЫ;
- right-click/entity context menu — КОНТЕКСТ;
- History/HISTORY, replay, persistence;
- полный Unit Editor authoring workflow.

## Параллельная работа с ЛИНЗОЙ

ЛИНЗА работает параллельно и не должна редактировать твой selection owner.

Твой результат должен дать ей маленький стабильный seam. Если ЛИНЗА заканчивает раньше, её ветка может содержать installer/views, принимающие hosts/state извне, а final hook выполняется отдельным integration commit после твоего ACCEPT.

## Проверки

Минимум:

1. selection contract smoke: A/B/clear/reset;
2. Unit LIVE read smoke;
3. posture command + readback smoke;
4. запрет direct mutation/second selection store;
5. TypeScript/noEmit;
6. production build;
7. risk-selected CI;
8. browser visual QA exact final SHA.

В browser проверить:

- выбор нескольких разных юнитов;
- снятие выбора;
- смену позы;
- reset/new run;
- collapse/open right panel;
- отсутствие stale данных после selection change.

## Критерии ACCEPT

- один настоящий selection owner;
- Unit panel читает тот же UnitModel;
- смена позы идёт штатным command path;
- UI показывает readback, а не локальное ожидание;
- нет прямых присваиваний domain fields;
- нет fake данных;
- right-panel seam нейтрален и пригоден ЛИНЗЕ;
- соседние визуальные подсистемы не переписаны;
- checks и visual QA относятся к exact final SHA.

## Возврат результата

Верни по `docs/orchestration/RESULT_TEMPLATE.md`:

```text
executor: ПУЛЬС
base_commit:
feature_branch:
current_commit:
reused_from_old_live_unit_branch:
changed_files:
checks_run:
not_checked:
right_panel_seam:
selection_owner:
write_path:
readback_path:
blockers:
next_integration_point: КАРТА + ПЕШКА + ПУЛЬС, затем ПУЛЬС + ЛИНЗА
preview_touched: no
main_touched: no
deployment_touched: no
```

Не делай merge/transfer/deployment самостоятельно.
