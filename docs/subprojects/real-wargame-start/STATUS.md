<!-- GENERATED FILE. Edit docs/subprojects/real-wargame-start/subproject.json, then run npm run docs:generate. -->
# 2D Tactical Command Game — RTS Foundation / Soldier Behavior Lab — Current Status

- **ID:** `real-wargame-start`
- **Status:** `maintenance`
- **Updated:** 2026-07-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `f0bc53566be4451e9dd9fb8aa5df6a7027de759b`
- **Superseded by:** `ai-single-unit-editor`

## Goal

Собрать рабочую основу 2D Tactical Command Game / Soldier Behavior Lab на PixiJS + TypeScript + Vite: карта, юниты, редактор, высоты, лес, укрытия, видимость, базовый интерфейс и удобная проверка через preview. Главный фокус — будущие мозги солдат, а не стратегический ИИ командира.

## Current focus

RTS-заготовка завершена как рабочая основа и поддерживается по мере необходимости. Активная разработка перенесена в подпроект ai-single-unit-editor.

## Next step

Исправлять карту, интерфейс, редактор, видимость и укрытия только когда это требуется активным вертикальным срезом поведения солдата.

## Read first

- `docs/subprojects/real-wargame-start/STATUS.md`
- `docs/subprojects/real-wargame-start/SUBPROJECT.md`
- `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`
- `docs/subprojects/real-wargame-start/test-program.md`
- `docs/architecture/OVERVIEW.md`
- `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md`

## Main files

- `index.html`
- `package.json`
- `tsconfig.json`
- `src/main.ts`
- `src/core/geometry.ts`
- `src/core/map/MapModel.ts`
- `src/core/orders/MoveOrder.ts`
- `src/core/simulation/SimulationState.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/core/visibility/LineOfSight.ts`
- `src/core/terrain/SmoothTerrain.ts`
- `src/core/knowledge/UnitKnowledge.ts`
- `src/core/sensors/EnvironmentSensors.ts`
- `src/core/units/UnitModel.ts`
- `src/input/BoardInputController.ts`
- `src/input/CameraController.ts`
- `src/rendering/PixiApp.ts`
- `src/rendering/PixiMapRenderer.ts`
- `src/rendering/PixiOrderRenderer.ts`
- `src/rendering/PixiOverlayRenderer.ts`
- `src/rendering/PixiUnitRenderer.ts`
- `src/rendering/HtmlOverlayRenderer.ts`
- `src/rendering/terrainStyle.ts`
- `src/ui/EditorControls.ts`
- `src/ui/GameHudControls.ts`
- `src/ui/SceneExport.ts`
- `src/ui/SceneExportControls.ts`
- `src/ui/PerformanceReportControls.ts`
- `src/data/maps/test_map.json`
- `src/data/units/test_units.json`
- `src/styles.css`
- `src/ui-layout.css`

## Suggested verification

- `Run-Real-Wargame-Lab.bat — пользовательская проверка без терминала`
- `Открыть карту, проверить зум, pan, выбор солдата и правый клик для приказа`
- `Проверить игровой интерфейс: верхняя панель, правая вкладочная панель, нижняя карточка юнита`
- `Проверить редактор: режим редактора, вкладки, кисти высот/леса, предметы, юниты, зоны`
- `Проверить JSON сцены: скачать и загрузить обратно`
- `Проверить Alt-линию видимости: метры, зелёная/красная линия, HTML-подпись, причина преграды`
- `Проверить слой Реальный рельеф: включается, не выглядит как россыпь +1, не должен заметно тормозить`
- `Проверить объектные высоты: низкие бочки/ящики не должны автоматически закрывать обзор с высоты, дома/деревья должны закрывать сильнее`
- `Проверить GitHub Actions Preview screenshots, если нужен удалённый визуальный smoke`

## Safety rules

- Работать в real-wargame-preview; main не менять и не мержить без явного GO пользователя.
- Не просить пользователя выполнять Git/терминал/ветки руками.
- Не откатывать сглаживание/кэш рельефа и не возвращать antialias false как постоянное решение.
- Не ломать экспорт/загрузку JSON сцены.
- Не смешивать RTS-заготовку с финальной системой боя: бой, баллистика, полноценный pathfinding, связь, мораль и сложный ИИ — следующие этапы.
- Сохранять разделение core/rendering/input/data; core не должен импортировать PixiJS.
- Не утверждать, что локальная сборка или браузерная проверка выполнена, если она не запускалась.
