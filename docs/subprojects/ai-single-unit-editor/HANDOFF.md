# Handoff — AI Single-Unit Editor

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Главное правило: `main` не трогать без явного GO человека.

## Что нужно понять сразу

Это подпроект для игры Real-wargame: редактор ИИ одиночного солдата через универсальные ноды.

Текущий рабочий результат после GraphRunner-перехода:

```text
игра запускается;
редактор нод запускается;
редактор и игра связаны через localStorage v6;
выбранный боец на карте исполняет граф через отдельный AiGraphRunner;
AiGameBridge больше не является главным исполнителем графа — он только адаптер игра↔runner;
UtilitySelector v1 реально оценивает дочерние ActionBranch по score-ноды;
ParameterScore, DistanceScore, DecisionInertia, RandomChance, StableThreshold и ForbidAction участвуют в выборе/отсечении веток;
GraphRunner возвращает effects, scores, trace, explanation, blackboard и cooldowns;
bridge применяет effects к выбранному бойцу: move_to, posture, movement_mode, speech, reason, memory;
local engine evaluate-once использует тот же смысл GraphRunner v1, а не старый поиск первой action-like ноды;
общий тихий запуск игры + редактора + local engine остаётся через Run-Real-Wargame-Lab.bat;
общее меню игра↔редактор↔выход остаётся прежним.
```

Пользователь ранее подтвердил: связка редактор↔игра работает. Последний UI-баг с мгновенным сбросом `select` исправлен через `src/ai-node-editor/editor-click-guard.ts`; этот guard не удалять без замены архитектуры document-click handling.

## Как продолжать работу

Перед любой правкой читать:

```text
docs/subprojects/ai-single-unit-editor/HANDOFF.md
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/JOURNAL.md
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
```

Для быстрого машинного контекста:

```text
python scripts/subproject_context.py ai-single-unit-editor --brief
python scripts/subproject_context.py ai-single-unit-editor --opencode
python scripts/subproject_context.py ai-single-unit-editor --files
```

## Основной пользовательский запуск

```text
Run-Real-Wargame-Lab.bat
```

Он поднимает Vite, local AI engine и скрытый lab manager, затем открывает `lab-launch.html`, игру и AI Node Editor.

Служебные порты:

```text
5173 — Vite app/game/editor;
8787 — local AI engine;
8799 — lab manager: /lab/health, /lab/open, /lab/shutdown.
```

## Текущий graph storage

Используется только новый storage:

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
```

Старые `graph.v5` и ниже не поднимать.

Bundled graph:

```text
src/data/ai/soldier_default_survival_graph.json
```

Он должен начинаться с одной ноды:

```text
root / Root / Старт
children: []
```

Старого дерева survival/continue/observe быть не должно.

## Универсальные ноды

В палитре оставить простой универсальный набор:

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

Не возвращать legacy-ноды, если их уже покрывают универсальные:

```text
HasOrder → FlagCheck: hasOrder=true
EnemyVisible → FlagCheck: enemyVisible=true
EnemyKnown → FlagCheck: enemyKnown=true
UnderFire → FlagCheck: underFire=true
CoverNearby → TacticalCheck: cover_exists=true или FindBestObject: cover
FindBestCover → FindBestObject: objectKind=cover
MoveToCover → SetAction: move_to + targetKey=best_cover_position
ContinueOrder → SetAction: continue_order
Observe → SetAction: wait или будущий отдельный mode/action
DangerAbove / StressAbove → BlackboardValueAbove + sourceKey
```

## GraphRunner v1

Ключевой файл:

```text
src/core/ai/AiGraphRunner.ts
```

Он сейчас:

```text
не импортирует PixiJS;
не импортирует SimulationState;
не читает localStorage/window/document;
получает graph + unitId + blackboard + cooldowns + nowMs + tacticalHost;
исполняет Root / Sequence / Selector / UtilitySelector / ActionBranch;
возвращает effects вместо прямого изменения бойца;
возвращает scores, trace, explanation, blackboard и cooldowns;
умеет выбирать лучшую ветку UtilitySelector по score;
умеет отсекать ветку через ForbidAction;
умеет StableThreshold через memory-key stable:<nodeId>;
учитывает cooldownSeconds/cooldownTiming.
```

Смысл разделения:

```text
GraphRunner думает и возвращает результат;
AiGameBridge применяет результат к текущей игре;
local engine использует тот же смысл evaluate-once для headless проверки.
```

## UtilitySelector v1

Теперь `UtilitySelector` не просто пробует детей как обычный Selector. Он:

```text
берёт дочерние ActionBranch;
прогоняет условия и tactical/query/memory ноды внутри ветки;
собирает score breakdown от score-нод;
помечает veto, если ForbidAction запрещает действие ветки;
выбирает проходящую не-veto ветку с максимальным score;
при равенстве фактически остаётся порядок детей как стабильный tie-break.
```

Поддержанные score/decision-ноды v1:

```text
ParameterScore — добавляет/вычитает значение blackboard-параметра * weight;
DistanceScore — даёт баллы от дистанции до цели/укрытия;
DecisionInertia — добавляет bonus, если current_action совпадает с action;
RandomChance — даёт детерминированную pseudo-random добавку probability-roll;
StableThreshold — включает/держит условие по enter/exit threshold;
ForbidAction — veto для ветки, если она пытается выполнить запрещённое action.
```

Ограничение: это ещё не финальная Utility AI система всей игры. Это v1 для выбранного бойца и проверки node-graph контракта.

## AI Game Bridge

Ключевой файл:

```text
src/core/ai/AiGameBridge.ts
```

Он сейчас:

```text
берёт выбранного бойца из SimulationState;
не работает в editor.enabled;
читает graph из localStorage v6;
строит blackboard из реальной игры;
создаёт tacticalHost callbacks для runner;
вызывает runAiGraph(...);
примерно раз в 0.6 секунды;
применяет effects runner-а к UnitModel/behaviorRuntime;
записывает aiGraphReason/reason/lastEvent;
хранит runtime memory динамически на behaviorRuntime для WriteMemory/StableThreshold.
```

Blackboard содержит примерно:

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
current_action
self_position
order_target_position
retreat_position
best_cover_position
current_target
remembered_enemy_position
```

Живое применение effects сейчас поддерживает:

```text
set_action: move_to / wait / continue_order / другие action-метки;
set_posture: stand / crouch / prone;
set_movement_mode;
say_message;
write_reason;
write_memory.
```

## Local engine

Ключевые файлы:

```text
scripts/ai_engine_core.mjs
scripts/local_ai_engine.mjs
scripts/local_ai_engine_smoke.mjs
```

`evaluate-once` теперь не ищет первую action-like ноду. Он прогоняет GraphRunner-подобную headless-логику:

```text
чистый root-only graph → valid=true, command.type=none;
тестовый UtilitySelector graph → выбирается лучшая ветка по score;
scores/breakdown/effects/trace возвращаются в JSON.
```

`engine:smoke` больше не должен ждать старую ветку `critical_survival`.

## Как быстро проверить текущую фичу руками

1. Запустить:

```text
Run-Real-Wargame-Lab.bat
```

2. В редакторе собрать простой граф:

```text
Старт
  → Лучший выбор
      → Вариант действия: лечь под огнём
          → Проверка флага: underFire=true
          → Оценка параметра: danger positive weight=1
          → Реплика бойца: Под огнём!
          → Поза: prone
      → Вариант действия: продолжать приказ
          → Проверка флага: hasOrder=true
          → Оценка параметра: morale positive weight=1
          → Действие: continue_order
```

3. Нажать `Save parameters` у каждой ноды.
4. Открыть игру, выбрать бойца под давлением/огнём.
5. Ожидание:

```text
над бойцом появляется фраза;
поза меняется на prone;
если есть конкурирующие ветки — UtilitySelector выбирает ветку с большим score;
граф не сбрасывается;
select в панели ноды можно выбирать без мгновенного отката.
```

## Проверки перед заявлением “готово”

Минимум для кодовой правки:

```text
npm run editor:smoke
npm run validate:ai-graph
npm run build
```

Для engine:

```text
npm run engine:smoke
```

Для ручной проверки:

```text
Run-Real-Wargame-Lab.bat
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
```

Если задача про визуал или UI, не утверждать “проверил глазами”, пока реально не открыт браузер или не просмотрены PNG из Playwright/GitHub Actions artifact. В текущей GraphRunner-задаче скриншоты специально не делались.

## Что делать дальше

Ближайшие разумные задачи:

```text
1. Сделать визуальный debug: какая нода прошла/провалилась, какая ветка победила и почему.
2. Сделать сохранение простых параметров сразу или явную подсветку “не сохранено”.
3. Расширить TacticalQueries: укрытия, линия огня, путь, враг, приказ.
4. Вынести headless JS GraphRunner local engine ближе к одному источнику правды с TS runner, если появится сборка shared JS.
5. Подключить не только выбранного бойца, а controlled subset юнитов, но не сразу весь бой.
6. Сделать удобную панель scores/breakdown в редакторе.
```

## Чего не делать

```text
не трогать main без явного GO;
не возвращать legacy-ноды;
не делать сразу squad AI;
не переносить тяжёлые расчёты в браузерный кадр;
не переписывать всю RTS основу;
не смешивать Pixi rendering с core AI contract;
не утверждать успешную визуальную проверку без реального visual evidence.
```
