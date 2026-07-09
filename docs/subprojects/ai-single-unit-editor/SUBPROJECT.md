# AI Single-Unit Editor — Node-Based Constructor

## Goal

Создать node-based редактор ИИ одиночного юнита, привязанный к существующей RTS wrapper (Real-wargame), где поведение солдата собирается из нод, опирается на существующие `BehaviorModel`, `UnitModel`, `GameHudControls`, `SimulationState` и roadmap Soldier Behavior Lab, а тяжёлые расчёты выполняет локальный движок, не браузерная вкладка. Служебная база договора данных — английская, русский текст хранится overlay-полями `*Ru`.

## Current focus

Этап 4: authoring AI Node Editor. Редактор уже умеет добавлять ноды из палитры, перетаскивать ноды, связывать выбранную ноду с child, редактировать `displayName/displayNameRu/description/descriptionRu/parameters`, удалять ноды кроме root, хранить рабочий граф и позиции в `localStorage`, экспортировать/импортировать JSON и проверять изменённый граф через local engine. Следующий этап: подключить один живой солдат на карте к выбранному графу через local engine.

## Key decisions

- Node editor не является самостоятельным generic framework; он привязан к data contract с RTS wrapper.
- Первая версия — только одиночный юнит (single-unit); squad-level AI отложен.
- Не переписывать существующую RTS симуляцию; node editor работает через существующие `BehaviorModel`, `UnitModel`, `SimulationState`, `GameHudControls`.
- Поведение описывается графом нод: flow + conditions + scores + tactical queries + actions + blackboard/debug.
- Тяжёлые расчёты ИИ выполняет local engine, а браузерная вкладка только редактирует граф, отправляет его на проверку и показывает объяснения.
- AI Node Editor открывается в новой вкладке/entrypoint, не смешивается с текущим tactical board UI.
- На этапе 4 редактор authoring-capable, но ещё не управляет живым `SimulationTick`.
- Английский base обязателен для data contract: `label`, `description`, `displayName`, `reason`, `explanation`. Русский overlay: `labelRu`, `descriptionRu`, `displayNameRu`, `reasonRu`, `explanationRu`.

## Read first

1. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
2. `docs/subprojects/ai-single-unit-editor/subproject.json`
3. `docs/subprojects/ai-single-unit-editor/JOURNAL.md` (если существует)
4. `docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`
5. `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`
6. `docs/manual-test/AI_NODE_EDITOR_STAGE_3.md`
7. `docs/manual-test/AI_ENGINE_STAGE_2.md`
8. `python scripts/subproject_context.py ai-single-unit-editor --brief`
9. `docs/subprojects/real-wargame-start/ROADMAP_SOLDIER_BEHAVIOR_LAB.md`
10. `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`

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

## Current visible-editor files

- `ai-node-editor.html`
- `src/ai-node-editor/main.ts`
- `src/ai-node-editor/ai-node-editor.css`
- `src/ai-node-editor/ai-node-editor-authoring.css`
- `scripts/ai_node_editor_smoke.mjs`
- `Run-AI-Node-Editor.bat`
- `docs/manual-test/AI_NODE_EDITOR_STAGE_3.md`
- `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`
- `index.html` / `src/main.ts` — кнопка `Редактор ИИ` открывает editor в новой вкладке

## Boundaries

- Не переписывать всю RTS-симуляцию: node editor только надстройка над существующим `SimulationState`, `BehaviorModel`, `UnitModel`.
- Не делать сразу squad-level AI: первая версия ограничена одним юнитом.
- Не делать отвязанный generic node framework без data contract: редактор осмыслен только в связке с RTS wrapper.
- Не выполнять тяжёлые расчёты ИИ в браузерной вкладке: браузер показывает и редактирует, local engine считает.
- Не изменять core/rendering/input разделение; `core` не должен импортировать PixiJS.
- Не ломать экспорт/загрузку JSON сцены и существующий редактор карт.
- Не сохранять JSON прямо в repo-файлы из браузера; пока только download/upload и localStorage.

## Testing

На этапе 4 основная проверка:

```text
Run-AI-Node-Editor.bat
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

`Run-AI-Node-Editor.bat` запускает local engine, Vite dev-server и открывает `/ai-node-editor.html`. `editor:smoke` проверяет entrypoint/editor files, English base + Russian overlay и наличие authoring-функций без браузера.
