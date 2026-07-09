# AI Single-Unit Editor — Node-Based Constructor

## Goal

Создать node-based редактор ИИ одиночного юнита, привязанный к существующей RTS wrapper (Real-wargame), где поведение солдата собирается из нод, опирается на существующие `BehaviorModel`, `UnitModel`, `GameHudControls`, `SimulationState` и roadmap Soldier Behavior Lab, а тяжёлые расчёты выполняет локальный движок, не браузерная вкладка.

## Current focus

Этап 2: headless local AI engine. Уже есть JSON-договор графа, первый `soldier_default_survival_graph.json`, проверка `validate:ai-graph`, локальный Node.js engine с endpoint-ами health / validate / evaluate-once и батники для ручной проверки. Следующие этапы: новая вкладка `ai-node-editor.html`, статус подключения к engine, затем подключение Soldier Survival Brain к одному солдату.

## Key decisions

- Node editor не является самостоятельным generic framework; он привязан к data contract с RTS wrapper.
- Первая версия — только одиночный юнит (single-unit); squad-level AI отложен.
- Не переписывать существующую RTS симуляцию; node editor работает через существующие `BehaviorModel`, `UnitModel`, `SimulationState`, `GameHudControls`.
- Поведение описывается графом нод: flow + conditions + scores + tactical queries + actions + blackboard/debug.
- Тяжёлые расчёты ИИ выполняет local engine, а браузерная вкладка только редактирует граф, отправляет его на проверку и показывает объяснения.
- AI Node Editor открывается в новой вкладке/entrypoint, не смешивается с текущим tactical board UI.
- На этапе 2 local engine ещё не управляет живым солдатом в `SimulationTick`; он проверяет graph validation и один расчёт evaluate-once через localhost API.

## Read first

1. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
2. `docs/subprojects/ai-single-unit-editor/subproject.json`
3. `docs/subprojects/ai-single-unit-editor/JOURNAL.md` (если существует)
4. `docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`
5. `docs/manual-test/AI_ENGINE_STAGE_2.md`
6. `python scripts/subproject_context.py ai-single-unit-editor --brief`
7. `docs/subprojects/real-wargame-start/ROADMAP_SOLDIER_BEHAVIOR_LAB.md`
8. `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`

## Current data-contract files

- `src/core/ai/AiGraph.ts`
- `src/core/ai/AiNodeTypes.ts`
- `src/core/ai/AiBlackboard.ts`
- `src/core/ai/AiGraphValidation.ts`
- `src/data/ai/soldier_default_survival_graph.json`
- `scripts/validate_ai_graph.mjs`

## Current local-engine files

- `scripts/ai_engine_core.mjs`
- `scripts/local_ai_engine.mjs`
- `scripts/local_ai_engine_smoke.mjs`
- `Run-AI-Engine.bat`
- `Run-AI-Engine-Smoke.bat`
- `docs/manual-test/AI_ENGINE_STAGE_2.md`

## Boundaries

- Не переписывать всю RTS-симуляцию: node editor только надстройка над существующим `SimulationState`, `BehaviorModel`, `UnitModel`.
- Не делать сразу squad-level AI: первая версия ограничена одним юнитом.
- Не делать отвязанный generic node framework без data contract: редактор осмыслен только в связке с RTS wrapper.
- Не выполнять тяжёлые расчёты ИИ в браузерной вкладке: браузер показывает и редактирует, local engine считает.
- Не изменять core/rendering/input разделение; `core` не должен импортировать PixiJS.
- Не ломать экспорт/загрузку JSON сцены и существующий редактор карт.

## Testing

На этапе 2 основная проверка:

```text
Run-AI-Engine-Smoke.bat
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

`Run-AI-Engine-Smoke.bat` запускает local engine, проверяет `/engine/health`, `/ai/graph/validate`, `/ai/graph/evaluate-once` и сохраняет JSON-отчёты в `artifacts/ai-engine/`.
