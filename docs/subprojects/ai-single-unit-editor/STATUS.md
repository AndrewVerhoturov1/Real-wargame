<!-- GENERATED FILE. Edit docs/subprojects/ai-single-unit-editor/subproject.json, then run npm run docs:generate. -->
# AI Single-Unit Editor — Stateful Tactical Awareness Lab — Current Status

- **ID:** `ai-single-unit-editor`
- **Status:** `active`
- **Updated:** 2026-07-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `0a4d418130e68e91ee82a2e53f1fe6e02959a6b2`

## Goal

Создать понятную человеку лабораторию поведения одиночного бойца: Utility AI выбирает решение, stateful runtime исполняет длительные действия, а общий маршрутный слой безопасно ведёт бойца по карте.

## Current focus

Reactive Route Status v1 и Grid Pathfinding v1 реализованы и проверены: выбранный боец измеряет прогресс и причины отмены, игрок и ИИ используют общий детерминированный A*, MoveOrder следует waypoint-точкам, перестраивает путь при изменении проходимости и честно сообщает blocked/unreachable без фиктивного успеха.

## Next step

Следующий отдельный вертикальный срез — либо тактическая стоимость пути по субъективно известной угрозе и скрытности, либо резервирование клеток/укрытий между бойцами; не объединять оба направления в одну задачу.

## Read first

- `docs/ai/WEB_CHAT_START.md`
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- `docs/subprojects/ai-single-unit-editor/STATUS.md`
- `docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md`
- `docs/subprojects/ai-single-unit-editor/GRID_PATHFINDING_V1.md`
- `docs/subprojects/ai-single-unit-editor/STATEFUL_RUNTIME_V1.md`
- `docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md`
- `docs/superpowers/specs/2026-07-12-ai-grid-pathfinding-v1-design.md`
- `docs/superpowers/plans/2026-07-12-ai-grid-pathfinding-v1.md`
- `AGENTS.md`

## Main files

- `src/core/ai/AiGraphRunner.ts`
- `src/core/ai/AiGraphRuntime.ts`
- `src/core/ai/AiRouteStatus.ts`
- `src/core/ai/AiGameBridge.ts`
- `src/core/ai/AiStatefulMoveGameBridge.ts`
- `src/core/pathfinding/GridNavigation.ts`
- `src/core/pathfinding/GridPathfinder.ts`
- `src/core/orders/MoveOrder.ts`
- `src/core/orders/MoveOrderPlanning.ts`
- `src/core/orders/RoutedMoveOrders.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/input/BoardInputController.ts`
- `src/ai-node-editor/stateful-node-ui.ts`
- `src/ai-node-editor/stateful-move-debug.ts`
- `src/ai-node-editor/runtime-debug-overlay.ts`
- `tests/ai-running-move.spec.ts`

## Suggested verification

- `npm run workspace:smoke`
- `npm run lab:smoke`
- `npm run game-editor:smoke`
- `npm run editor:smoke`
- `npm run engine:smoke`
- `npm run validate:ai-graph`
- `npm run runtime:smoke`
- `npm run route-status:smoke`
- `npm run pathfinding:smoke`
- `npm run routed-move:smoke`
- `npm run move-bridge:smoke`
- `npm run build`
- `npm run docs:check`
- `tests/ai-running-move.spec.ts`

## Safety rules

- SimulationTick остаётся единственным кодом, который изменяет координаты бойца.
- Не запускать A* каждый кадр или каждый 60-мс poll; поиск выполняется при создании или инвалидировании маршрута.
- Route tracker не удаляет MoveOrder напрямую; очистка ИИ требует совпадающего ownerToken.
- Приказ игрока имеет приоритет и не удаляется устаревшей очисткой ИИ.
- Игрок может получить ближайшую доступную цель, но AI-нода требует точную клетку и при блокировке возвращает unreachable.
- Координаты MapObject используют центр x+0.5/y+0.5; не создавать вторую геометрическую трактовку.
- Не выдавать Grid Pathfinding v1 за flow field, formation pathfinding или динамическое резервирование.
- Автоматический граф пока исполняется только для выбранного бойца.
- Не утверждать визуальную проверку без запуска браузера и открытия PNG точного SHA.
- Не менять main без отдельного явного GO пользователя.
