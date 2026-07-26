# Combat Lab поверх общего игрового рендера — проектное решение

Дата: 2026-07-26

## Контекст

Исходный Combat Lab был отдельной страницей с собственным `CombatLabRenderer`, который повторно рисовал фон, сетку, бойцов, направление взгляда, пули и диагностику. Поэтому лаборатория визуально и технически расходилась с основной игрой.

Основная игра уже имеет единый `PixiTacticalBoardApp`, который владеет картой, камерой, рендерингом бойцов и поз, приказами, HTML-подписями, слоями маршрутов/опасности/осведомлённости и единым PixiJS lifecycle.

Требуется сделать Combat Lab специальным режимом этой же визуальной системы, сохранив отдельный лабораторный пульт, сценарии, headless runner, метрики и контрольные точки.

## Цели

1. Карта, бойцы, движение, позы, приказы и стандартные слои отображаются теми же production renderer-ами, что в игре.
2. Лаборатория сохраняет собственный сценарный редактор и не наследует обычный игровой HUD целиком.
3. Лабораторная диагностика является дополнительным overlay и не повторяет карту или обычных бойцов.
4. Игра, редактор ИИ и Combat Lab имеют общий переключатель режимов с выделением текущего.
5. Лабораторное состояние изолировано от обычной сцены и браузерных сохранений игры.
6. Смена сценария заменяет состояние у всех state-bound потребителей и освобождает старые ресурсы.

## Не цели

- перенос лабораторного состояния в игру;
- встраивание редактора ИИ в Combat Lab;
- изменение физики и коэффициентов Stage 3–9;
- новая система слоёв вместо `state.editor.layers`;
- копирование `src/main.ts`;
- iframe, второй Pixi Application, вторая камера или второй ticker.

## Рассмотренные варианты

### Копия bootstrap игры

Отклонена: создаёт две расходящиеся реализации и дублирует lifecycle сервисов.

### iframe

Отклонён: создаёт отдельный `SimulationState`, canvas и ticker, а команды лаборатории перестают работать с авторитетным состоянием отображаемой сцены.

### Общий production board и лабораторный overlay

Выбран: один renderer карты/бойцов, одна камера, один Pixi lifecycle, общие слои и эффекты; лаборатория сохраняет собственную сессию и UI.

## Реализованная архитектура

### 1. Production board остаётся неизменным владельцем hot path

`PixiTacticalBoardApp` не получает новый условный режим и не меняет поведение обычной игры. Combat Lab создаёт его штатной фабрикой.

Для интеграции используется узкий `PixiTacticalBoardAdapter`, построенный по существующему шаблону installer-модулей `CombatEffectsInstaller` и `AttentionOverlayInstaller`. Adapter централизованно предоставляет только:

- `getWorldContainer()`;
- добавление/removal listener к существующему Pixi ticker;
- `bindSimulationState(state)` для смены сценария.

При перепривязке adapter:

- заменяет state у board;
- заменяет state у `BoardInputController`;
- обновляет подпись масштаба;
- инвалидирует revision-driven map cache;
- очищает старые view cones;
- вызывает production render.

Знание о внутренних полях `PixiTacticalBoardApp` находится только в adapter-е и защищено source-contract smoke. Основная игра не импортирует adapter и не получает дополнительной работы.

### 2. Авторитетное состояние и время

`CombatLabVisualSession` владеет текущим scenario definition, seed, `SimulationState`, fixed step, паузой, скоростью, программой, метриками, журналом и checkpoint.

В лаборатории `state.paused = true`, поэтому штатный ticker board не вызывает `tickSimulation` для этого состояния. Combat Lab добавляет listener к **тому же** Pixi ticker. Listener вызывает `session.advance(realDeltaSeconds)`, затем production board в своём обычном listener отображает обновлённое состояние.

Таким образом:

- Pixi ticker один;
- simulation authority остаётся у visual session;
- ручной шаг использует `session.stepOnce()`;
- renderer не вызывает `tickSimulation` напрямую.

### 3. Общие игровые сервисы

Для текущего laboratory state подключаются:

- `PixiTacticalBoardApp`;
- `installCombatEffectsRenderer`;
- `installAttentionOverlayRenderer`;
- `installAdaptiveGridLod`;
- environment movement material provider;
- awareness field controller/runtime;
- tactical position search service;
- общие registries movement/environment profiles.

Не подключаются конфликтующие оболочки игры: обычный `CombatControls`, полный editor workbench, scene controls и AI game bridge. Камера, выбор бойца и board input остаются производственными. Боевые команды лаборатории идут через `CombatLabShell` и опубликованные production API.

### 4. Лабораторная диагностика

`CombatLabDiagnosticOverlayRenderer` получает production `worldContainer` и использует его координатное пространство. Он не создаёт `Application`, canvas, камеру, map renderer или unit renderer.

Он рисует только:

- активные пули и bounded trails;
- impacts и последнюю hit zone;
- aim direction и target point;
- DP-27 anchor/sector;
- suppression diagnostics;
- контрольные расстояния;
- лабораторные unit IDs.

Обычная графика выстрелов и попаданий принадлежит `installCombatEffectsRenderer`. Trails ограничены `MAX_COMBAT_LAB_TRAIL_POINTS`, impacts — ограниченным хвостом. Полного прохода карты нет.

### 5. Совместимый фасад для UI

Имя `CombatLabRenderer` сохранено как фасад, чтобы не смешивать UI с деталями lifecycle. Фасад:

- создаёт production board;
- подключает adapter и diagnostic overlay;
- устанавливает state-bound services;
- предоставляет прежние методы layer controls, history и force render;
- обнаруживает замену `session.state` и транзакционно перепривязывает board.

Он не является самостоятельным renderer карты.

### 6. Стандартные и лабораторные слои

Под production canvas находится компактный toolbar:

- существующие `state.editor.layers`;
- сетка;
- view cones;
- height labels.

Лабораторные диагностические layers остаются отдельной группой в `CombatLabShell`. Оба набора переключателей только меняют отображение и не являются источником боевого состояния.

### 7. Общая навигация

`AppShellMenuMode` содержит `game`, `editor`, `combat-lab` и `launcher`.

На всех трёх страницах доступны:

- `Игра` → `/`;
- `Редактор ИИ` → `/ai-node-editor.html`;
- `Испытательный полигон` → `/combat-lab.html`.

Переход выполняется в текущей вкладке. Текущий режим имеет `aria-current="page"`. `Новая игра`, `Обновить` и `Выход` остаются вторичными действиями.

### 8. Смена сценария

После `session.startNewRun` фасад при следующем кадре/force render:

1. уничтожает старые state-bound installers;
2. подготавливает новый state и registries;
3. перепривязывает board и board input через adapter;
4. очищает diagnostic history/labels;
5. создаёт services для нового state;
6. перестраивает переключатели общих слоёв;
7. UI перечитывает роли сценария.

Pixi Application, canvas и камера не пересоздаются.

### 9. Teardown

При закрытии страницы уничтожаются:

- laboratory ticker listener;
- combat/attention/adaptive-grid installers;
- awareness field controller;
- tactical position search service;
- laboratory overlay;
- общий board и его camera/input/renderers.

Ни один лабораторный listener или renderer не должен переживать страницу.

## Поток данных

```text
CombatLabShell
  -> CombatLabVisualSession.executeInteractive / startNewRun / stepOnce
  -> production SimulationState
  -> shared Pixi ticker
     -> CombatLabVisualSession.advance
     -> PixiTacticalBoardApp render
     -> production effect installers
     -> CombatLabDiagnosticOverlayRenderer
  -> CombatLabShell.refreshLive
```

Headless runner остаётся независимым от DOM и PixiJS.

## Ошибки

- Ошибка создания board показывает русское startup-сообщение.
- Команда с отсутствующим участником возвращает production-boundary отказ, а не падает в renderer.
- Перепривязка сначала уничтожает старые services, поэтому один state-bound installer не обслуживает два состояния.
- Source contract запрещает второй `Application` в Combat Lab.

## Производительность

- один Pixi `Application`;
- один ticker и камера;
- production map cache;
- bounded projectiles/trails/impacts;
- без полного прохода клеток карты в кадре;
- смена сценария вне hot path;
- обычная игра не импортирует laboratory runtime.

## Проверки

### Контрактные

- Combat Lab создаёт `PixiTacticalBoardApp` и не создаёт `Application`;
- adapter централизует board internals и state replacement;
- diagnostic overlay не рисует карту/бойцов;
- production effect installers подключены;
- все entry point устанавливают правильный `AppShellMenu`;
- menu содержит три маршрута и `aria-current`;
- teardown уничтожает state-bound services и board.

### Функциональные

- восемь сценариев создаются и используют production loadouts;
- headless runner детерминирован и независим от порядка units;
- visual session сохраняет fixed-step pause/step/speed;
- смена scenario очищает diagnostic history и заменяет state;
- стандартные layers используют existing state flags;
- laboratory layers не изменяют физику;
- save/load boundaries сохраняют канонический путь.

### Gate

- `npm run docs:smoke`;
- `npm run lab:smoke`;
- `npm run combat-lab:smoke`;
- `npm run combat-lab-scenarios:smoke`;
- `npm run combat-lab-runner:smoke`;
- `npm run combat-lab-ui-contract:smoke`;
- `npm run infantry-combat-stage9:verify`;
- `npm run typecheck`;
- `npm run build`;
- `npm run verify:preview`;
- `git diff --check 90043f503d7615f296118abf8f11cd4a85a8df6d...HEAD`.

## Критерии готовности

1. Combat Lab показывает production map/units/camera/layers.
2. Лабораторный пульт и восемь сценариев сохранены.
3. Самостоятельная отрисовка карты и бойцов отсутствует.
4. Все три страницы имеют общую навигацию.
5. Смена state и teardown не оставляют старые state-bound services.
6. Non-browser gate и production build проходят на одном exact SHA.
7. Preview содержит все три страницы и `deployment-source.json` с exact SHA.
8. Визуальную пригодность и калибровку подтверждает владелец отдельной живой проверкой.