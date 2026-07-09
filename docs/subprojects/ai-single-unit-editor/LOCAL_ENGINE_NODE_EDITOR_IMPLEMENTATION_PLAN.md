# План внедрения — AI Node Editor + локальный движок

Дата: 2026-07-09  
Подпроект: `ai-single-unit-editor`  
Статус: проектный план внедрения

## 1. Главная цель

Создать редактор нод искусственного интеллекта для **одиночного солдата** в Real-wargame.

Важно:

```text
Это не ИИ взвода.
Это не ИИ командира.
Это не стратегический бот.
Это не универсальный редактор всего.
```

Редактор нужен для самого нижнего уровня поведения:

```text
солдат видит / слышит / помнит;
оценивает опасность;
выбирает действие;
исполняет его;
показывает человеку, почему он так сделал.
```

## 2. Главное уточнение: расчёты делает локальный движок, а не браузер

Требование пользователя:

```text
Все тяжёлые расчёты ИИ, видимости, опасности, поиска укрытий и оценки решений не должны выполняться в браузерной вкладке.
Браузерная вкладка — только редактор, визуализация, кнопки и инспектор.
Расчёты должны идти в локальном движке, который использует ресурсы ПК.
```

Это означает:

- браузер не считает Utility AI для всех солдат;
- браузер не перебирает тысячи точек поиска укрытия;
- браузер не строит тяжёлые карты опасности;
- браузер не запускает массовые симуляции;
- браузер не должен подвисать от ИИ;
- локальный движок должен работать отдельным процессом или отдельными рабочими потоками;
- редактор общается с движком через локальный протокол.

Браузер всё равно остаётся полезным как интерфейс:

```text
браузерная вкладка показывает граф;
браузерная вкладка даёт редактировать ноды;
браузерная вкладка показывает объяснения;
браузерная вкладка отправляет JSON-граф локальному движку;
локальный движок возвращает результат расчёта.
```

## 3. Физическая архитектура

Целевая схема:

```text
┌──────────────────────────────────────────┐
│ Browser / UI                              │
│                                          │
│ Tactical Board tab                        │
│ AI Node Editor tab                        │
│ Inspector / graph / import-export         │
│                                          │
│ НЕ делает тяжёлые расчёты ИИ              │
└───────────────────┬──────────────────────┘
                    │ localhost API / WebSocket
                    ▼
┌──────────────────────────────────────────┐
│ Local Engine Host                         │
│                                          │
│ AI tick                                   │
│ sensors                                   │
│ line-of-sight batches                     │
│ cover search                              │
│ danger map                                │
│ Utility AI scoring                        │
│ decision inertia                          │
│ explanation log                           │
│ worker_threads / later Rust               │
└───────────────────┬──────────────────────┘
                    │ shared JSON / commands
                    ▼
┌──────────────────────────────────────────┐
│ Core game model                           │
│                                          │
│ SimulationState                           │
│ UnitModel                                 │
│ BehaviorModel                             │
│ MapModel                                  │
│ LineOfSight                               │
│ UnitKnowledge                             │
└──────────────────────────────────────────┘
```

## 4. Что значит “локальный движок” на первом этапе

На первом практическом этапе не нужно сразу писать отдельный большой движок на C++ или Rust.

Рациональный путь:

```text
Этап 1: локальный Node.js/TypeScript engine host.
Этап 2: вынести тяжёлые задачи в worker_threads.
Этап 3: если станет нужно — Rust/WebAssembly/Tauri sidecar для самых тяжёлых расчётов.
```

Почему так:

- текущий проект уже TypeScript;
- существующий `core` можно переиспользовать без переписывания;
- проще быстро получить работающий результат;
- позже узкие тяжёлые места можно заменить Rust-модулями;
- редактор и движок сразу будут общаться через понятный локальный протокол.

Важная граница:

```text
Даже если первый local engine написан на TypeScript/Node.js, это уже не браузерная вкладка.
Это отдельный локальный процесс, который можно грузить сильнее, профилировать и распараллеливать.
```

## 5. Новая вкладка редактора

Редактор нод должен открываться в отдельной вкладке, а не смешиваться с текущей тактической картой.

Рекомендуемая реализация для текущего Vite-проекта:

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/ai-node-editor.css
```

В основной игре добавить кнопку:

```text
Редактор ИИ
```

Поведение кнопки:

```ts
window.open('/ai-node-editor.html', '_blank');
```

Почему отдельная вкладка лучше:

- тактическая карта не ломается;
- редактор можно развивать отдельно;
- можно держать рядом две вкладки: игра + мозг солдата;
- проще тестировать;
- проще позже перенести в Tauri/Electron как отдельное окно.

## 6. Что делает браузерная вкладка AI Node Editor

Разрешено делать в браузерной вкладке:

- рисовать ноды;
- двигать ноды;
- соединять ноды;
- показывать палитру;
- показывать инспектор выбранной ноды;
- импортировать/экспортировать JSON;
- отправлять граф локальному движку;
- получать от движка ошибки валидации;
- получать от движка debug/explanation;
- показывать последние решения солдата.

Запрещено закладывать в браузер как основную обязанность:

- массовый расчёт поведения;
- полный AI tick;
- тяжёлый поиск укрытий;
- пересчёт карт опасности;
- массовые линии видимости;
- тренировочные арены;
- миллионные прогоны ситуаций.

## 7. Что делает local engine

Локальный движок отвечает за:

```text
AI tick одиночного солдата;
позже — AI tick многих солдат;
сенсоры;
личную память солдата;
поиск укрытия;
оценку точек;
Utility AI scoring;
инерцию решения;
применение команд к SimulationState;
объяснение принятого решения;
валидацию AI-графа;
профилирование затрат.
```

Первый движок может быть запущен как локальный процесс:

```text
npm run engine:dev
```

А пользовательский `.bat` позже должен запускать оба процесса:

```text
1. local engine;
2. Vite preview;
3. открыть игру;
4. по кнопке открыть AI Node Editor.
```

Пользователь не должен руками запускать два терминала.

## 8. Локальный протокол между UI и движком

На первом этапе достаточно `localhost` API.

Минимальные команды:

```text
GET  /engine/health
POST /ai/graph/validate
POST /ai/graph/save
POST /ai/graph/evaluate-once
POST /ai/soldier/tick
POST /ai/query/best-cover
GET  /ai/debug/last-decision/:unitId
```

Позже для живого debug лучше WebSocket:

```text
engine -> browser:
- soldier_decision
- score_breakdown
- graph_validation_result
- tactical_query_points
- performance_report
```

Принцип:

```text
UI просит.
Engine считает.
UI показывает.
```

## 9. Договор данных графа

Файл графа должен быть обычным JSON.

Пример:

```json
{
  "version": 1,
  "id": "soldier_default_survival_graph",
  "rootNodeId": "root",
  "blackboardDefaults": {
    "visible_enemy_id": null,
    "known_enemy_position": null,
    "best_cover_position": null,
    "current_action": "observe"
  },
  "nodes": [
    {
      "id": "root",
      "type": "Root",
      "children": ["decision"]
    },
    {
      "id": "decision",
      "type": "UtilitySelector",
      "children": [
        "critical_survival",
        "return_fire",
        "continue_order",
        "observe"
      ]
    }
  ]
}
```

## 10. Договор результата решения

Local engine должен возвращать не только команду, но и объяснение.

Пример:

```json
{
  "unitId": "soldier_1",
  "selectedBranch": "move_to_cover",
  "command": {
    "type": "move_to_cover",
    "target": { "x": 18.5, "y": 12.5 }
  },
  "scores": [
    {
      "branch": "move_to_cover",
      "score": 73,
      "reasons": [
        "+ danger high: 42",
        "+ cover nearby: 20",
        "+ cautious soldier: 11"
      ]
    },
    {
      "branch": "continue_order",
      "score": -15,
      "reasons": [
        "+ obedience: 30",
        "- danger: 45"
      ]
    }
  ],
  "explanationRu": "Солдат пошёл к укрытию, потому что опасность высокая, рядом есть укрытие, а продолжение приказа получило отрицательную оценку."
}
```

Это критично: если решение нельзя объяснить, такой ИИ для проекта почти бесполезен.

## 11. Нужные техники ИИ для одиночного солдата

Минимальный набор:

```text
FSM — текущее состояние солдата;
Utility AI — выбор действия по баллам;
Behavior Tree subset — пошаговое исполнение выбранного действия;
Blackboard — личная память солдата;
Sensors — зрение, слух, опасность, укрытия;
Tactical queries — поиск точки/укрытия;
Hysteresis — инерция решения;
Explanation log — объяснение.
```

Не внедрять сразу:

```text
HTN для командира;
GOAP для целого боя;
геномы;
массовое обучение;
систему взвода;
сложную баллистику;
стратегическое планирование.
```

## 12. Категории нод для редактора

Палитра должна быть не стратегической, а солдатской.

### FLOW

```text
Root
Utility Selector
Sequence
Selector
Action Branch
Cooldown
Repeat Until
```

### CONDITIONS

```text
Has Order
Enemy Visible
Enemy Known
Under Fire
Stress Above
Danger Above
Health Below
Ammo Available
Cover Nearby
In Cover
Reached Target
Line Of Sight To Enemy
```

### SCORES

```text
Score Danger
Score Stress
Score Obedience
Score Cover Need
Score Enemy Threat
Score Ammo
Score Distance To Cover
Score Current Action Inertia
Score Soldier Trait
Clamp Score
Add Score
Multiply Score
Veto If
```

### QUERIES

```text
Find Nearest Cover
Find Best Cover
Find Safe Point
Find Visible Enemy
Find Last Known Enemy Position
Estimate Danger At Point
Check Line Of Sight
```

### ACTIONS

```text
Set Posture
Move To Point
Move To Cover
Stop
Aim At Target
Fire At Target
Reload
Observe Sector
Continue Order
Retreat Short
Set State
Write Reason
```

### MEMORY / BLACKBOARD

```text
Set Blackboard Value
Get Blackboard Value
Remember Enemy
Forget Stale Contact
Set Current Target
Set Best Cover
Clear Target
Increase Stress
Reduce Stress
```

### DEBUG

```text
Log Reason
Explain Score
Mark Point
Draw Candidate Points
Show Last Decision
```

## 13. Первый рабочий граф: Soldier Survival Brain

Первый граф должен решать простую задачу:

```text
Солдат получил приказ идти.
Появилась опасность.
Солдат выбирает:
- продолжить приказ;
- лечь;
- идти к укрытию;
- ответить огнём;
- наблюдать.
```

Структура:

```text
Root
└── Soldier Decision Utility Selector
    ├── Critical Survival
    │   ├── score: danger + stress + low health
    │   └── execute:
    │       ├── Find Best Cover
    │       ├── Move To Cover, если найдено
    │       └── Set Posture Prone, если укрытия нет
    │
    ├── Return Fire
    │   ├── conditions: Enemy Visible, Ammo Available
    │   ├── score: enemy threat + aggression - stress
    │   └── execute: Aim + Fire
    │
    ├── Continue Order
    │   ├── conditions: Has Order
    │   ├── score: obedience - danger - stress
    │   └── execute: Continue Order
    │
    └── Observe
        ├── score: default low score
        └── execute: Observe Sector
```

## 14. Предлагаемые файлы реализации

### Core AI

```text
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGraphRunner.ts
src/core/ai/SoldierDecision.ts
src/core/ai/SoldierActions.ts
src/core/ai/SoldierSensors.ts
src/core/ai/TacticalQueries.ts
src/core/ai/DecisionExplanation.ts
```

### Local engine

```text
src/local-engine/EngineHost.ts
src/local-engine/EngineServer.ts
src/local-engine/EngineProtocol.ts
src/local-engine/workers/SoldierAiWorker.ts
src/local-engine/workers/TacticalQueryWorker.ts
src/local-engine/EnginePerformance.ts
```

### AI Node Editor UI

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/NodePalette.ts
src/ai-node-editor/GraphCanvas.ts
src/ai-node-editor/NodeInspector.ts
src/ai-node-editor/GraphToolbar.ts
src/ai-node-editor/GraphImportExport.ts
src/ai-node-editor/EngineConnectionStatus.ts
src/ai-node-editor/ai-node-editor.css
```

### Data

```text
src/data/ai/soldier_default_survival_graph.json
src/data/ai/soldier_node_library.json
src/data/ai/soldier_blackboard_schema.json
```

### Tests / checks

```text
tests/ai-graph-validation.test.ts
tests/soldier-ai-runner.test.ts
tests/local-engine-smoke.test.ts
tests/ai-node-editor-smoke.spec.ts
```

## 15. Этапы внедрения

### Этап 0 — зафиксировать план

Сделать этот документ и обновить память подпроекта.

Готово, если:

```text
план лежит в docs/subprojects/ai-single-unit-editor/;
JOURNAL.md обновлён;
subproject.json знает о документе.
```

### Этап 1 — data contract

Сделать только типы и JSON-формат:

```text
AiGraph
AiNode
AiNodeType
AiEdge
AiBlackboardSchema
SoldierDecisionResult
ScoreBreakdown
SoldierCommand
```

Готово, если:

```text
можно загрузить soldier_default_survival_graph.json;
можно проверить структуру графа;
ошибки валидации понятны человеку.
```

### Этап 2 — headless local engine

Сделать локальный движок без красивого редактора.

Готово, если:

```text
npm run engine:dev запускает локальный процесс;
GET /engine/health отвечает ok;
POST /ai/graph/validate валидирует граф;
POST /ai/graph/evaluate-once возвращает решение и объяснение.
```

### Этап 3 — AI Node Editor как новая вкладка

Сделать отдельную вкладку:

```text
ai-node-editor.html
```

Готово, если:

```text
из игры можно открыть Редактор ИИ в новой вкладке;
вкладка показывает палитру, граф, инспектор, статус local engine;
можно импортировать/экспортировать JSON;
валидация идёт через local engine.
```

### Этап 4 — Soldier Survival Brain v0.1

Связать граф с одним солдатом.

Готово, если:

```text
солдат получает приказ идти;
опасная зона повышает danger/stress;
local engine выбирает продолжить приказ / лечь / идти к укрытию;
SimulationState применяет команду;
инспектор показывает причину.
```

### Этап 5 — tactical queries

Добавить поиск укрытия через local engine.

Готово, если:

```text
engine перебирает точки вокруг солдата;
оценивает укрытие, опасность, дистанцию, видимость;
возвращает best_cover_position;
UI может показать candidate points в debug-слое.
```

### Этап 6 — рецепты нод

Добавить готовые рецепты:

```text
Лечь под огнём
Искать ближайшее укрытие
Перебежать к укрытию
Ответить огнём
Продолжать приказ, если риск низкий
Остановиться и наблюдать
Запомнить врага
Забыть устаревший контакт
```

Готово, если:

```text
пользователь не собирает всё из атомов;
нажимает рецепт;
редактор создаёт несколько связанных нод;
граф остаётся валидным.
```

### Этап 7 — производительность и многопоточность

Вынести тяжёлые части в worker_threads.

Кандидаты:

```text
batch line-of-sight;
cover candidate scoring;
danger/influence map;
mass AI tick;
training arena later.
```

Готово, если:

```text
UI не подвисает;
engine отдаёт performance report;
видно время AI tick, sensor tick, query tick;
можно увеличить число солдат без немедленного фриза браузера.
```

### Этап 8 — Rust/Tauri sidecar, если понадобится

Не делать сразу.

Делать только если TypeScript/Node engine станет узким местом.

Кандидаты для Rust:

```text
массовая видимость;
карты влияния;
поиск укрытий;
тренировочные арены;
миллионы прогонов.
```

## 16. Как запускать человеку

Итоговая пользовательская схема должна быть такой:

```text
scripts/windows/run-preview.bat
```

Этот батник должен:

```text
1. проверить зависимости;
2. запустить local engine;
3. запустить Vite preview;
4. открыть игру;
5. не требовать от пользователя Git и терминал.
```

В игре должна быть кнопка:

```text
Редактор ИИ
```

Она открывает новую вкладку.

Если local engine не запущен, редактор должен честно показывать:

```text
Локальный движок не подключён.
Расчёты ИИ не выполняются.
Запустите preview через scripts/windows/run-preview.bat.
```

Запрещено:

```text
делать вид, что расчёт прошёл в браузере;
молча подменять local engine браузерной симуляцией;
показывать фейковые debug-результаты.
```

## 17. Критерий готовности первой версии

Первая настоящая версия считается готовой, если:

```text
1. Игра открывается через scripts/windows/run-preview.bat.
2. Local engine запускается вместе с preview.
3. В игре есть кнопка Редактор ИИ.
4. Редактор ИИ открывается в новой вкладке.
5. Редактор показывает статус подключения к local engine.
6. JSON-граф одиночного солдата загружается и валидируется через local engine.
7. Один солдат получает решение от local engine, а не от браузерной вкладки.
8. В инспекторе видно: выбранная ветка, баллы, причина.
9. При опасности солдат выбирает лечь / идти к укрытию / продолжить приказ по баллам.
10. Если local engine остановлен, редактор честно показывает ошибку, а не считает всё сам в браузере.
```

## 18. Риски

### Риск 1 — сделать красивый редактор без живого ИИ

Защита:

```text
сначала data contract + local engine + один исполняемый граф;
потом UI.
```

### Риск 2 — снова всё посчитать в браузере

Защита:

```text
в UI запрещены тяжёлые tactical queries;
валидация и evaluate-once идут через local engine;
в UI всегда виден статус engine connection.
```

### Риск 3 — начать делать ИИ взвода/командира раньше времени

Защита:

```text
подпроект называется ai-single-unit-editor;
первая версия только одиночный солдат;
squad-level AI отдельно позже.
```

### Риск 4 — преждевременно уйти в Rust

Защита:

```text
сначала TypeScript/Node local engine;
профилирование;
Rust только для доказанных узких мест.
```

## 19. Ближайший правильный task-pack для Codex/OpenCode

Следующая bounded-задача:

```text
Создать data contract AI-графа одиночного солдата и headless validation без UI.
```

Scope:

```text
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/data/ai/soldier_default_survival_graph.json
tests/ai-graph-validation.test.ts или простой npm/python smoke, если тестовый раннер ещё не выбран
```

Out of scope:

```text
визуальный редактор;
local engine server;
интеграция с SimulationTick;
стрельба;
анимации;
ИИ взвода;
командирский ИИ.
```

Acceptance:

```text
граф загружается;
валидатор находит root;
валидатор проверяет неизвестные node types;
валидатор проверяет битые children links;
валидатор выдаёт понятные русские ошибки;
валидный soldier_default_survival_graph.json проходит проверку.
```

## 20. Главная формула проекта для этого подпроекта

```text
Редактор нод — это не мозг.
Редактор нод — это инструмент сборки и отладки мозга.

Мозг живёт в local engine.
Браузер показывает и редактирует.
Simulation core применяет результат.
Игрок видит объяснение.
```