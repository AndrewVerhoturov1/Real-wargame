<!-- GENERATED FILE. Edit docs/subprojects/ai-single-unit-editor/subproject.json, then run npm run docs:generate. -->
# AI Single-Unit Editor — Stateful Tactical Awareness Lab — Current Status

- **ID:** `ai-single-unit-editor`
- **Status:** `active`
- **Updated:** 2026-07-13
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `02a43f233d1618b7b8b2331869d34e9b12bbec9e`

## Goal

Создать понятную человеку лабораторию поведения одиночного бойца: Utility AI выбирает решение, stateful runtime исполняет длительные действия, общий A* ведёт бойца по карте, постоянные профили маршрута задают стоимость местности, а гибридная система обзора и внимания формирует субъективные визуальные и звуковые контакты без всезнания ИИ.

## Current focus

Завершён пакет стабилизации отображения угроз и управления вниманием: геометрия пулемётной угрозы отделена от текущей метки подтверждения и больше не пересоздаётся при visibleNow, подпись «Пулемёт» имеет переход к тактической памяти, боец поворачивается по каждому отрезку маршрута, добавлен сохраняемый реестр именованных профилей внимания с редактором, а нижняя карточка собрана в адаптивную компактную сетку без переполнения.

## Next step

Провести пользовательскую проверку в real-wargame-preview. После подтверждения развивать восприятие нескольких бойцов и обмен субъективными контактами по командной цепочке; main не менять без отдельного явного GO пользователя.

## Read first

- `docs/subprojects/ai-single-unit-editor/VIEW_AND_MEMORY_HEATMAP_V1.md`
- `docs/superpowers/plans/2026-07-13-view-memory-heatmap.md`
- `docs/ai/WEB_CHAT_START.md`
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- `.agents/skills/real-wargame-local-preview/SKILL.md`
- `docs/subprojects/ai-single-unit-editor/STATUS.md`
- `docs/subprojects/ai-single-unit-editor/PERCEPTION_ATTENTION_V1.md`
- `docs/subprojects/ai-single-unit-editor/NAVIGATION_PROFILES_V1.md`
- `docs/subprojects/ai-single-unit-editor/TACTICAL_ROUTE_COST_V1.md`
- `docs/subprojects/ai-single-unit-editor/ROUTE_COST_OVERLAY_V1.md`
- `docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md`
- `docs/subprojects/ai-single-unit-editor/GRID_PATHFINDING_V1.md`
- `docs/superpowers/specs/2026-07-12-soldier-perception-attention-design.md`
- `docs/superpowers/plans/2026-07-12-soldier-perception-attention-v1.md`
- `docs/superpowers/specs/2026-07-12-compact-route-controls-editor-navigation-design.md`
- `docs/superpowers/plans/2026-07-12-compact-route-controls-editor-navigation.md`
- `AGENTS.md`

## Main files

- `src/core/perception/AttentionModel.ts`
- `src/core/perception/AttentionController.ts`
- `src/core/perception/PerceptionStimulus.ts`
- `src/core/perception/VisualSignal.ts`
- `src/core/perception/PerceptionContact.ts`
- `src/core/perception/PerceptionSound.ts`
- `src/core/perception/PerceptionDiagnostics.ts`
- `src/core/perception/PerceptionSystem.ts`
- `src/core/visibility/LineOfSight.ts`
- `src/core/knowledge/SoldierThreatMemory.ts`
- `src/core/pressure/ThreatEvaluation.ts`
- `src/core/units/UnitModel.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/core/ai/AiBlackboard.ts`
- `src/core/ai/AiGameBridge.ts`
- `src/core/ai/AiGraphRunner.ts`
- `src/core/ai/AiGraphValidation.ts`
- `src/core/ai/AiNodeTypes.ts`
- `src/core/ai/AiConceptValues.ts`
- `src/core/ai/AiConceptOperations.ts`
- `src/core/editor/GameEditorDrafts.ts`
- `src/core/editor/GameEditorPlacement.ts`
- `src/core/ui/RuntimeUiState.ts`
- `src/rendering/PixiAttentionOverlayRenderer.ts`
- `src/rendering/AttentionOverlayInstaller.ts`
- `src/ui/AttentionProfileControls.ts`
- `src/ui/AttentionRuntimePanel.ts`
- `src/ui/SceneExport.ts`
- `src/ai-node-editor/AttentionNodeControls.ts`
- `src/perception-attention.css`
- `src/ai-node-editor/attention-node-controls.css`
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
- `src/rendering/CommandPlanRouteOverlayModel.ts`
- `src/rendering/PixiRouteCostOverlayRenderer.ts`
- `src/ui/TacticalWorkspace.ts`
- `src/ui/CommandPlanRouteUi.ts`
- `src/ui/RouteCostOverlayUi.ts`
- `src/ai-node-editor/NavigationProfileEditor.ts`
- `src/core/visibility/VisibilityQuality.ts`
- `src/core/visibility/VisibilityStaticGrid.ts`
- `src/core/visibility/SelectedUnitVisibilityField.ts`
- `src/rendering/PixiVisibilityHeatmapRenderer.ts`
- `src/core/knowledge/ThreatDisplayModel.ts`
- `src/core/perception/AttentionProfiles.ts`
- `src/core/perception/AttentionProfileStorage.ts`
- `src/ai-node-editor/AttentionProfileEditorPanel.ts`

## Suggested verification

- `npm run threat-display-stability:smoke`
- `npm run movement-facing:smoke`
- `npm run attention-profiles:smoke`
- `node scripts/bottom_panel_layout_contract_smoke.mjs`
- `npm run view-memory-heatmap:smoke`
- `npm run view-memory-heatmap-performance:smoke`
- `npm run perception-variance:smoke`
- `npm run perception:smoke`
- `npm run perception-performance:smoke`
- `npm run attention-ai-nodes:smoke`
- `npm run ui-compact-route-controls:smoke`
- `npm run navigation-profiles:smoke`
- `npm run navigation-profile-switch:smoke`
- `npm run navigation-overlay:smoke`
- `npm run pathfinding:smoke`
- `npm run routed-move:smoke`
- `npm run runtime:smoke`
- `npm run route-status:smoke`
- `npm run move-bridge:smoke`
- `npm run command-plan-route:smoke`
- `npm run map-revision:smoke`
- `npm run visibility-probe:smoke`
- `npm run workspace:smoke`
- `npm run game-editor:smoke`
- `npm run dictionary:smoke`
- `npm run lab:smoke`
- `npm run build`
- `npm run docs:check`
- `npx playwright test tests/perception-attention-overlay.spec.ts --project=chromium — только после явного разрешения пользователя`

## Safety rules

- SimulationTick остаётся единственным кодом, который изменяет координаты бойца.
- PerceptionSystem является владельцем расчёта восприятия; renderer и DOM только показывают готовое субъективное состояние.
- Физическая опасность может давать подавление и стресс без раскрытия точной позиции источника в Blackboard.
- sourceVisible означает возможность создать зрительный сигнал, а не автоматическое обнаружение.
- Blackboard current_target, enemyVisible и enemyKnown получают данные только из личных контактов бойца.
- Восприятие версии 1 рассчитывается только для выбранного бойца и не запускается от движения камеры или курсора.
- Фокус, прямой сектор и периферия имеют разные интервалы; угол проверяется до дорогого LOS.
- A* выполняется только при создании приказа или разрешённом перестроении; renderer и UI не импортируют GridPathfinder.
- Динамическая стоимость использует только UnitTacticalKnowledge выбранного бойца и не выдаёт скрытое объективное знание за известное.
- Непроходимость отделена от числовой цены; никакой вес не делает воду без моста или блокирующий объект проходимыми.
- Движение курсора читает готовые данные и не увеличивает rebuildCount оверлея внимания или счётчики полей стоимости.
- Не утверждать визуальную проверку без запуска браузера, совпадения SHA и открытия всех ключевых PNG.
- Perception v1 теперь является канонической частью real-wargame-preview; новые ветки восприятия перед merge должны синхронизироваться с актуальной preview.
- Не менять main без отдельного явного GO пользователя.
- Тепловая карта описывает возможность наблюдать клетку и никогда не раскрывает скрытое содержимое клетки.
- Скрытый слой, движение камеры и движение курсора не запускают построение поля видимости.
- Историческая информация хранится только метками контактов; старая тепловая карта не становится памятью местности.
- Поле выбранного бойца хранится в Uint8Array и выводится одним растровым Sprite, а не объектом на каждую клетку.
- Случайность обнаружения детерминирована контактом, ограничена профилем и не зависит от FPS.
- Не переносить feat/view-memory-heatmap-temp в real-wargame-preview без отдельной команды пользователя.
