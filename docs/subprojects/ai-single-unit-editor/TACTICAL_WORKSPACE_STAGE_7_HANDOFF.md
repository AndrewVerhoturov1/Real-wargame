# Handoff addendum — Tactical Workspace Stage 7

Дата: 2026-07-10  
Подпроект: `ai-single-unit-editor`  
Рабочая ветка: `real-wargame-preview`

## Главное изменение

Игровая часть больше не использует три параллельные оболочки «игра / редактор / полигон ИИ». После Stage 7 в ней есть ровно два пользовательских режима:

```text
Симуляция | Редактирование
```

AI Node Editor по-прежнему открывается отдельно через `/ai-node-editor.html` и в Stage 7 не перерабатывался.

## Режим «Симуляция»

Устанавливается `src/ui/TacticalWorkspace.ts`.

Интерфейс:

- верхний переключатель двух режимов;
- сворачиваемая правая панель, которая резервирует место и не перекрывает карту;
- вкладки `Инфо / Опасность / Скрытность / Память`;
- нижняя RTS-плашка выбранного бойца;
- пауза, шаг, расчёт ИИ, выполнение, скорость, поза, сброс и очистка приказа;
- приказ движения правой кнопкой мыши.

Слои:

- `Инфо` не накладывает оверлей;
- `Опасность` использует личную память угроз и awareness grid;
- известные укрытия можно выбирать на карте и в списке;
- карточка укрытия показывает расстояние, защиту, надёжность, маскировку и известную угрозу;
- `Скрытность` использует отдельное отображение concealment и учитывает позу;
- `Память` показывает субъективные угрозы и известные предметы/укрытия.

## Режим «Редактирование»

Использует существующий `GameEditorWorkbench` как единственную палитру сцены.

При входе:

- `state.editor.enabled = true`;
- симуляция ставится на паузу;
- симуляционные панели скрываются;
- справа открываются `Предмет / Боец / Угроза / Рельеф / Сцена`;
- ручки угроз работают непосредственно в редакторе.

При возвращении в симуляцию игра остаётся на паузе до явной команды пользователя.

## Что больше не устанавливается

`src/main.ts` больше не вызывает:

```text
installGameHudControls(...)
installAiTestLabControls(...)
```

Старые файлы пока сохранены как совместимая внутренняя база и источник форм/расчётов, но отдельный пользовательский интерфейс полигона не появляется.

## Основные файлы Stage 7

```text
src/ui/TacticalWorkspace.ts
src/tactical-workspace.css
src/tactical-workspace-mode.css
src/core/ui/RuntimeUiState.ts
src/core/knowledge/SimulationCoverSelection.ts
src/core/knowledge/SoldierAwarenessGrid.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
src/rendering/PixiOverlayRenderer.ts
src/rendering/PixiThreatEditorRenderer.ts
src/rendering/HtmlOverlayRenderer.ts
src/input/BoardInputController.ts
src/core/testing/AiLabInteraction.ts
scripts/tactical_workspace_smoke.mjs
tests/preview-screenshots.spec.ts
docs/manual-test/TACTICAL_WORKSPACE_STAGE_7.md
```

## Важные правила продолжения

- Не возвращать кнопку или отдельную оболочку `Полигон ИИ`.
- Не устанавливать параллельно старый Game HUD и Tactical Workspace.
- Не смешивать симуляционные клики с редакторскими инструментами.
- Редактор всегда должен ставить симуляцию на паузу.
- Правая панель и нижняя плашка должны резервировать место для Pixi canvas.
- Не показывать служебные подписи объектов в режиме симуляции.
- Не считать concealment физической защитой.
- Не изменять AI Node Editor в задачах по игровому workspace без отдельного запроса.
- UI-правки проверять свежим GitHub Actions + Chrome + Playwright artifact того же SHA.

## Проверки

```text
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Набор браузерных кадров:

```text
01-simulation-info.png
02-simulation-sidebar-collapsed.png
03-simulation-danger-layer.png
04-simulation-cover-selected.png
05-simulation-stealth-layer.png
06-simulation-memory-layer.png
07-editor-object-palette.png
08-editor-threat-tools.png
09-editor-terrain-tools.png
10-node-editor-unchanged.png
```

## Известные границы

- Вкладка памяти пока подробно показывает память угроз и известные укрытия; единый долговременный реестр всех типов объектов мира остаётся следующим расширением.
- Скрытность основана на текущих данных леса, предметов, позы и известных угроз; полноценные вражеские наблюдатели и сложная модель обнаружения ещё не реализованы.
- Подпроект всё ещё рассчитан на одного выбранного бойца.
- Внутренние старые AI Lab controls сохранены в репозитории для совместимости, но не устанавливаются в игровом entrypoint.
