# AI Single-Unit Editor — Node-Based Constructor

## Goal

Создать node-based редактор ИИ одиночного юнита, привязанный к существующей RTS wrapper (Real-wargame), где поведение солдата собирается из нод, опирается на существующие `BehaviorModel`, `UnitModel`, `GameHudControls`, `SimulationState` и roadmap Soldier Behavior Lab, а тяжёлые расчёты выполняет локальный движок, не браузерная вкладка.

## Current focus

Этап 1: data contract для AI-графа одиночного солдата. Уже нужен не визуальный редактор, а устойчивый JSON-договор: типы нод, blackboard, первый `soldier_default_survival_graph.json` и headless validation. Следующие этапы: local engine host, новая вкладка `ai-node-editor.html`, затем подключение Soldier Survival Brain к одному солдату.

## Key decisions

- Node editor не является самостоятельным generic framework; он привязан к data contract с RTS wrapper.
- Первая версия — только одиночный юнит (single-unit); squad-level AI отложен.
- Не переписывать существующую RTS симуляцию; node editor работает через существующие `BehaviorModel`, `UnitModel`, `SimulationState`, `GameHudControls`.
- Поведение описывается графом нод: flow + conditions + scores + tactical queries + actions + blackboard/debug.
- Тяжёлые расчёты ИИ выполняет local engine, а браузерная вкладка только редактирует граф, отправляет его на проверку и показывает объяснения.
- AI Node Editor открывается в новой вкладке/entrypoint, не смешивается с текущим tactical board UI.

## Read first

1. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
2. `docs/subprojects/ai-single-unit-editor/subproject.json`
3. `docs/subprojects/ai-single-unit-editor/JOURNAL.md` (если существует)
4. `docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`
5. `python scripts/subproject_context.py ai-single-unit-editor --brief`
6. `docs/subprojects/real-wargame-start/ROADMAP_SOLDIER_BEHAVIOR_LAB.md`
7. `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`

## Current data-contract files

- `src/core/ai/AiGraph.ts`
- `src/core/ai/AiNodeTypes.ts`
- `src/core/ai/AiBlackboard.ts`
- `src/core/ai/AiGraphValidation.ts`
- `src/data/ai/soldier_default_survival_graph.json`
- `scripts/validate_ai_graph.mjs`

## Boundaries

- Не переписывать всю RTS-симуляцию: node editor только надстройка над существующим `SimulationState`, `BehaviorModel`, `UnitModel`.
- Не делать сразу squad-level AI: первая версия ограничена одним юнитом.
- Не делать отвязанный generic node framework без data contract: редактор осмыслен только в связке с RTS wrapper.
- Не выполнять тяжёлые расчёты ИИ в браузерной вкладке: браузер показывает и редактирует, local engine считает.
- Не изменять core/rendering/input разделение; `core` не должен импортировать PixiJS.
- Не ломать экспорт/загрузку JSON сцены и существующий редактор карт.

## Testing

На этапе data contract основная проверка:

```text
npm run validate:ai-graph
npm run build
```

`validate:ai-graph` проверяет bundled JSON-граф без браузера. `build` проверяет TypeScript-контракт и существующую Vite-сборку.
