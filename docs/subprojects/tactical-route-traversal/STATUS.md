<!-- GENERATED FILE. Edit docs/subprojects/tactical-route-traversal/subproject.json, then run npm run docs:generate. -->
# Tactical Route Traversal — Posture, Movement and Attention Planning — Current Status

- **ID:** `tactical-route-traversal`
- **Status:** `active`
- **Updated:** 2026-07-20
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Добавить после A* отдельное детерминированное планирование способа прохождения готового маршрута: физический профиль движения, позу, направление корпуса, внимание, объяснения и ограниченную асинхронную подготовку без второго поля укрытий и без тяжёлой работы каждый кадр.

## Current focus

Реализация находится в feature/20260720-tactical-route-traversal от preview HEAD 5070ce210862c1e997dada4a22c53866676f3bcc: добавлены общий расчёт позы, ограниченный планировщик, служба точной идентичности, MoveOrder/runtime-интеграция, сериализация и снимок отображения. Исправление высоты лежащих и пригнувшихся целей выполняется параллельно; эта механика читает готовое общее поле и не дублирует LOS.

## Next step

На машине с полной локальной копией выполнить разрешённую матрицу TypeScript, smoke и production build; затем, только после отдельного разрешения, проверить в браузере цвета участков, штрихи движения, стрелки корпуса и сектора внимания. Не переносить ветку в preview до отдельного явного решения.

## Read first

- `docs/subprojects/ai-single-unit-editor/TACTICAL_ROUTE_TRAVERSAL_V1.md`
- `docs/superpowers/plans/2026-07-20-tactical-route-traversal.md`
- `docs/performance/PERFORMANCE_PRINCIPLES.md`
- `.agents/skills/real-wargame-performance/SKILL.md`
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- `.agents/skills/real-wargame-pixijs/SKILL.md`

## Main files

- `src/core/tactical/TacticalPostureEvaluation.ts`
- `src/core/navigation/TacticalTraversalPlan.ts`
- `src/core/navigation/TacticalTraversalProfile.ts`
- `src/core/navigation/TacticalTraversalPlanner.ts`
- `src/core/navigation/TacticalTraversalPlanningService.ts`
- `src/core/navigation/TacticalTraversalRuntime.ts`
- `src/core/orders/MoveOrder.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/rendering/CommandPlanRouteOverlayModel.ts`
- `src/rendering/PixiOrderRenderer.ts`

## Suggested verification

- `npx tsc --noEmit`
- `npm run tactical-position:smoke`
- `npm run tactical-query:smoke`
- `npm run routed-move:smoke`
- `npm run movement-facing:smoke`
- `npm run navigation-profile-switch:smoke`
- `npm run command-plan-route:smoke`
- `npm run tactical-traversal:smoke`
- `npm run docs:check`
- `npm run docs:smoke`
- `npm run build`

## Safety rules

- Не изменять real-wargame-preview или main без отдельного явного разрешения.
- Не запускать GitHub Actions, Playwright или деплой без отдельного разрешения.
- SimulationTickLegacy остаётся единственным владельцем координат бойца.
- Не создавать второе поле опасности или укрытий и не запускать A* для каждой позы.
- Не связывать расчёт с FPS, wall-clock временем или скоростью процессора.
- Не встраивать в эту ветку параллельное исправление LOS-высоты лежащих и пригнувшихся целей; использовать готовые исправленные данные общего поля.
