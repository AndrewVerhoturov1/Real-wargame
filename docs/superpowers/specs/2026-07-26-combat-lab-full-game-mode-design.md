# Combat Lab как полный игровой режим — проектное решение

Дата: 2026-07-26

## Контекст

Текущая версия Combat Lab использует производственный `PixiTacticalBoardApp`, но запускает собственный `CombatLabShell` и вручную подключает только часть систем игры. Поэтому карта и базовая графика совпадают с игрой, а HUD, тактический workspace, инспекторы, редактор карты, combat controls, route-cost UI, scene export, профили внимания и остальные установщики из `src/main.ts` отсутствуют.

Требуется изменить направление зависимости: Combat Lab должен запускать полный игровой bootstrap, а лабораторные инструменты должны подключаться к нему как расширение режима.

## Цели

1. `/` и `/combat-lab.html` используют одну функцию создания игрового приложения.
2. Combat Lab получает тот же HTML-каркас, CSS, HUD, правый инспектор, тактический workspace, editor workbench, game controls, overlays и input-системы, что обычная игра.
3. Лабораторные сценарии, fixed-step session, headless runner, метрики, журнал, checkpoint и диагностический overlay сохраняются.
4. Лабораторное состояние не загружает и не перезаписывает обычную сцену игры.
5. Смена сценария не пересоздаёт страницу и не оставляет старые state-bound сервисы.
6. Если лабораторную панель скрыть, вид и управление должны совпадать с обычным игровым режимом.

## Не цели

- изменение физики Stage 3–9;
- слияние ветки в `real-wargame-preview` или `main`;
- iframe;
- второй Pixi Application, canvas, camera или simulation ticker;
- ручное дублирование списка установщиков между игрой и лабораторией;
- использование обычной стартовой сцены в лаборатории.

## Выбранная архитектура

### 1. Общий `GameApplication`

Весь bootstrap из `src/main.ts` переносится в `src/game/GameApplication.ts`.

Он владеет:

- подготовкой `SimulationState`;
- `AwarenessWorldRuntime` и `TacticalPositionSearchService`;
- `PixiTacticalBoardApp`;
- AI game bridge;
- всеми UI installer-ами, которые сейчас вызываются в `src/main.ts`;
- подписками movement/environment profile registries;
- combat/attention/adaptive-grid renderers;
- radial input;
- единым teardown.

`src/main.ts` остаётся тонкой точкой входа: импортирует игровые стили и тестовые данные, создаёт обычный state и вызывает `GameApplication.create`.

### 2. Полный HTML-каркас игры в Combat Lab

`combat-lab.html` использует те же обязательные элементы, что `index.html`:

- `#app`;
- `#hud`;
- `#language-toggle`;
- `#grid-toggle`;
- `#vision-toggle`;
- `#height-toggle`;
- `#pause-toggle`;
- `#ai-editor-open`;
- `#debug-panel`.

Дополнительно присутствует только `#combat-lab-extension-root`. Лабораторные панели не заменяют HUD и workspace игры, а располагаются как подключаемый drawer/overlay.

### 3. Режимные параметры приложения

`GameApplication.create` принимает:

```ts
export interface GameApplicationOptions {
  readonly mode: 'game' | 'combat-lab';
  readonly state: SimulationState;
  readonly elements: GameApplicationElements;
  readonly pauseController?: GamePauseController;
  readonly installExtension?: (context: GameApplicationContext) => GameApplicationExtension | Promise<GameApplicationExtension>;
}
```

`GameApplicationContext` предоставляет текущий `state`, `board`, `forceRender`, `restartStateBoundServices` и подписку на кадр существующего Pixi ticker.

По умолчанию pause controller читает и меняет `state.paused`. Combat Lab передаёт контроллер, связанный с `CombatLabVisualSession`, при этом `state.paused` всегда остаётся `true`, чтобы штатный board tick не продвигал лабораторное время.

### 4. Стабильная идентичность состояния

Все игровые installer-ы получают один объект `SimulationState` и сохраняют ссылку на него. Поэтому смена лабораторного сценария не заменяет сам объект state.

`CombatLabVisualSession.startNewRun` строит новое состояние, затем переносит его поля в существующий объект через `replaceCombatLabStateInPlace(target, source)`. Ссылка `session.state` остаётся прежней.

После переноса Combat Lab вызывает `context.restartStateBoundServices()`. Этот метод пересоздаёт только сервисы, зависящие от карты/состояния, но не повторно устанавливает весь UI и не пересоздаёт board.

### 5. Лабораторное расширение

`CombatLabExtension` заменяет роль главного `CombatLabShell`.

Оно:

- монтирует лабораторный drawer в `#combat-lab-extension-root`;
- создаёт `CombatLabDiagnosticOverlayRenderer` в production world container;
- подключает fixed-step `session.advance` к существующему Pixi ticker;
- предоставляет сценарий, seed, pause/step/speed, команды, метрики, журнал и checkpoint;
- после нового run вызывает in-place state replacement и restart state-bound services;
- не создаёт карту, HUD, inspector, workspace или обычные game controls.

Старый трёхколоночный `CombatLabShell` и его собственный layout удаляются.

### 6. Полный набор игровых систем

Оба режима получают один и тот же набор installer-ов:

- `installGameEditorWorkbench`;
- `installAttentionProfileControls`;
- `installSceneExportControls`;
- `installPerformanceReportControls`;
- `installTacticalWorkspace`;
- `installCombatControls`;
- `installAttentionRuntimePanel`;
- `installCommandPlanRouteUi`;
- `installRouteCostOverlayUi`;
- `installAiDictionaryGameIntegration`;
- `installFrontZoneControls`;
- `installEditorHeaderPlacement`;
- `installWorkspaceTooltipGuard`;
- visual QA/performance harnesses;
- common render/input installers.

Отличается только источник начального состояния, pause controller и подключённое расширение.

### 7. Навигация и изоляция

`AppShellMenu` остаётся общим. Combat Lab не использует обычные тестовые JSON-сцену и units. Обычная игра не импортирует laboratory runtime.

Scene export в Combat Lab экспортирует только текущую лабораторную сцену. Новый run создаётся только через scenario registry. Никакой автоматической загрузки browser save игры не добавляется.

## Поток данных

```text
combat-lab.html
  -> CombatLabVisualSession (scenario state)
  -> GameApplication.create(full game bootstrap)
  -> CombatLabExtension(context)
     -> existing Pixi ticker -> session.advance
     -> laboratory controls -> production command adapter
     -> new run -> replace state in place -> restart state-bound services
     -> diagnostic overlay in production world container
```

## Ошибки и teardown

- Отсутствующие DOM-элементы приводят к явной startup-ошибке.
- Если extension не создаётся, общий GameApplication уничтожается.
- `restartStateBoundServices` сначала уничтожает awareness/tactical services и installers старого содержимого state, затем устанавливает новые.
- `destroy()` освобождает extension, ticker listener, все UI installers, workers, subscriptions, board и runtime services в обратном порядке.

## Производительность

- один Pixi Application;
- один canvas, camera и ticker;
- полный game UI устанавливается один раз;
- смена сценария выполняется вне frame hot path;
- diagnostic trails/impacts остаются bounded;
- обычная игра не импортирует Combat Lab extension;
- state-bound workers пересоздаются только при смене сценария.

## Проверки

1. Source contract подтверждает, что `src/main.ts` и `src/combat-lab/main.ts` оба вызывают `GameApplication.create`.
2. `combat-lab.html` содержит полный набор game DOM IDs и extension root.
3. `GameApplication.ts` содержит все installer markers из прежнего `src/main.ts`.
4. Combat Lab не вызывает `PixiTacticalBoardApp.create` напрямую.
5. Новый run сохраняет идентичность `SimulationState`.
6. Headless runner остаётся DOM/Pixi-free и детерминированным.
7. Focused Combat Lab smokes, TypeScript, `verify:preview`, production build и deployment pages проходят на одном exact SHA.

## Критерии готовности

- Combat Lab визуально начинается как полный игровой режим.
- HUD, workspace, editor, inspectors, layers и обычные controls присутствуют и работают с laboratory state.
- Лабораторный drawer добавляет инструменты, но не заменяет game UI.
- Скрытие drawer оставляет интерфейс, практически совпадающий с `/`.
- Смена сценария сохраняет canvas/camera/UI и меняет только содержимое state и state-bound services.
- Все автоматические проверки и exact-SHA Preview проходят.
