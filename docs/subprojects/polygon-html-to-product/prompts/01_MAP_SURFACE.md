# Prompt исполнителю КАРТА — настоящая поверхность карты в новом Полигоне

Ты — исполнитель **КАРТА**.

В начале каждого отчёта напиши:

> Я — КАРТА. Отвечаю за настоящую игровую поверхность карты внутри нового shell Полигона.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база на момент подготовки handoff:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-map-surface
```

Перед созданием ветки обязательно заново получи exact current HEAD `real-wargame-preview`. Если он изменился, используй новый SHA и укажи его в отчёте.

## Главная цель

Сейчас новый shell АРКИ визуально принят пользователем, но центральная область карты остаётся заглушкой: живой Pixi canvas смонтирован продуктом, однако `polygon-shell-exact.css` намеренно скрывает его и показывает placeholder.

Нужно заменить placeholder на **настоящую игровую карту**, сохранив новый дизайн shell и приблизив визуальную подачу самой поверхности карты к принятому HTML-прототипу.

Это не задача «нарисовать новую карту с нуля». Нужно использовать существующий product renderer и реальные данные карты.

## Обязательные источники

Прочитай до изменений:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/polygon-html-to-product/ARKA_IMPLEMENTATION_HANDOFF.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `src/combat-lab/main.ts`;
- `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
- `src/combat-lab/polygon-shell.css`;
- `src/combat-lab/polygon-shell-exact.css`;
- `src/game/GameApplication.ts`;
- `src/rendering/PixiApp.ts`;
- `src/rendering/PixiMapRenderer.ts`.

Также прочитай mandatory performance sources, на которые ссылается performance skill.

## Что уже существует и должно остаться owner

Product map path уже есть:

```text
GameApplication
→ PixiTacticalBoardApp
→ PixiMapRenderer
→ TacticalMap / EnvironmentMaterialProfile / map revisions
```

Также уже существуют:

- `CameraController`;
- `BoardInputController`;
- grid/height/vision controls;
- vegetation raster;
- map objects;
- elevation/contour presentation;
- revision-driven static map cache.

Нельзя создавать второй `Application`, второй canvas, второй map state или копию карты ради нового shell.

## Требуемый результат

### 1. Вернуть живой canvas в viewport

- убрать/переопределить временное ARKA-правило, скрывающее `#app canvas`;
- корректно расположить canvas в `polygon-shell-viewport`;
- карта должна занимать центральную область между левым и правым panel shell;
- collapse боковых панелей должен освобождать место карте;
- resize shell должен корректно обновлять canvas/viewport;
- placeholder должен быть удалён либо становиться fallback только при реальной невозможности запуска renderer, но не перекрывать рабочую карту.

### 2. Сохранить настоящее управление картой

Должны продолжить работать существующие:

- pan;
- zoom;
- selection/input, насколько они уже существуют на базе;
- grid toggle;
- overlays;
- map object rendering.

Не переписывай input и selection — это не твоя зона.

### 3. Приблизить presentation поверхности к принятому прототипу

Нужен не старый «технический debug board», а спокойная карта, визуально совместимая с новым shell:

- приглушённая военная/картографическая палитра;
- читаемые поверхности без кислотных цветов;
- аккуратная мелкая и крупная сетка там, где она включена/уместна;
- рельеф, растительность и объекты должны читаться как карта, а не как набор разноцветных тестовых клеток;
- границы и фон viewport должны визуально дружить с принятой ARKA-композицией;
- избегать тяжёлых декоративных эффектов и псевдо-3D.

Внешний HTML — UX/visual reference, но данные и геометрия должны оставаться настоящими product data.

### 4. Не ломать производительность

Сохрани revision-driven map rebuild. Запрещено:

- полный rebuild карты каждый frame;
- создание display object на каждую клетку каждый tick;
- повторное вычисление terrain/perception в UI;
- новый unbounded raster/cache;
- работа по всему map на pointer move.

Если меняешь `PixiMapRenderer`, до реализации зафиксируй hot path, invalidation identity, memory bound и teardown.

## Явно НЕ твоя зона

Не меняй без необходимости:

- `PixiUnitRenderer` и визуальный язык пешки — это ПЕШКА;
- selection/UnitModel/right `Юнит` — это ПУЛЬС;
- `Инфо / Внимание / Память` — это ЛИНЗА;
- editor catalogue/editor internals — это РЕДАКТОРЫ;
- контекстное меню/right-click arbitration — это КОНТЕКСТ;
- simulation semantics, LOS, attention, memory, combat logic.

Если для карты нужен общий shell seam, делай минимальный нейтральный seam и подробно укажи его в handoff.

## Проверки

Минимум:

1. focused smoke для Polygon shell/map renderer;
2. TypeScript/noEmit;
3. production build;
4. проверки, требуемые `CI_RISK_BASED_ACCEPTANCE.md`;
5. browser visual QA через screenshot skill на exact final SHA.

Обязательные визуальные состояния:

- desktop 1600×900;
- 1080×800;
- левая и правая панели открыты;
- одна боковая панель свёрнута;
- zoom in / zoom out;
- grid on/off, если это штатный toggle.

Скриншоты нужно **открыть и проверить глазами**, а не только создать.

## Критерии ACCEPT

- в центре нового shell реально отображается product map, а не placeholder;
- используется существующий `PixiTacticalBoardApp/PixiMapRenderer`;
- camera/input продолжают работать;
- shell не перекрывает карту и корректно resize-ится;
- визуально карта совместима с принятым дизайном Полигона;
- нет второго runtime/map state;
- static map cache не превращён в per-frame rebuild;
- нет изменений соседних подсистем без доказанной необходимости;
- проверки и свежая browser QA привязаны к exact final SHA.

## Возврат результата

Верни по `docs/orchestration/RESULT_TEMPLATE.md`:

```text
executor: КАРТА
base_commit:
feature_branch:
current_commit:
changed_files:
checks_run:
not_checked:
visual_qa:
performance_impact:
blockers:
next_integration_point: КАРТА + ПЕШКА + ПУЛЬС
preview_touched: no
main_touched: no
deployment_touched: no
```

Не делай merge/transfer/deployment самостоятельно.
