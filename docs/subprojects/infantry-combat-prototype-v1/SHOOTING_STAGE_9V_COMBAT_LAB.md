# Stage 9V — приложение «Испытательный полигон»

## Назначение

Stage 9V добавляет третий режим репозитория для ручной и детерминированной проверки стрелковой системы Stage 3–9.

Страницы проекта:

- игра: `/index.html` или `/`;
- редактор ИИ: `/ai-node-editor.html`;
- испытательный полигон: `/combat-lab.html`.

Все три режима имеют общий переключатель `AppShellMenu`. Текущий режим отмечается `aria-current="page"`; переход выполняется в текущей вкладке.

Combat Lab имеет собственные HTML, точку входа, раскладку, сценарный пульт, visual session и headless runner. При этом центральное поле **не является отдельной упрощённой графической реализацией**: оно использует производственный `PixiTacticalBoardApp`, ту же камеру, карту, бойцов, приказы, HTML-подписи и общие игровые слои, что обычная игра.

Отдельный режим не создаёт отдельную физику. Все изменения боевого состояния проходят через производственные команды и общий `SimulationTick`.

## Архитектура отображения

### Производственный tactical board

`CombatLabRenderer` является совместимым фасадом для лабораторного UI, но не создаёт PixiJS `Application`. Он:

1. создаёт `PixiTacticalBoardApp`;
2. подключает к его `worldContainer` штатные combat effects и attention/tactical overlays;
3. использует тот же Pixi ticker для fixed-step продвижения `CombatLabVisualSession`;
4. добавляет только лабораторный `CombatLabDiagnosticOverlayRenderer`;
5. при смене сценария перепривязывает board, input controller и state-bound services к новому `SimulationState`.

`PixiTacticalBoardAdapter` изолирует узкое знание о внутренних полях board. Этот подход соответствует уже существующим installer-модулям production renderer и не изменяет hot path обычной игры.

В Combat Lab отсутствуют:

- второй PixiJS `Application`;
- второй canvas renderer карты;
- собственная камера;
- повторная отрисовка обычных бойцов;
- отдельный игровой ticker;
- iframe с другой симуляцией.

### Общие игровые слои

Полигон использует штатные renderer-ы:

- terrain, высоты, лес и объекты карты;
- юниты, позы, оружие и выделение;
- приказы и маршруты;
- route-cost overlay;
- awareness heatmap;
- view cones;
- pressure/visibility/editor overlays;
- cover direction и threat editor;
- tactical positions и attention;
- обычные боевые эффекты;
- HTML-подписи бойцов и объектов.

Компактная панель под картой управляет существующими `state.editor.layers`, сеткой, конусами обзора и подписями высот. Это не отдельная система флагов.

### Лабораторный диагностический overlay

`CombatLabDiagnosticOverlayRenderer` рисует только дополнительную диагностику:

- активные физические пули;
- короткую ограниченную историю траекторий;
- impacts и последнюю зону попадания;
- направление прицеливания и фактическую точку цели;
- сектор и якорь установленного ДП-27;
- события подавления;
- контрольные расстояния;
- стабильные идентификаторы участников.

История траекторий ограничена 4096 точками, impacts — ограниченным хвостом. Overlay не сканирует карту и не является источником игровой истины.

## Точки входа

- `combat-lab.html` — самостоятельная Vite-страница;
- `src/combat-lab/main.ts` — меню режимов, создание сессии, раскладки и production board;
- `src/combat-lab/ui/CombatLabShell.ts` — русские элементы управления и диагностика;
- `src/combat-lab/rendering/CombatLabRenderer.ts` — lifecycle production board и state-bound installers;
- `src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts` — только лабораторная диагностика;
- `src/rendering/PixiTacticalBoardAdapter.ts` — узкая перепривязка общего board к новому состоянию;
- `src/combat-lab/runtime/CombatLabVisualSession.ts` — пауза, одиночный шаг, скорость, интерактивность и контрольная точка;
- `src/core/testing/combat-lab/` — чистые определения сценариев, фабрики, команды, метрики, сводки и headless single-run.

## Контракт сценария

`CombatLabScenarioDefinitionV1` содержит:

- `schemaVersion`;
- стабильный `scenarioId` и `revision`;
- русские название и описание;
- `defaultSeed`;
- ссылку `stateFactoryId` на чистую фабрику состояния;
- явное условие остановки;
- поддерживаемые метрики;
- визуальный набор слоёв;
- стабильные роли участников;
- контрольные расстояния;
- шаги ручной проверки;
- необязательную детерминированную программу команд.

Один `scenarioId@revision` имеет одну фабрику начального `SimulationState`. Headless и visual используют `buildCombatLabInitialState`; отдельных математической и визуальной сцен нет. Сценарии не содержат DOM, PixiJS и ссылок на визуальные объекты. Случайность задаётся только явным `seed`.

## Headless single-run

`runCombatLabScenario(request)`:

1. проверяет версию запроса, ревизию, seed и предел времени;
2. создаёт состояние общей фабрикой;
3. применяет сценарные действия через производственный адаптер;
4. двигает систему только общим `tickSimulation` с фиксированным шагом;
5. останавливается по условию или пределу времени;
6. возвращает компактные метрики, `eventDigest` и `finalStateDigest`.

Модуль не импортирует DOM, PixiJS, браузерные таймеры или оболочку приложения.

## Visual session

`CombatLabVisualSession` создаёт то же состояние с тем же seed и использует тот же канонический шаг.

Доступны:

- пауза;
- один шаг;
- скорости ×0,25, ×0,5, ×1, ×2, ×4 и ×8;
- рекомендуемая программа стенда;
- явные команды пользователя;
- один слот контрольного сохранения.

Board всегда получает `state.paused = true`, поэтому его обычный simulation tick не продвигает лабораторное состояние. Дополнительный listener того же Pixi ticker вызывает `session.advance(realDeltaSeconds)`, после чего production board отображает уже обновлённое состояние. Второго ticker нет.

До первой команды пользователя visual run считается чистым. Любое ручное воздействие вызывает `markInteractive()`; такой прогон нельзя выдавать за чистый статистический результат.

## Замена сценария

`startNewRun` создаёт новый `SimulationState`. При следующем `forceRender` или кадре фасад:

1. уничтожает combat/attention/adaptive-grid/awareness/tactical-position services старого состояния;
2. устанавливает movement/environment providers нового состояния;
3. присваивает новый state production board и `BoardInputController`;
4. инвалидирует map cache и очищает view cones;
5. перепривязывает лабораторный overlay и очищает его историю;
6. пересоздаёт state-bound services и переключатели общих слоёв.

Canvas, Pixi Application и камера при этом не пересоздаются.

## Производственные команды

Полигон не меняет боевые поля напрямую. Адаптер использует:

- огонь — `requestFireTask` и `cancelSingleFireTask`;
- позу — `requestPlayerPostureTransition`;
- движение — существующий путь приказа движения;
- перезарядку — `requestReloadWeapon`;
- установку и снятие ДП-27 — `requestDeployWeapon` / `requestUndeployWeapon`;
- помощника — только явно выбранный `unitId`;
- передачу патронов — `requestAmmoTransfer`;
- первую помощь — `requestApplyFirstAidAction`;
- отмену — опубликованные функции отмены конкретных действий.

Полигон не создаёт пулю, попадание, ранение или подавление напрямую.

## Каталог стендов

- `rifle-distance-baseline` — винтовка, неподвижные цели 25/50/100/200 м;
- `rifle-moving-target` — винтовка и физически движущаяся цель;
- `ppsh-burst-recoil` — ППШ, очереди, темп, отдача и подавление;
- `dp27-portable-deployed` — переносной/deployed ДП-27, якорь и сектор;
- `dp27-assistant-ammo` — явный помощник, ускорение и передача патронов;
- `wounds-first-aid` — ранения четырёх зон, кровь и двухстадийная помощь;
- `suppression-events` — near miss, near impact и direct hit;
- `combat-save-load-boundaries` — сохранение посреди действий Stage 3–9.

## Метрики

Метрики включают выстрелы, расход боеприпасов, пули, hits/misses, ранения, подавление, длительности действий, reload/deploy, передачу патронов, потерянную кровь, первую помощь и состояние ограниченных буферов. Они читаются только из production events/state; визуальные объекты не являются источником данных.

## Контрольное сохранение

Один временный слот хранит канонический payload `buildExportedScene`, scenario ID/revision, seed, время симуляции и interactive-флаг. Восстановление использует штатную нормализацию сцены, `replaceSceneAtRuntimeResolution`, восстановление projectile runtime и reconciliation infantry combat. Простое копирование `SimulationState` не используется. Визуальная история после восстановления очищается.

## Производительность

- одна production Pixi Application;
- один Pixi ticker;
- одна камера;
- revision-driven map cache;
- один проход по бойцам для лабораторной диагностики;
- проход по активным пулям только при включённом слое;
- bounded trails и impacts;
- без полного прохода карты на пулю;
- без второго spatial index;
- смена сценария находится вне hot path.

Обычная игра не получает лабораторной фоновой работы: Combat Lab entry загружается только из `/combat-lab.html`. Изменение общей навигации не запускает симуляционные сервисы других режимов.

## Проверки

Архитектура защищена:

- `scripts/combat_lab_shared_renderer_contract_smoke.mjs`;
- `scripts/combat_lab_ui_contract_smoke.mjs`;
- обязательным включением shared-renderer contract в `verify:preview`;
- TypeScript;
- production Vite build;
- сценарными и runner smoke-проверками;
- Stage 9 verification;
- deployment pages smoke для всех трёх HTML и `deployment-source.json`.

## Что Stage 9V не реализует

- Stage 10 и последующие этапы;
- secondary weapon, ground equipment, pickup/replace;
- скрытый выбор цели или помощника;
- Graph v2 action ports для боевых действий;
- изменение коэффициентов Stage 3–9;
- массовый пакетный интерфейс и оптимизатор;
- worker pool и базу результатов;
- запись видео.

## Ручная проверка

1. Открыть `/combat-lab.html` из exact-SHA production preview.
2. Убедиться, что карта, бойцы, камера и общие слои совпадают с обычной игрой.
3. Проверить переходы Игра / Редактор ИИ / Испытательный полигон на всех трёх страницах.
4. На каждом стенде проверить scenario ID, revision, seed и clean/interactive режим.
5. Выполнить указанные ручные шаги и проверить причины отказов, журнал, пули, impacts, ранения, кровь, подавление и оружейные действия.
6. Сохранить контрольную точку посреди каждого важного действия, продвинуть время, восстановить и убедиться в ровно одном продолжении.
7. Проверить 1440×900, прокрутку панелей, toolbar общих слоёв и отсутствие перекрытия карты.

Факт ручной проверки владельцем фиксируется отдельно. Наличие страницы и автоматические проверки не означают, что визуальная калибровка уже принята.