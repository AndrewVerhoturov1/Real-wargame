# Stage 9V — приложение «Испытательный полигон»

## Назначение

Stage 9V добавляет третий режим репозитория для ручной и детерминированной проверки стрелковой системы Stage 3–9.

Страницы проекта:

- игра: `/index.html` или `/`;
- редактор ИИ: `/ai-node-editor.html`;
- испытательный полигон: `/combat-lab.html`.

Все три режима используют общий `AppShellMenu`. Текущий режим отмечается `aria-current="page"`; переход выполняется в текущей вкладке.

Combat Lab не является отдельным упрощённым визуальным приложением. Он запускает **полный игровой режим**, а лабораторные инструменты подключаются поверх него как расширение.

## Главный архитектурный принцип

Обычная игра и Combat Lab используют один `GameApplication` из `src/game/GameApplication.ts`.

`GameApplication` владеет полным игровым bootstrap:

- `PixiTacticalBoardApp`;
- картой, камерой и одним Pixi ticker;
- AI game bridge;
- game editor workbench;
- HUD и верхними переключателями;
- тактическим workspace;
- combat controls;
- attention profile/runtime UI;
- command-plan-route UI;
- route-cost overlay UI;
- словарём ИИ;
- front-zone controls;
- scene export;
- performance report;
- radial input;
- awareness/tactical-position services;
- combat, attention и adaptive-grid renderers;
- всеми подписками и teardown.

`src/main.ts` и `src/combat-lab/main.ts` являются тонкими точками входа. Они создают разное начальное состояние и передают режимные параметры, но не дублируют список игровых installer-ов.

## Полный игровой интерфейс Combat Lab

`combat-lab.html` содержит тот же обязательный игровой DOM-каркас, что `index.html`:

- `#app`;
- `#hud`;
- `#language-toggle`;
- `#grid-toggle`;
- `#vision-toggle`;
- `#height-toggle`;
- `#pause-toggle`;
- `#ai-editor-open`;
- `#debug-panel`.

Дополнительно присутствует только `#combat-lab-extension-root`.

Поэтому Combat Lab получает без отдельного переноса:

- производственную карту и все terrain/object renderer-ы;
- игровой HUD;
- правый инспектор и вкладки workspace;
- редактор карты;
- выбор бойцов и штатные команды;
- маршруты, route-cost, danger, stealth и visibility layers;
- tactical positions;
- attention и perception UI;
- штатные боевые эффекты;
- HTML-подписи и масштаб карты;
- scene export и performance diagnostics.

Если лабораторную панель скрыть, остаётся полный интерфейс обычной игры, работающий с лабораторным сценарием.

## `CombatLabExtension`

`src/combat-lab/CombatLabExtension.ts` подключается через `GameApplicationOptions.installExtension`.

Расширение:

1. монтирует сворачиваемый drawer в `#combat-lab-extension-root`;
2. сохраняет существующий сценарный пульт `CombatLabShell`;
3. создаёт только лабораторный diagnostic overlay;
4. подключает fixed-step visual session к существующему Pixi ticker;
5. обновляет метрики, журнал и лабораторные controls;
6. при смене сценария просит общий `GameApplication` пересоздать state-bound services.

Расширение не создаёт собственные:

- Pixi Application;
- canvas;
- camera;
- map renderer;
- unit renderer;
- combat effects renderer;
- attention renderer;
- adaptive grid;
- awareness worker;
- tactical-position service;
- игровой HUD или workspace.

## Лабораторный renderer

`CombatLabRenderer` сохранён как совместимый фасад для `CombatLabShell`, но больше не является владельцем экрана.

Он использует `GameApplicationContext`:

- `getWorldContainer()` — для `CombatLabDiagnosticOverlayRenderer`;
- `addTickerListener()` — для fixed-step visual session;
- `restartStateBoundServices()` — после смены сценария или восстановления checkpoint;
- `forceRender()` — для обновления общего production board.

Таким образом, renderer отвечает только за лабораторную диагностику и синхронизацию visual session с уже работающей игрой.

## Стабильная идентичность состояния

Все installer-ы полного игрового режима получают один объект `SimulationState` и сохраняют ссылку на него.

Поэтому `CombatLabVisualSession.startNewRun()` не заменяет объект состояния. Он:

1. строит новое чистое состояние через общую фабрику сценария;
2. переносит его содержимое функцией `replaceCombatLabStateInPlace`;
3. сохраняет прежнюю ссылку `session.state`;
4. увеличивает revision visual session;
5. сбрасывает метрики, программу, интерактивность, журнал и checkpoint.

После изменения revision лабораторный фасад:

1. удерживает production simulation tick в состоянии паузы;
2. уничтожает старые awareness/tactical-position/render state-bound services;
3. устанавливает providers и services для нового содержимого состояния;
4. перепривязывает и очищает laboratory overlay;
5. принудительно обновляет общий board.

Canvas, camera, HUD, workspace и installer-ы игрового UI не пересоздаются.

## Время и пауза

Обычная игра использует стандартный pause controller, изменяющий `state.paused`.

Combat Lab передаёт собственный `GamePauseController`, связанный с `CombatLabVisualSession`.

При этом production board всегда получает `state.paused = true`, поэтому его обычный `tickSimulation` не продвигает лабораторное время. Listener того же Pixi ticker вызывает `session.advance(realDeltaSeconds)` с каноническим fixed step.

Доступны:

- пауза и продолжение;
- один шаг;
- скорости ×0,25, ×0,5, ×1, ×2, ×4 и ×8;
- рекомендуемая программа стенда;
- явные команды пользователя;
- один временный checkpoint.

Второго ticker нет.

## Диагностический overlay

`CombatLabDiagnosticOverlayRenderer` рисует только дополнительную диагностику:

- активные физические пули;
- короткую ограниченную историю траекторий;
- impacts и последнюю зону попадания;
- направление прицеливания и фактическую точку цели;
- сектор и якорь установленного ДП-27;
- события подавления;
- контрольные расстояния;
- стабильные идентификаторы участников.

История траекторий ограничена 4096 точками. Overlay не сканирует карту и не является источником игровой истины.

## Контракт сценария

`CombatLabScenarioDefinitionV1` содержит:

- `schemaVersion`;
- стабильный `scenarioId` и `revision`;
- русские название и описание;
- `defaultSeed`;
- ссылку на чистую фабрику состояния;
- условие остановки;
- поддерживаемые метрики;
- визуальный набор лабораторных слоёв;
- стабильные роли участников;
- контрольные расстояния;
- шаги ручной проверки;
- необязательную детерминированную программу команд.

Visual и headless используют одну `buildCombatLabInitialState`. Сценарии не содержат DOM, PixiJS или визуальные объекты. Случайность задаётся только явным seed.

## Headless single-run

`runCombatLabScenario(request)`:

1. проверяет версию, revision, seed и предел времени;
2. создаёт состояние общей фабрикой;
3. применяет действия через production command adapter;
4. двигает систему только `tickSimulation` с фиксированным шагом;
5. возвращает метрики, `eventDigest` и `finalStateDigest`.

Headless core не импортирует DOM, PixiJS, браузерные таймеры или `GameApplication`.

## Производственные команды

Полигон не меняет боевые поля напрямую. Используются:

- `requestFireTask` и `cancelSingleFireTask`;
- `requestPlayerPostureTransition`;
- существующий путь приказа движения;
- `requestReloadWeapon`;
- `requestDeployWeapon` / `requestUndeployWeapon`;
- явный помощник по `unitId`;
- `requestAmmoTransfer`;
- `requestApplyFirstAidAction`;
- опубликованные функции отмены конкретных действий.

Полигон не создаёт пулю, попадание, ранение или подавление напрямую.

## Каталог стендов

- `rifle-distance-baseline`;
- `rifle-moving-target`;
- `ppsh-burst-recoil`;
- `dp27-portable-deployed`;
- `dp27-assistant-ammo`;
- `wounds-first-aid`;
- `suppression-events`;
- `combat-save-load-boundaries`.

## Производительность

- одна production Pixi Application;
- один canvas;
- один Pixi ticker;
- одна camera;
- полный game UI устанавливается один раз;
- смена сценария находится вне frame hot path;
- bounded trails, impacts и journal;
- обычная игра не импортирует `CombatLabExtension`;
- headless core остаётся browser-free.

## Проверки

Архитектуру защищают:

- `scripts/combat_lab_full_game_contract_smoke.mjs`;
- `scripts/combat_lab_shared_renderer_contract_smoke.mjs`;
- `scripts/combat_lab_contract_smoke.mjs`;
- `scripts/combat_lab_ui_contract_smoke.mjs`;
- `scripts/combat_lab_scenarios_smoke.mjs`;
- `scripts/combat_lab_runner_smoke.mjs`;
- обязательное включение full-game и shared-renderer contracts в `verify:preview`;
- TypeScript и production Vite build всех трёх страниц.

Ключевые инварианты:

- `/` и `/combat-lab.html` вызывают `GameApplication.create`;
- Combat Lab не вызывает `PixiTacticalBoardApp.create` напрямую;
- полный список игровых installer-ов находится только в `GameApplication`;
- смена сценария сохраняет идентичность `SimulationState`;
- diagnostic extension использует существующие world container и ticker;
- headless runner остаётся детерминированным и DOM/Pixi-free.
