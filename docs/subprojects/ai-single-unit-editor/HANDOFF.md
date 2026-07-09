# Handoff — AI Single-Unit Editor

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Главное правило: `main` не трогать без явного GO человека.

## Что нужно понять сразу

Это подпроект для игры Real-wargame: редактор ИИ одиночного солдата через ноды.

Текущий рабочий результат:

```text
игра запускается;
редактор нод запускается;
редактор и игра связаны через localStorage v6;
выбранный боец на карте может исполнять простой граф;
можно собрать цепочку Старт → Проверка флага → Реплика бойца → Поза;
если выбранный боец под огнём/давлением, над ним появляется фраза и меняется поза;
есть общий тихий запуск игры + редактора + local engine;
есть общее меню игра↔редактор↔выход.
```

Пользователь подтвердил: **связка работает**. Последний найденный баг: в человеческой панели ноды нельзя было выбрать `select`, потому что значение мгновенно сбрасывалось. Исправлено через `editor-click-guard.ts`.

## Как продолжать работу

Перед любой правкой прочитать:

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

Он должен:

```text
проверить node/npm;
при необходимости выполнить npm install;
проверить editor:smoke;
погасить старые процессы на портах 8799 / 8787 / 5173;
скрыто запустить scripts/real_wargame_lab_manager.mjs;
lab manager запускает npm run engine:dev и npm run dev;
открыть http://127.0.0.1:5173/lab-launch.html;
lab-launch открывает игру и AI Node Editor в новых вкладках.
```

Служебные порты:

```text
5173 — Vite app/game/editor;
8787 — local AI engine;
8799 — lab manager: /lab/health, /lab/open, /lab/shutdown.
```

## Общее меню

В игре:

```text
Редактор ИИ солдат — открывает /ai-node-editor.html в новой вкладке;
Новая игра — перезагружает карту;
Выход — просит вкладки закрыться и вызывает /lab/shutdown.
```

В редакторе:

```text
Обновить — reload текущей вкладки;
Открыть игру — открывает / в новой вкладке;
Выход — просит вкладки закрыться и вызывает /lab/shutdown.
```

Ограничение браузера: `window.close()` может не закрыть вкладку, если вкладка открыта вручную или браузер запретил автозакрытие. Это не ошибка bridge: процессы должны останавливаться через lab manager.

## Текущий graph storage

Используется только новый storage:

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
```

Старые `graph.v5` и ниже не поднимать. Это было сделано, чтобы старый грязный canvas не возвращался.

## Текущий чистый canvas

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

## Человеческие панели нод

Ключевой файл:

```text
src/ai-node-editor/human-node-ui.ts
```

Что важно:

```text
на первом уровне человек не должен видеть JSON;
для каждой ноды должна быть понятная панель;
select использовать там, где набор вариантов конечный;
self / cover / underFire / move_to и т.п. не вводятся руками, а выбираются;
JSON спрятан в developer details;
подсказки появляются через 2 секунды hover;
общий cooldown выводится у каждой ноды.
```

Баг с select:

```text
Симптом: выбираешь пункт в select, и он мгновенно сбрасывается.
Причина: document-level click handler делал rerender при клике по select/input.
Фикс: src/ai-node-editor/editor-click-guard.ts загружается до main.ts в ai-node-editor.html.
```

Не удалять этот guard без замены архитектуры document click handling.

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
прогоняет граф примерно раз в 0.6 секунды;
исполняет цепочки универсальных нод;
учитывает cooldownSeconds/cooldownTiming;
записывает результат в UnitBehaviorRuntime.
```

Blackboard сейчас содержит примерно:

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
best_cover_position
current_target
remembered_enemy_position
```

Живое исполнение сейчас поддерживает:

```text
Root / Sequence / Selector / UtilitySelector / ActionBranch
FlagCheck
BlackboardValueAbove
DistanceCheck
TacticalCheck
FindBestObject
WriteMemory
CopyMemory
SetPosture
SetAction
SetMovementMode
SayMessage
WriteReason
cooldownSeconds / cooldownTiming
```

Scoring-ноды (`ParameterScore`, `DistanceScore`, `DecisionInertia`, `RandomChance`, `StableThreshold`, `ForbidAction`) пока в bridge в основном принимаются как допустимые, но не являются полноценной Utility AI системой. Это будущая работа.

## Как быстро проверить текущую фичу руками

1. Запустить:

```text
Run-Real-Wargame-Lab.bat
```

2. В редакторе собрать:

```text
Старт
  → Проверка флага
  → Реплика бойца
  → Поза
```

3. Настроить:

```text
Проверка флага:
  flagKey = underFire
  expected = true

Реплика бойца:
  messageRu = Под огнём!
  message = Under fire!
  durationSeconds = 2

Поза:
  posture = prone
```

4. Нажать `Save parameters` у каждой ноды.
5. Открыть игру, выбрать бойца под давлением/огнём.
6. Ожидание:

```text
над бойцом появляется фраза;
поза меняется на prone;
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

Если задача про визуал или UI, не утверждать “проверил глазами”, пока реально не открыт браузер или не просмотрены PNG из Playwright/GitHub Actions artifact.

## Последние важные изменения

```text
d3d24f9939e7c316fb4796b1e20bffaba35e4a74 — AI Game Bridge: редакторный граф подключён к выбранному бойцу.
404a9de09ab84f9d78c9e4637aa2ada91b570b81 — общий тихий запуск и общее меню игры/редактора.
e059f02365f9f6a5cce0ab217a883fbc5fef15ee — фикс select-reset через editor-click-guard.ts.
```

После этого handoff и документы подпроекта дополнительно обновлены; точный head commit смотри в финальном ответе чата или через Git.

## Что делать дальше

Ближайшие разумные задачи:

```text
1. Проверить select-reset fix в браузере: все select в человеческих панелях должны удерживать выбранный пункт.
2. Доработать сохранение параметров так, чтобы часть простых select/input могла сохраняться сразу или явно подсвечивала “не сохранено”.
3. Сделать нормальный GraphRunner вместо временного исполнения в AiGameBridge.
4. Реализовать настоящий UtilitySelector: score-ноды должны влиять на выбор ветки.
5. Расширить TacticalQueries: укрытия, линия огня, путь, враг, приказ.
6. Подключить не только выбранного бойца, а controlled subset юнитов, но не сразу весь бой.
7. Добавить визуальный debug: какая нода прошла/провалилась и почему.
8. Укрепить общий запуск: health UI, понятные ошибки, мягкое закрытие процессов.
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
