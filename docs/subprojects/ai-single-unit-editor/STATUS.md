<!-- GENERATED FILE. Edit docs/subprojects/ai-single-unit-editor/subproject.json, then run npm run docs:generate. -->
# AI Single-Unit Editor — Stateful Tactical Awareness Lab — Current Status

- **ID:** `ai-single-unit-editor`
- **Status:** `active`
- **Updated:** 2026-07-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `e5b5e6f0f964ebc7d25e023a92c4e0d9c01b6735`

## Goal

Создать понятную человеку лабораторию поведения одиночного бойца в RTS-основе Real-wargame: Utility AI выбирает действие, состоянийный runtime исполняет длительные шаги, а решения используют субъективную тактическую осведомлённость и территориальный контекст.

## Current focus

Stateful AI Movement v1 внедрён и проверен: MoveToBlackboardPosition замораживает цель Blackboard, один раз создаёт token-owned MoveOrder, физически движется через SimulationTick, возвращает running между тиками, завершает последовательность по прибытии и безопасно отменяется без удаления нового приказа игрока. Следующий этап — Reactive Abort + Route Status v1 и затем pathfinding.

## Next step

Реализовать Reactive Abort + Route Status v1: реактивно отменять или перестраивать движение при новом приказе, исчезновении укрытия, блокировке маршрута или критическом изменении угрозы; затем добавить настоящий grid pathfinder.

## Read first

- `docs/subprojects/ai-single-unit-editor/STATUS.md`
- `docs/ai/WEB_CHAT_START.md`
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
- `docs/subprojects/ai-single-unit-editor/STATEFUL_RUNTIME_V1.md`
- `docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md`
- `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
- `docs/subprojects/ai-single-unit-editor/subproject.json`
- `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
- `docs/subprojects/ai-single-unit-editor/journal/2026-07-12-stateful-movement-v1.md`
- `docs/superpowers/specs/2026-07-12-ai-running-move-v1-design.md`
- `docs/superpowers/plans/2026-07-12-ai-running-move-v1.md`
- `ideas/AI_BEHAVIOR_NODE_SYSTEM_FEATURES.md`
- `ideas/FRONT_LINE_INFLUENCE_ON_SINGLE_SOLDIER_AI.md`
- `docs/ai/AGENT_START_HERE.md`
- `AGENTS.md`
- `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- `.agents/skills/real-wargame-local-preview/SKILL.md`

## Main files

- `src/main.ts`
- `src/core/ai/AiGraphRunner.ts`
- `src/core/ai/AiGraphRuntime.ts`
- `src/core/ai/AiGameBridge.ts`
- `src/core/ai/AiStatefulMoveGameBridge.ts`
- `src/core/ai/AiGraph.ts`
- `src/core/ai/AiNodeTypes.ts`
- `src/core/ai/AiBlackboard.ts`
- `src/core/ai/AiGraphValidation.ts`
- `src/core/orders/MoveOrder.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ai-node-editor/stateful-node-ui.ts`
- `src/ai-node-editor/stateful-move-debug.ts`
- `src/ai-node-editor/runtime-debug-overlay.ts`
- `scripts/ai_graph_runtime_smoke.ts`
- `scripts/ai_stateful_move_bridge_smoke.ts`
- `tests/ai-running-runtime.spec.ts`
- `tests/ai-running-move.spec.ts`
- `src/core/front/FrontZoneState.ts`
- `src/ui/FrontZoneControls.ts`
- `tests/front-zones.spec.ts`
- `ideas/AI_BEHAVIOR_NODE_SYSTEM_FEATURES.md`
- `ideas/FRONT_LINE_INFLUENCE_ON_SINGLE_SOLDIER_AI.md`
- `Run-Real-Wargame-Lab.bat`
- `package.json`

## Suggested verification

- `npm run runtime:smoke`
- `npm run move-bridge:smoke`
- `npm run workspace:smoke`
- `npm run lab:smoke`
- `npm run game-editor:smoke`
- `npm run editor:smoke`
- `npm run engine:smoke`
- `npm run validate:ai-graph`
- `npm run build`
- `tests/ai-running-move.spec.ts`
- `tests/ai-running-runtime.spec.ts`
- `.agents/skills/real-wargame-local-preview/SKILL.md`

## Safety rules

- Не переписывать всю RTS-симуляцию.
- Не возвращать отдельный установленный AI Test Lab UI.
- Не смешивать simulation input с editor input.
- Не запускать graph для всей армии до стабилизации одного бойца.
- Не возвращать legacy-ноды.
- Не пересчитывать awareness каждый кадр.
- Не считать объективный мир известным бойцу.
- Не приравнивать territorySafety к current danger.
- Не превращать фронт в постоянно пересчитываемую карту влияния.
- Не рисовать фронт тысячами клеток.
- Не использовать editor-scene-tools-slot для постоянной панели фронта.
- Не менять наблюдаемый DOM из MutationObserver бесконечным циклом.
- Не добавлять длительное действие без корректной очистки при cancel.
- Не очищать MoveOrder без проверки ownerToken.
- Не скрывать следующий effect последовательности поздней очисткой движения.
- Не считать прямолинейное движение готовым pathfinding.
- Не утверждать визуальную проверку без реального браузера и просмотра PNG.
- Не менять main без явного GO пользователя.
