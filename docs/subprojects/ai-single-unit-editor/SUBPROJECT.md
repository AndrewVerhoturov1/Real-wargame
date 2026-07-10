# AI Single-Unit Editor — Node-Based Constructor and Tactical Awareness Lab

## Goal

Создать понятную человеку лабораторию поведения одиночного бойца, привязанную к существующей RTS wrapper Real-wargame.

В лаборатории пользователь должен иметь возможность:

```text
собрать поведение из универсальных AI-нод;
проверить граф через local engine;
исполнить граф для выбранного бойца на реальной тактической карте;
задать бойца, угрозы, укрытия, лес и рельеф;
увидеть субъективную память угроз конкретного бойца;
увидеть его личную карту опасности и безопасных позиций;
передать эти данные в UtilitySelector / GraphRunner;
понять, почему боец принял решение.
```

Служебная база data contract — английская. Русский текст хранится overlay-полями `*Ru` и показывается пользователю.

## Current focus

Текущий этап: **single-unit tactical awareness v1**.

Вертикальный срез сейчас выглядит так:

```text
AI Node Editor
→ graph v6
→ AiGameBridge
→ blackboard реального выбранного бойца
→ личная память угроз и awareness report
→ AiGraphRunner + UtilitySelector
→ effects / score / trace / explanation
→ видимый результат на карте и debug overlay в редакторе нод.
```

## Current state

Уже работает:

```text
чистый AI Node Editor canvas с root/Старт;
универсальная палитра без заменимых legacy-нод;
человеческие панели настройки нод;
общий cooldown до/после ноды;
local engine validation и evaluate-once;
чистый src/core/ai/AiGraphRunner.ts;
UtilitySelector v1 со score-нода́ми и veto;
AiGameBridge для выбранного бойца;
runtime trace и подсветка решения;
общий тихий запуск Run-Real-Wargame-Lab.bat;
единый игровой редактор сцены Stage 6;
встроенный AI Test Lab без перекрытия карты;
верхние инструменты размещения;
интерактивные ручки направленной угрозы;
разделение постоянных, начальных и текущих параметров бойца;
укрытия против стрелкового оружия с силой, надёжностью и маскировкой;
учёт предметов, леса и рельефа;
индивидуальная память угроз с confidence и uncertainty;
личная awareness grid выбранного бойца;
режимы danger / cover / safe / uncertainty / objective;
передача awareness-показателей в blackboard GraphRunner;
реальная Playwright-проверка 20 кадров.
```

## Key decisions

- Node editor не является отвязанным generic framework; он привязан к RTS data contract.
- Первая версия — только одиночный выбранный юнит. Squad-level AI отложен.
- Не переписывать существующую RTS-симуляцию; использовать `SimulationState`, `BehaviorModel`, `UnitModel`.
- `AiGraphRunner.ts` не импортирует PixiJS, DOM, localStorage или `SimulationState`.
- `AiGameBridge.ts` является адаптером: graph + blackboard + tacticalHost + application effects.
- Тяжёлые расчёты не должны выполняться в UI-рендере каждый кадр.
- Awareness субъективна для конкретного бойца и строится по его знаниям, а не по полной информации мира.
- Маскировка, физическая защита и вероятность геометрического закрытия — разные понятия.
- Старые точечные legacy-ноды не возвращать, если их смысл выражается универсальными нодами.
- Браузер не пишет JSON прямо в repo; authoring использует localStorage v6 + export/import.
- Основной запуск для человека — один `.bat`, без терминала.
- `main` не менять без явного GO пользователя.

## Read first

1. `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
2. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
3. `docs/subprojects/ai-single-unit-editor/subproject.json`
4. `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
5. `docs/ai/AGENT_START_HERE.md`
6. `AGENTS.md`
7. `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
8. `.agents/skills/real-wargame-local-preview/SKILL.md` — если есть запуск/скриншоты/UI
9. `docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md`
10. `docs/superpowers/plans/2026-07-10-soldier-tactical-awareness-lab.md`
11. `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`
12. `docs/manual-test/AI_TEST_LAB_STAGE_5.md`
13. `docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md`
14. `docs/subprojects/real-wargame-start/ROADMAP_SOLDIER_BEHAVIOR_LAB.md`
15. `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`

## Architecture

### AI graph

```text
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGameBridge.ts
src/data/ai/soldier_default_survival_graph.json
```

### Local engine

```text
scripts/ai_engine_core.mjs
scripts/local_ai_engine.mjs
scripts/local_ai_engine_smoke.mjs
Run-AI-Engine.bat
Run-AI-Engine-Smoke.bat
```

### AI Node Editor

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/human-node-ui.ts
src/ai-node-editor/editor-click-guard.ts
src/ai-node-editor/runtime-debug-overlay.ts
src/ai-node-editor/ai-node-editor.css
src/ai-node-editor/ai-node-editor-authoring.css
src/ai-node-editor/ai-node-editor-visual-fix.css
src/ai-node-editor/human-node-ui.css
scripts/ai_node_editor_smoke.mjs
Run-AI-Node-Editor.bat
```

### Tactical awareness

```text
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/SoldierAwarenessGrid.ts
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/pressure/PressureZone.ts
src/core/pressure/ThreatEvaluation.ts
src/core/units/UnitModel.ts
src/core/behavior/BehaviorModel.ts
```

### AI Test Lab

```text
src/core/testing/AiLabRuntime.ts
src/core/testing/AiLabInteraction.ts
src/ui/AiTestLabControls.ts
src/input/BoardInputController.ts
src/rendering/PixiThreatEditorRenderer.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
src/ai-test-lab.css
scripts/ai_test_lab_smoke.mjs
```

### Unified game editor

```text
src/core/editor/GameEditorDrafts.ts
src/core/editor/GameEditorPlacement.ts
src/ui/GameEditorWorkbench.ts
src/game-editor.css
scripts/game_editor_smoke.mjs
```

### Common launch and menu

```text
Run-Real-Wargame-Lab.bat
lab-launch.html
scripts/real_wargame_lab_manager.mjs
src/shared/AppShellMenu.ts
src/shared/app-shell-menu.css
```

## Universal node catalog

```text
BlackboardValueAbove
FlagCheck
DistanceCheck
TacticalCheck
ParameterScore
DistanceScore
FindBestObject
SelectTarget
WriteMemory
CopyMemory
SetAction
SetMovementMode
SetPosture
SayMessage
StableThreshold
ForbidAction
WriteReason
DecisionInertia
RandomChance
```

Flow nodes:

```text
Root
Sequence
Selector
UtilitySelector
ActionBranch
```

## Current awareness blackboard

`AiGameBridge` передаёт в GraphRunner:

```text
currentPositionDanger
currentExpectedProtection
bestSafePositionScore
distanceToBestSafePosition
routeDanger
threatConfidence
best_cover_position
```

Также доступны старые входы:

```text
danger
stress
suppression
fatigue
morale
health
ammo
distanceToCover
enemyVisible
enemyKnown
underFire
hasOrder
isInCover
weaponReady
directionToThreat
threatDistance
threatAngle
coverProtection
bestCoverQuality
current_action
self_position
order_target_position
retreat_position
current_target
remembered_enemy_position
```

Инфраструктура восприятия готова, но готовое разумное поведение зависит от графа пользователя. Не утверждать, что солдат уже автономно решает все тактические задачи.

## Important runtime rules

- GraphRunner исполняется только для выбранного бойца.
- AI bridge не работает автоматически во время паузы или режима игрового редактора, кроме явного `tickNow/evaluateNow`.
- Awareness map кэшируется и не должна пересчитываться каждый кадр.
- `tacticalKnowledge.revision` меняется только при содержательном изменении знания.
- Постоянные кнопки dock нельзя пересоздавать из-за изменения стресса/морали.
- Активная вкладка полигона определяет приоритет выбора бойца/угрозы/укрытия.
- После drag угрозы должны обновляться и геометрия, и числовые поля.
- Обычное открытое поле не должно отображаться как сильное безопасное укрытие.

## Storage

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
real-wargame.ai-node-editor.debug.v1
```

Старые версии storage не возвращать.

## Scene format

```text
scene-export-v3
```

Старые сцены без новых полей должны загружаться с безопасными значениями по умолчанию.

## Boundaries

- Не переписывать всю RTS-симуляцию.
- Не делать сразу squad-level AI.
- Не запускать AI для всей армии до стабилизации одиночного теста.
- Не возвращать legacy-ноды.
- Не выполнять awareness grid каждый кадр.
- Не считать объективный мир автоматически известным бойцу.
- Не смешивать PixiJS/rendering с core AI.
- Не ломать экспорт/загрузку JSON сцены.
- Не сохранять JSON прямо в repo из браузера.
- Не удалять `editor-click-guard.ts` без замены.
- Не возвращать параллельную установку старых редакторских панелей.
- Не трогать `main` без GO.

## Known limitations

```text
нет настоящей баллистики и повреждений;
нет полноценного enemy AI;
нет обмена знаниями между бойцами;
нет истории N последних решений;
нет вместимости укрытий;
нет распределения нескольких солдат по укрытию;
нет масштабирования awareness на сотни бойцов;
нет полного набора готовых JSON-сценариев;
частично дублируется смысл TS GraphRunner и JS local engine;
готовое поведение зависит от graph, новые входы сами по себе не создают тактику.
```

## Testing

Основной пользовательский запуск:

```text
Run-Real-Wargame-Lab.bat
```

Машинные проверки:

```text
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Контекст подпроекта:

```text
python scripts/subproject_context.py ai-single-unit-editor --brief
python scripts/subproject_context.py ai-single-unit-editor --opencode
python scripts/subproject_context.py ai-single-unit-editor --files
```

Последний полностью проверенный app commit:

```text
665a6a14d45fbce758daf86303155b4d538bff6b
```

Проверка:

```text
core run 29086211637 — passed;
screenshot run 29086211662 — passed;
Playwright 3/3;
20 PNG скачаны, ключевые кадры просмотрены.
```

После app commit до подготовки текущего handoff менялись только документы/idea.

## Next suggested work

1. Провести живую пользовательскую проверку через `Run-Real-Wargame-Lab.bat`.
2. Исправить найденные UI-проблемы и повторить реальный screenshot workflow.
3. Добавить стандартные JSON-сценарии угроз/укрытий/рельефа.
4. Добавить историю последних решений и пошаговый trace.
5. Сделать точные точки занятия укрытия и вместимость.
6. Подключать несколько бойцов и обмен знаниями только после стабилизации одного.
7. Позже сблизить headless JS runner и TypeScript GraphRunner в один источник логики.
