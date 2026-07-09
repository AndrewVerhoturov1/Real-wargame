# AI Single-Unit Editor — Node-Based Constructor

## Goal

Создать понятный человеку node-based редактор ИИ одиночного юнита, привязанный к существующей RTS wrapper (Real-wargame), где поведение солдата собирается из универсальных нод, проверяется local engine, а первый живой результат виден на тактической карте через выбранного бойца.

Служебная база договора данных — английская. Русский текст хранится overlay-полями `*Ru` и выводится в пользовательском интерфейсе.

## Current focus

Текущий этап: **вертикальный goal-срез “редактор нод → выбранный боец на карте”**.

Сейчас уже есть:

```text
чистый AI Node Editor canvas: только Старт/root;
универсальная палитра без старых точечных legacy-нод;
человеческие панели настройки нод без обязательного JSON на первом уровне;
селекторы вместо ручного псевдокода там, где набор значений конечный;
общий cooldown у каждой ноды: cooldownSeconds + cooldownTiming before/after;
цепочки универсальных нод, например Проверка флага → Реплика бойца → Поза;
local engine validation/evaluate-once для универсального графа;
AI Game Bridge, который читает graph из localStorage v6 и прогоняет его для выбранного бойца;
видимый результат в игре: реплика над бойцом, поза/действие в behaviorRuntime;
общий тихий запуск игры + редактора + local engine через Run-Real-Wargame-Lab.bat;
общее меню в игре и редакторе;
исправление бага, где выбор select в человеческой панели мгновенно сбрасывался из-за лишнего document-click rerender.
```

## Key decisions

- Node editor не является самостоятельным generic framework; он привязан к data contract с RTS wrapper.
- Первая версия — только одиночный юнит (single-unit); squad-level AI отложен.
- Не переписывать существующую RTS симуляцию; node editor работает через существующие `BehaviorModel`, `UnitModel`, `SimulationState`, `GameHudControls`.
- Поведение описывается графом нод: flow + conditions + scores + tactical queries + actions + memory/debug.
- Старые точечные ноды (`HasOrder`, `UnderFire`, `CoverNearby`, `FindBestCover`, `MoveToCover`, `ContinueOrder`, `Observe` и похожие) не возвращать, если их можно выразить универсальными нодами.
- Тяжёлые расчёты ИИ выполняет local engine. Браузерная вкладка редактирует граф, показывает подсказки, отправляет validation/evaluate-once и исполняет лёгкий bridge для выбранного бойца.
- AI Node Editor открывается в новой вкладке/entrypoint, не смешивается с текущим tactical board UI.
- Английский base обязателен для data contract: `label`, `description`, `displayName`, `reason`, `explanation`. Русский overlay: `labelRu`, `descriptionRu`, `displayNameRu`, `reasonRu`, `explanationRu`.
- Браузер не пишет JSON прямо в repo-файлы; authoring использует `localStorage v6` + JSON export/import.
- Общий запуск должен быть удобным для человека: один `.bat`, тихие процессы, меню “игра ↔ редактор”, общий `Выход`.
- Вкладки браузера закрываются best-effort: `window.close()` может быть запрещён браузером для вручную открытых вкладок, но процессы должны гаситься через local lab manager.

## Read first

1. `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
2. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
3. `docs/subprojects/ai-single-unit-editor/subproject.json`
4. `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
5. `docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`
6. `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`
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
- `src/ai-node-editor/human-node-ui.ts`
- `src/ai-node-editor/editor-click-guard.ts`
- `src/ai-node-editor/ai-node-editor.css`
- `src/ai-node-editor/ai-node-editor-authoring.css`
- `src/ai-node-editor/ai-node-editor-visual-fix.css`
- `src/ai-node-editor/human-node-ui.css`
- `scripts/ai_node_editor_smoke.mjs`
- `Run-AI-Node-Editor.bat`
- `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`

## Current game-bridge files

- `src/core/ai/AiGameBridge.ts`
- `src/core/behavior/BehaviorModel.ts`
- `src/rendering/HtmlOverlayRenderer.ts`
- `src/ai-game-bridge.css`
- `src/main.ts`

## Current common-launch/menu files

- `Run-Real-Wargame-Lab.bat`
- `lab-launch.html`
- `scripts/real_wargame_lab_manager.mjs`
- `src/shared/AppShellMenu.ts`
- `src/shared/app-shell-menu.css`
- `package.json` (`lab:manager`, `engine:dev`, `dev`, `editor:smoke`)

## Universal node catalog

Текущая палитра должна оставаться простой и универсальной:

```text
Числовой порог / BlackboardValueAbove
Проверка флага / FlagCheck
Порог расстояния / DistanceCheck
Тактическая проверка / TacticalCheck
Оценка параметра / ParameterScore
Оценка расстояния / DistanceScore
Поиск объекта / FindBestObject
Выбор цели / SelectTarget
Запись памяти / WriteMemory
Копия памяти / CopyMemory
Действие / SetAction
Режим движения / SetMovementMode
Поза / SetPosture
Реплика бойца / SayMessage
Стабильный порог / StableThreshold
Запрет действия / ForbidAction
Объяснение / WriteReason
```

## Current live bridge scope

AI Game Bridge сейчас работает только как первый вертикальный срез:

```text
берёт выбранного бойца;
строит blackboard из текущей игры;
читает graph из real-wargame.ai-node-editor.graph.v6;
прогоняет граф примерно раз в 0.6 секунды;
исполняет часть универсальных нод;
показывает SayMessage над бойцом;
меняет posture/currentAction/order для простых действий.
```

Поддержано в живом bridge:

```text
Root / Sequence / Selector / UtilitySelector / ActionBranch;
FlagCheck;
BlackboardValueAbove;
DistanceCheck;
TacticalCheck;
FindBestObject;
WriteMemory / CopyMemory;
SetPosture;
SetAction;
SetMovementMode;
SayMessage;
WriteReason;
cooldownSeconds / cooldownTiming.
```

Ограничение: scoring-ноды пока только приняты как допустимые, но не дают полноценный utility selector. Это следующий крупный этап.

## Known browser/UI caveat

Был баг: при выборе пункта в `select` человеческой панели значение сразу сбрасывалось. Причина — document-level click handler закрывал контекстное меню и делал rerender даже при клике по полям ноды.

Текущее исправление: `src/ai-node-editor/editor-click-guard.ts` грузится до `main.ts` и защищает клики внутри `.human-node-panel`, `.inspector-panel`, `.app-shell-menu`, `select`, `input`, `textarea` от лишнего document-click rerender.

Если баг вернётся, первым делом смотреть:

```text
ai-node-editor.html order of scripts;
src/ai-node-editor/editor-click-guard.ts;
installEventHandlers() / closeContextMenuIfNeeded() in src/ai-node-editor/main.ts;
MutationObserver + renderHumanInspectorForSelectedNode() in src/ai-node-editor/human-node-ui.ts.
```

## Boundaries

- Не переписывать всю RTS-симуляцию: node editor только надстройка над существующим `SimulationState`, `BehaviorModel`, `UnitModel`.
- Не делать сразу squad-level AI: первая версия ограничена одним юнитом.
- Не делать отвязанный generic node framework без data contract: редактор осмыслен только в связке с RTS wrapper.
- Не возвращать старые одноразовые legacy-ноды, если универсальные ноды уже покрывают их смысл.
- Не выполнять тяжёлые расчёты ИИ в браузерной вкладке.
- Не изменять core/rendering/input разделение; `core` не должен импортировать PixiJS.
- Не ломать экспорт/загрузку JSON сцены и существующий редактор карт.
- Не сохранять JSON прямо в repo-файлы из браузера; пока только download/upload и localStorage.

## Testing

Основной пользовательский запуск:

```text
Run-Real-Wargame-Lab.bat
```

Диагностические проверки:

```text
Run-AI-Node-Editor.bat
Run-AI-Engine-Smoke.bat
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
python scripts/subproject_context.py ai-single-unit-editor --brief
python scripts/subproject_context.py ai-single-unit-editor --opencode
python scripts/subproject_context.py ai-single-unit-editor --files
```

Ручная проверка:

```text
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
```

Важно: после правок UI не утверждать “проверено глазами”, если не запускались браузер/скриншоты. Если скриншоты нужны, использовать существующий Playwright/GitHub Actions screenshot workflow и реально смотреть PNG artifact.
