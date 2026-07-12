<!-- GENERATED FILE. Edit docs/subprojects/ai-single-unit-editor/subproject.json, then run npm run docs:generate. -->
# AI Single-Unit Editor — Stateful Tactical Awareness Lab — Current Status

- **ID:** `ai-single-unit-editor`
- **Status:** `active`
- **Updated:** 2026-07-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `a818afa65b8cc0086c3360d27002b023e6848650`

## Goal

Создать понятную человеку лабораторию поведения одиночного бойца: Utility AI выбирает решение, stateful runtime исполняет длительные действия, общий A* ведёт бойца по карте, а постоянные профили маршрута позволяют без кода настраивать стоимость местности и честно известные бойцу тактические факторы.

## Current focus

На временной ветке реализуется Navigation Profiles v1: редактируемый реестр профилей, единый выбор активного профиля, профильный A*, ограничение обхода, субъективная известная опасность, контролируемое перестроение и независимый кешированный слой стоимости маршрута. Результат ещё не переносился в real-wargame-preview; визуальная проверка не запускалась.

## Next step

Завершить не-визуальные проверки точного SHA, подготовить отдельный Playwright-сценарий и после разрешения пользователя провести визуальную проверку с осмотром PNG. Перенос в real-wargame-preview возможен только по отдельной явной команде пользователя.

## Read first

- `docs/ai/WEB_CHAT_START.md`
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- `.agents/skills/real-wargame-local-preview/SKILL.md`
- `docs/subprojects/ai-single-unit-editor/STATUS.md`
- `docs/subprojects/ai-single-unit-editor/NAVIGATION_PROFILES_V1.md`
- `docs/subprojects/ai-single-unit-editor/TACTICAL_ROUTE_COST_V1.md`
- `docs/subprojects/ai-single-unit-editor/ROUTE_COST_OVERLAY_V1.md`
- `docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md`
- `docs/subprojects/ai-single-unit-editor/GRID_PATHFINDING_V1.md`
- `docs/superpowers/specs/2026-07-12-navigation-profiles-route-cost-design.md`
- `docs/superpowers/plans/2026-07-12-navigation-profiles-route-cost.md`
- `AGENTS.md`

## Main files

- `src/core/navigation/NavigationProfiles.ts`
- `src/core/navigation/NavigationProfileStorage.ts`
- `src/core/navigation/NavigationProfileResolver.ts`
- `src/core/navigation/NavigationRuntime.ts`
- `src/core/navigation/RouteCostField.ts`
- `src/core/navigation/NavigationReplanPolicy.ts`
- `src/core/navigation/NavigationRouteReplanner.ts`
- `src/core/navigation/RouteCostOverlayState.ts`
- `src/core/pathfinding/GridNavigation.ts`
- `src/core/pathfinding/GridPathfinder.ts`
- `src/core/orders/PlayerCommand.ts`
- `src/core/orders/MoveOrder.ts`
- `src/core/orders/MoveOrderPlanning.ts`
- `src/core/orders/RoutedMoveOrders.ts`
- `src/core/ai/AiStatefulMoveGameBridge.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/rendering/PixiRouteCostOverlayRenderer.ts`
- `src/ui/RouteCostOverlayUi.ts`
- `src/ai-node-editor/NavigationProfileEditor.ts`

## Suggested verification

- `npm run navigation-profiles:smoke`
- `npm run navigation-overlay:smoke`
- `npm run pathfinding:smoke`
- `npm run routed-move:smoke`
- `npm run runtime:smoke`
- `npm run route-status:smoke`
- `npm run move-bridge:smoke`
- `npm run command-plan-route:smoke`
- `npm run map-revision:smoke`
- `npm run build`
- `npm run docs:check`
- `tests/navigation-profiles-route-cost.spec.ts — только после явного разрешения пользователя`

## Safety rules

- SimulationTick остаётся единственным кодом, который изменяет координаты бойца.
- A* выполняется только при создании приказа или разрешённом перестроении; renderer не импортирует GridPathfinder.
- Динамическая стоимость использует только UnitTacticalKnowledge выбранного бойца и не выдаёт скрытое объективное знание за известное.
- Непроходимость отделена от числовой цены; никакой вес не делает воду без моста или блокирующий объект проходимыми.
- Движение курсора читает готовый typed-array и не увеличивает staticCostBuildCount или dynamicCostBuildCount.
- Выключение слоя использует container.visible=false и не уничтожает кеши, canvas, texture или sprite.
- Перестроение сохраняет playerCommandId и AI ownerToken; устаревшая очистка ИИ не удаляет приказ игрока.
- Профили маршрута не хранятся внутри конкретного behavior graph и не превращаются в числовые ноды.
- Не утверждать визуальную проверку без запуска браузера и открытия PNG точного SHA.
- Не менять main и не переносить результат в real-wargame-preview без отдельного явного GO пользователя.
