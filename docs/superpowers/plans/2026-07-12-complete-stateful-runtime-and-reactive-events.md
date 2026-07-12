# Завершение Stateful Runtime и Reactive Events — подробный план этапов 1–2

Дата: 2026-07-12  
Статус: планирование; реализация не начата  
Базовая ветка аудита: `real-wargame-preview`  
Рабочая ветка документа: `planning/complete-stateful-runtime-events-2026-07-12`

> Для исполнителя: выполнять по одному подэтапу. Не переносить изменения в `real-wargame-preview` и не трогать `main` без отдельного прямого разрешения пользователя. Перед любой браузерной проверкой спросить: **«Визуальная проверка подготовлена. Запустить её сейчас?»**

## 1. Цель и границы

Нужно завершить только два первых архитектурных этапа:

1. **GraphRunner v2: состояние и время** — общий, сериализуемый и безопасно отменяемый runtime длительных действий.
2. **События, реактивность и управляющие модификаторы** — пробуждение по значимым изменениям, реактивное прерывание и минимальный набор контролируемых модификаторов.

В этот план не входят:

- несколько автоматически исполняемых бойцов;
- Tactical Query System;
- резервирование укрытий;
- полный Perception Runtime;
- произвольный параллелизм;
- GOAP, HTN и LLM;
- полная оружейная симуляция;
- переработка Grid Pathfinding v1;
- переход graph format v1 → v2;
- подграфы и типизированные порты;
- перенос lifecycle в PixiJS, DOM или UI.

Стабильные границы сохраняются:

```text
AiGraphRunner
→ чистая мгновенная оценка условий, Utility и обычных effects

AiGraphRuntime
→ сериализуемое длительное исполнение, lifecycle и композиции

AiGameBridge / AiStatefulMoveGameBridge
→ адаптация к SimulationState и игровым приказам

SimulationTick
→ единственный владелец изменения координат бойцов
```

## 2. Источники правды и замечания к документам

Аудит выполнен по актуальному коду, smoke-тестам, Playwright-сценариям и каноническим документам подпроекта. Старый большой план не использовался как доказательство реализации.

Прочитаны:

```text
docs/ai/AGENT_START_HERE.md
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md

docs/subprojects/ai-single-unit-editor/HANDOFF.md
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/STATUS.md
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/JOURNAL.md

docs/subprojects/ai-single-unit-editor/STATEFUL_RUNTIME_V1.md
docs/subprojects/ai-single-unit-editor/STATEFUL_MOVEMENT_V1.md
docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md
docs/subprojects/ai-single-unit-editor/GRID_PATHFINDING_V1.md

ideas/AI_BEHAVIOR_NODE_SYSTEM_FEATURES.md
docs/superpowers/plans/2026-07-11-stateful-ai-runtime-and-tactical-intelligence.md
.agents/skills/real-wargame-ai-runtime/SKILL.md

docs/superpowers/specs/2026-07-12-ai-grid-pathfinding-v1-design.md
docs/superpowers/plans/2026-07-12-ai-grid-pathfinding-v1.md
```

Два указанных в исходном поручении файла Reactive Route Status по путям:

```text
docs/superpowers/specs/2026-07-12-ai-reactive-route-status-v1-design.md
docs/superpowers/plans/2026-07-12-ai-reactive-route-status-v1.md
```

в текущей ветке не найдены. Фактическое состояние Reactive Route Status подтверждено через:

```text
docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md
src/core/ai/AiRouteStatus.ts
src/core/ai/AiStatefulMoveGameBridge.ts
scripts/ai_route_status_smoke.ts
tests/ai-running-move.spec.ts
```

Это расхождение документации не блокирует планирование, но нельзя ссылаться на отсутствующие файлы как на доказательство.

## 3. Краткий итог аудита

### Этап 1 — семь крупных пунктов

| Итоговая категория | Количество |
|---|---:|
| готово | 1 |
| частично готово / реализовано иначе | 5 |
| не реализовано | 1 |

Готова базовая интеграция runtime с выбранным бойцом и игровым движением. Частично готовы session, lifecycle, композиции, набор длительных действий и диагностика. Полностью отсутствует сохранение активного runtime в scene JSON.

### Этап 2 — восемь крупных пунктов

| Итоговая категория | Количество |
|---|---:|
| готово | 0 |
| частично готово / реализовано иначе | 4 |
| не реализовано | 4 |

Специализированная реактивность маршрута уже полезна и проверена, но она не является общей событийной системой.

## 4. Аудит этапа 1

### 4.1. Сводная таблица

| Пункт | Статус | Доказательство в коде | Доказательство в тестах | Что отсутствует | Нужно ли менять старый план | Рекомендуемый подэтап | Риск |
|---|---|---|---|---|---|---|---|
| Runtime session для бойца | частично готово / реализовано иначе | `AiGraphExecutionState` сериализуем, хранит graph/unit/branch/sequence/child/active node/time/status; состояние лежит отдельно от Blackboard. `AiGameBridge` сохраняет его в расширенном `behaviorRuntime`. | `runtime:smoke` проверяет resume без повторного start, terminal очистку и stale state. | Нет явного `AiRuntimeSession`; поля runtime не объявлены в `UnitBehaviorRuntime`; нет единой idle/start/update/terminal-модели, session version envelope, controlled exception boundary и нормализованной миграции. Автоматически тикается только выбранный боец. | Да. Не создавать параллельный runtime с нуля; обернуть существующий state в явный session-контракт и постепенно извлекать код. | 1 | Средний: опасность двойного источника состояния. |
| Lifecycle действий | частично готово | `Wait` и `MoveToBlackboardPosition` имеют специальные ветки `start/update/complete/cancel`. Движение создаёт `begin_move` один раз и token-защищённый `clear_move`. | `runtime:smoke`, `move-bridge:smoke` проверяют старт, update, completion, timeout, cancel и сохранение приказа игрока. | Нет общего registry; cleanup существует только как специальная очистка движения; нет гарантии cleanup ровно один раз после любого terminal outcome; нет общего error→failure boundary; timeout у Wait/Move не является modifier и не имеет общей cleanup-семантики. | Да. Сохранить работающие реализации как первые adapters registry, а не переписывать их одновременно. | 2 | Высокий: двойной cleanup или потеря ownerToken. |
| Stateful composite nodes | частично готово | `SequenceWithMemory` хранит индекс ребёнка; runtime находит первую такую последовательность в выбранной ветви. Обычные `Sequence`, `Selector`, `UtilitySelector`, `ActionBranch` остаются мгновенными в Runner. Вложенная `SequenceWithMemory` явно запрещена. | `runtime:smoke` доказывает одну прямую цепочку Wait/Move и переход к следующему мгновенному действию. | Нет вложенных stateful-композиций; нет stateful Selector; UtilitySelector не разделяет долгосрочно evaluation и execution; выбранная ветвь ищется через `planningGraph()` и `findSequence()`; несколько последовательных длительных действий поддерживаются только если они прямые дети одной SequenceWithMemory; нет общего cancel active child. | Да. Не объявлять обычные Sequence/Selector готовыми; сначала сделать единый composite frame stack, сохранив graph v1. | 3 | Высокий: изменение семантики старых графов. |
| Длительные action-ноды | частично готово | Реально длительные: `Wait`, `MoveToBlackboardPosition`. Остальные действия идут через мгновенные effects. | `runtime:smoke` и `ai-running-move.spec.ts` проверяют Wait/Move. | Нет общего lifecycle для Reload/Aim/Observe/Fire. | Да. Для доказательства registry добавить один безопасный вертикальный срез `Reload`; остальные боевые действия не втаскивать одним пакетом. | 4 | Средний: преждевременная оружейная модель. |
| Интеграция с игрой | готово в границах одного выбранного бойца | Есть `evaluateNow` без применения и `tickNow` с применением; обычный tick блокируется паузой/редактором; simulation time не растёт при preview; смена selected unit не удаляет данные прежнего unit; ownerToken защищает приказ игрока; core runtime не импортирует `SimulationState`, PixiJS или DOM; координаты меняет только `SimulationTick`; игрок и ИИ используют общий planner. | `move-bridge:smoke`, route/pathfinding/routed-move smoke, `tests/ai-running-move.spec.ts`. | Нет формализованного общего `AiActionHost`; runtime-поля описаны локальными пересечениями типов; явный single-step надо закрепить тестом как ровно один simulation/runtime tick. | Частично. Сохранять effect/ownerToken-подход движения; не вводить второй конкурирующий movement host. | 1–2 | Средний: регрессия player override и preview-only. |
| Snapshot и восстановление сцены | не реализовано | `SceneExport.ts` сохраняет только stress/suppression/ammo/weaponReady/posture. `UnitData.runtime` не принимает execution state, route state, ownerToken, маршрут, memory или simulation AI time. При загрузке создаётся новый runtime. | Нет теста сохранения сцены посреди Wait/Move. | Полный runtime snapshot, active node/local state/time, cooldowns, memory, ownerToken, route/order snapshot, version migration, безопасный fallback старых сцен. | Да. Это обязательная крупная часть закрытия этапа 1. Реализовать после registry/composite, иначе snapshot закрепит временную структуру v1. | 5 | Высокий: старые сцены и повторный `start`. |
| Runtime debug | частично готово | Payload и UI показывают success/failure/running/waiting/cancelled, active node, elapsed, cancellation, pause, Utility scores, route/path diagnostics. | Playwright проверяет running, blocked, unreachable и русские параметры/диагностику. | Нет общего progress contract; нет `cleanup invoked`, terminal reason/source, restore marker, session version, event queue/wakeup metrics, observer/abort source. UI читает несколько расширений одного localStorage payload. | Да. Не переписывать сейчас; расширить после появления общих lifecycle/events и объединить контракт payload. | 12 | Низкий–средний: лишние DOM-перерисовки и рассинхрон полей. |

### 4.2. Матрица действий

| Действие | Фактическое состояние | Что считать для закрытия этапа 1 |
|---|---|---|
| `Wait` | длительная, но специальная ветка runtime | Перевести в registry без изменения поведения; cleanup может быть no-op, но вызывается ровно один раз. |
| `MoveToBlackboardPosition` | длительная, игровая, token-owned, route-aware | Перевести в registry adapter; сохранить frozen target, ownerToken и общий planner. |
| `MoveTo` через `SetAction` | мгновенный legacy effect | Оставить для совместимости; не путать с длительной action. |
| `AimAt` | не реализована | Отложить до устойчивого оружейного/направленного host-контракта. |
| `Reload` | мгновенный `SetAction`: сразу ставит ammo=30 | Сделать первой новой общей длительной action, используя simulation time и безопасный cancel. |
| `ObserveSector` | только общее строковое действие/может имитироваться Wait; отдельной lifecycle-ноды нет | Отложить; после этапа 1–2 добавить как самостоятельную action. |
| `Fire` | мгновенный `SetAction`, уменьшает ammo на 1 | Не превращать в длительную на этом этапе; нужна отдельная модель оружейного канала. |
| `SetPosture` | мгновенная | Оставить мгновенной. |
| `SayMessage` | мгновенный effect с UI-временем показа | Оставить мгновенной; не считать длительной action. |

## 5. Аудит этапа 2

| Пункт | Статус | Доказательство в коде | Доказательство в тестах | Что отсутствует | Нужно ли менять старый план | Рекомендуемый подэтап | Риск |
|---|---|---|---|---|---|---|---|
| Общий формат событий | не реализовано | Есть route status/abort codes и строковый `lastEvent`, но нет универсального `AiEvent`. | Route smoke проверяет route codes, не общий event contract. | `id/type/source/target/simulation timestamp/priority/expiry/coalesceKey/payload`, versioning и deterministic id/sequence. | Нет по сути; уточнить имена `sourceId/targetId`, simulation-time и sequence number. | 6 | Средний. |
| Очередь событий | не реализовано | Нет priority queue/event inbox. Route bridge напрямую вызывает runtime. | Нет. | priority, FIFO равных, expiry, coalescing, max size, overflow policy, pause semantics, metrics. | Да. Начать с bounded deterministic array/heap без сложных потоковых политик. | 6 | Высокий: потеря приказов/недетерминизм. |
| События симуляции | частично готово / реализовано иначе | `SimulationTick` и bridges записывают `lastEvent`; route tracker выдаёт прямые сигналы blocked/target_lost/player_override/order_missing и force tick. | route/path smoke. | Единый adapter и transition-based publication; события enemy, order, ammo, weapon, suppression и damage; привязка к unit/session. | Да. Использовать уже существующие transitions и revisions, не строить Perception Runtime. | 7 | Средний: шум каждый кадр. |
| Blackboard observers | не реализовано | `buildBlackboardForUnit` создаёт новый object; `StableThreshold` хранит bool в Blackboard, но подписок/revision нет. | Только smoke StableThreshold старого runner. | key observer, normalized equality, bool/number/position, threshold crossing, hysteresis, suppression повторов, revision. | Нет; добавить слой diff/observer между предыдущим и новым snapshot. | 8 | Высокий: event storm. |
| ReactiveSequence / ObserverAbort | частично готово / реализовано иначе | Route status может force-tick/cancel активное движение по специализированным причинам. Runtime не наблюдает условия перед action и не переключает общую ветвь по релевантному событию. | Route smoke проверяет blocked/target_lost; browser показывает cancel reason. | универсальная зависимость condition→active branch, cancel child, alternative branch, abort source trace, irrelevant-event suppression. | Да. Переиспользовать общий cancel/cleanup из этапа 1; route status должен публиковать event, а не оставаться отдельным конкурентным abort-механизмом. | 9 | Очень высокий: две активные ветви/двойной приказ. |
| WaitForEvent | не реализовано | Нет action и queue. | Нет. | type/source/target filter, timeout, consume_once, keep_latest, payload output. | Да. `queue_all` и restart policies вынести; первая версия минимальная. | 10 | Средний. |
| Управляющие модификаторы | частично готово / реализовано иначе | У нод есть параметр cooldown; Wait/Move имеют встроенный timeout. Это не runtime modifier. | Smoke проверяет старый cooldown и локальные timeout. | `Timeout` child wrapper, bounded `Retry`, cancel+cleanup child, попытки/delay state. Repeat/Invert/Force*/Until* отсутствуют. | Да. Для закрытия этапа 2 обязательны только Timeout и ограниченный Retry. Остальные отложить. | 11 | Высокий: бесконечный loop или пропущенный cleanup. |
| Производительность и пробуждения | частично готово | Автоматический AI только выбранного бойца; основной cadence 600 ms; 60 ms route tracker читает distance/cached memory и не запускает A*/awareness; A* только при plan/replan. | 128×128 path smoke, route smoke, текущие performance-документы. | bounded event queue, wakeup budget, observer revisions, event/wakeup counters, отсутствие полного BB rebuild на irrelevant event, доказательство no full graph every frame. | Да. Метрики и ограничения встроить с первого event slice, не оставлять на конец. | 6–12 | Высокий при будущем масштабировании. |

### 5.1. Минимальный набор событий этапа 2

Обязательные для Gate A:

```text
order_received
order_cancelled
move_completed
route_blocked
target_lost
ammo_empty
weapon_ready_changed
suppression_threshold_crossed
```

Добавить, если существующие данные позволяют сформировать переход без новой системы восприятия:

```text
enemy_spotted
enemy_lost
shot_nearby
damage_received
cover_invalidated
```

Правило: событие создаётся только при переходе или изменении revision, а не каждый simulation frame.

## 6. Главные расхождения старого плана с текущей архитектурой

1. **Runtime уже существует, но проще старого проекта.** Нельзя создавать второй `AiRuntimeSession` параллельно `AiGraphRuntime`; нужно обернуть и постепенно извлечь существующую проверенную реализацию.
2. **Movement host уже реализован через effects + ownerToken + общий `MoveOrder`.** Старый интерфейс `beginMove/getMoveStatus/cancelMove` не следует вводить как конкурирующий путь.
3. **UtilitySelector пока разделяет только изолированную оценку кандидатов внутри одного вызова.** Он не удерживает выбранную ветвь как stateful child.
4. **SequenceWithMemory — отдельный v1-композит.** Обычные Sequence/Selector не stateful; вложенность запрещена.
5. **Cleanup не общий.** Он существует как token-защищённый `clear_move` для Move, но не как общий lifecycle hook.
6. **Snapshot старого плана отсутствует полностью.** Наличие serializable `AiGraphExecutionState` не означает сохранение в сцену.
7. **Reactive Route Status — специализированный прямой сигнал.** Это не `AiEvent`, не очередь и не ObserverAbort.
8. **Grid Pathfinding уже выполнен и не должен быть повторно включён в этапы 1–2.**
9. **Vitest и команды `test:ai`, `test:parity`, `test:benchmark` отсутствуют.** Репозиторий использует Vite SSR wrappers + `node:assert`.
10. **Scene export уже v5 для 2m grid, а не v3.** Snapshot нужно добавлять без отката современной миграции разрешения.
11. **Текущая preview включает новые map revision/cache/performance-наработки.** Event runtime не должен инвалидировать awareness и navigation caches без revision.
12. **Визуальная QA теперь approval-gated.** План только готовит Playwright/PNG и требует отдельного разрешения перед запуском.

## 7. Решение по тестовой инфраструктуре

### 7.1. Сейчас реально существуют

```text
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run pathfinding:smoke
npm run routed-move:smoke
npm run build
npm run docs:check
```

### 7.2. Решение

На этапах 1–2 **не вводить Vitest обязательным предварительным проектом**. Продолжить существующий шаблон:

```text
scripts/<feature>_smoke.ts
→ собирается Vite SSR wrapper
→ запускается Node
→ assertions через node:assert/strict
```

Причины:

- нет новой зависимости и обновления lockfile;
- соответствует текущей проверенной практике;
- позволяет RED/GREEN для чистого core;
- уменьшает риск одновременной смены runtime и test runner.

Допустимо добавить будущие команды только в том подэтапе, который создаёт их:

```text
runtime-session:smoke
runtime-snapshot:smoke
event-queue:smoke
reactive-runtime:smoke
```

До добавления такие команды не включать в gate. `test:parity` не нужен для закрытия этапов 1–2, потому что local JS engine остаётся evaluate-once и честно не исполняет длительный runtime. `test:benchmark` заменить детерминированными budget assertions и метриками в smoke; отдельный benchmark возможен позже.

## 8. Целевая архитектура после этапов 1–2

```text
UnitBehaviorRuntime
└─ aiRuntimeSessionSnapshot
   ├─ version
   ├─ graphId / unitId
   ├─ simulationTimeMs
   ├─ selected branch
   ├─ composite frame stack
   ├─ active action state
   ├─ cooldowns
   ├─ runtime memory
   ├─ bounded event queue
   ├─ observer revisions
   └─ diagnostics counters

AiGraphRuntime
├─ loads/validates session
├─ evaluates only when required
├─ runs composite frames
├─ dispatches actions through registry
├─ invokes cleanup exactly once
├─ consumes relevant events
└─ returns serializable next snapshot + effects + trace

Action registry
├─ Wait
├─ MoveToBlackboardPosition
└─ Reload

Event layer
├─ AiEvent
├─ bounded deterministic queue
├─ simulation adapter
├─ blackboard observers
├─ ReactiveSequence / ObserverAbort
└─ WaitForEvent

Modifiers
├─ Timeout
└─ Retry(maxAttempts, delay)
```

## 9. План реализации: 13 небольших вертикальных срезов

---

## Подэтап 0. Зафиксировать фактический baseline

### Цель

Превратить результаты этого аудита в исполнимые regression contracts до архитектурных изменений.

### Зачем

Существующие `Wait`, movement ownership, route status, pathfinding и old graph compatibility нельзя потерять при извлечении общего runtime.

### Что уже существует

`runtime:smoke`, `move-bridge:smoke`, `route-status:smoke`, pathfinding/routed smoke и Playwright movement fixtures.

### Файлы

Modify:

```text
scripts/ai_graph_runtime_smoke.ts
scripts/ai_stateful_move_bridge_smoke.ts
scripts/ai_route_status_smoke.ts
tests/ai-running-move.spec.ts
```

Create:

```text
docs/subprojects/ai-single-unit-editor/RUNTIME_EVENTS_BASELINE.md
```

### Контракты и типы

Кодовые контракты не менять. Зафиксировать матрицу:

```text
legacy instant graph
Wait start/update/complete/cancel
Move start/update/complete/cancel/timeout
stale execution state cleanup
player override survives
route blocked/target lost
unreachable exact AI target
pause time excluded
preview evaluate does not mutate
```

### Миграции

Нет.

### Русский интерфейс

Не менять; только зафиксировать текущие русские причины.

### Последовательность

1. Добавить недостающие assertions: две независимые execution states не делят данные.
2. Добавить selected-unit switch test: state первого бойца сохраняется, второй не получает его token.
3. Добавить preview-only test: result может быть рассчитан, но runtime fields/order не меняются.
4. Добавить pause/one-step contract.
5. Зафиксировать baseline-документ с точными командами.

### RED-тест

Новые assertions должны выявить отсутствие формально типизированной session/selected switch fixture, не меняя production code.

### Минимальная реализация

Только тестовые fixtures и документ. Production code не менять.

### GREEN-тест

```text
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run pathfinding:smoke
npm run routed-move:smoke
npm run build
```

### Регрессии

Все текущие smoke-команды из раздела 7.1.

### Performance

Не добавлять циклы полного graph evaluation. Baseline записывает текущие 600 ms / 60 ms границы.

### Ручная проверка

Не нужна.

### Не входит

Новый runtime, registry, events.

### Готовность

Baseline покрывает текущее поведение и может падать при нарушении ownership/resume/pause.

### Следующий подэтап

1. Явный session envelope.

---

## Подэтап 1. Явный runtime session envelope без переписывания runtime

### Цель

Формализовать существующие разрозненные поля как одну сериализуемую session конкретного бойца.

### Зачем

Нужны единая версия, idle/active/terminal lifecycle, миграция и основа snapshot/events.

### Что уже существует

`AiGraphExecutionState`, cooldowns, AI simulation time и memory хранятся в `behaviorRuntime` через локальные intersection types.

### Файлы

Create:

```text
src/core/ai/runtime/AiRuntimeSession.ts
scripts/ai_runtime_session_smoke.ts
scripts/ai_runtime_session_smoke.mjs
```

Modify:

```text
src/core/behavior/BehaviorModel.ts
src/core/units/UnitModel.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiStatefulMoveGameBridge.ts
package.json
```

### Контракты

```ts
type AiRuntimeSessionStatus = 'idle' | 'active' | 'terminal';

interface AiRuntimeSessionSnapshotV1 {
  version: 1;
  graphId: string;
  unitId: string;
  simulationTimeMs: number;
  status: AiRuntimeSessionStatus;
  executionState?: AiGraphExecutionState;
  blackboardMemory: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  lastTerminal?: {
    status: 'success' | 'failure' | 'cancelled';
    atMs: number;
    reason: string;
    reasonRu?: string;
  };
}
```

Functions:

```ts
createAiRuntimeSession(...)
normalizeAiRuntimeSession(...)
applyRuntimeResultToSession(...)
resetAiRuntimeSession(...)
```

### Миграции

Собрать старые optional fields в session лениво при первом обращении. Старые поля читать, но после успешной миграции писать только session. Удаление legacy read path — не в этом этапе.

### Русский интерфейс

Добавить только диагностическую строку `Сеанс runtime: бездействует / активен / завершён`.

### Последовательность

1. RED: две session одного graph/unit fixture не разделяют memory/cooldowns/state.
2. RED: malformed/unknown version даёт controlled reset reason.
3. Реализовать чистые функции session.
4. Объявить session в `UnitBehaviorRuntime`; убрать локальные type intersections постепенно.
5. Bridge читает/пишет через helper, но `runAiGraphRuntime` не переписывать.
6. Проверить selected-unit switching.
7. Добавить команду `runtime-session:smoke`.

### RED-тест

Unknown version и shared-object mutation должны падать до реализации.

### Минимальная реализация

Envelope + migration wrapper; внутренний `AiGraphExecutionState` остаётся прежним.

### GREEN-тест

```text
npm run runtime-session:smoke
npm run runtime:smoke
npm run move-bridge:smoke
npm run build
```

### Регрессии

Preview evaluate не меняет session; player order сохраняется.

### Performance

Session normalization O(1) на tick; deep clone только небольших serializable runtime частей, не полного SimulationState.

### Ручная проверка

Не нужна.

### Не входит

Composite stack, snapshot scene, events.

### Готовность

У каждого бойца может существовать независимый сериализуемый session, даже если автоматически тикается только выбранный.

### Следующий подэтап

2. Общий lifecycle registry.

---

## Подэтап 2. Общий lifecycle registry и cleanup ровно один раз

### Цель

Заменить специальные `if child.type === Wait/Move` общим action registry, не меняя игровое поведение.

### Зачем

Без общего cleanup нельзя безопасно добавить Reload, Timeout, Retry, reactive abort и snapshot.

### Что уже существует

Проверенные специальные реализации Wait/Move и token-owned cleanup движения.

### Файлы

Create:

```text
src/core/ai/runtime/AiNodeLifecycle.ts
src/core/ai/runtime/AiActionRegistry.ts
src/core/ai/runtime/actions/WaitAction.ts
src/core/ai/runtime/actions/MoveToBlackboardPositionAction.ts
scripts/ai_action_lifecycle_smoke.ts
scripts/ai_action_lifecycle_smoke.mjs
```

Modify:

```text
src/core/ai/AiGraphRuntime.ts
src/core/ai/AiGraphValidation.ts
package.json
```

### Контракт

```ts
interface AiNodeLifecycle<TState> {
  start(ctx): AiActionTickResult<TState>;
  update(ctx, state): AiActionTickResult<TState>;
  cancel(ctx, state, reason): AiActionCancelResult<TState>;
  cleanup(ctx, state, outcome): readonly AiGraphEffect[];
  validateState?(value): value is TState;
}

type AiActionOutcome = 'success' | 'failure' | 'cancelled';
```

Session хранит:

```text
active action type
action local state
started flag
cleanup state: pending | completed
```

### Миграции

`AiGraphExecutionState v1` преобразовать в внутренний action state для Wait/Move. Сохранить чтение старого state до scene snapshot migration.

### Русский интерфейс

Ошибки registry и cleanup имеют `reasonRu`.

### Последовательность

1. RED exact-once start/update/cleanup.
2. RED exception in start/update/cancel → controlled failure; cleanup всё равно один раз.
3. Зарегистрировать Wait adapter.
4. Перенести Move adapter без изменения ownerToken/effects.
5. Runtime dispatch через registry.
6. Удалить специальные ветки только после green parity.
7. Invalid/stale state вызывает cleanup через lifecycle, а не через move-specific helper.

### RED-тест

Fake action с counters:

```text
start=1
update=N
cancel≤1
cleanup=1
terminal update=0
```

### Минимальная реализация

Registry локален/явно передаётся; не использовать UI singleton.

### GREEN-тест

```text
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run build
```

плюс новая lifecycle smoke-команда после её добавления.

### Регрессии

Frozen target, begin_move once, clear matching token, player override.

### Performance

Registry lookup O(1). Не создавать новый registry каждый tick.

### Ручная проверка

Не нужна.

### Не входит

Reload и composite rewrite.

### Готовность

Любая terminal ветка вызывает cleanup один раз; исключение не оставляет handle/order.

### Следующий подэтап

3. Stateful composite frame stack.

---

## Подэтап 3. Stateful composite nodes и разделение Utility evaluation/execution

### Цель

Создать общий serializable composite frame stack.

### Зачем

Текущий runtime умеет только первую найденную прямую `SequenceWithMemory`.

### Что уже существует

Immediate Runner, Utility isolated branch scoring, одна SequenceWithMemory.

### Файлы

Create:

```text
src/core/ai/runtime/AiCompositeRuntime.ts
scripts/ai_composite_runtime_smoke.ts
scripts/ai_composite_runtime_smoke.mjs
```

Modify:

```text
src/core/ai/AiGraphRuntime.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/runtime/AiRuntimeSession.ts
package.json
```

### Контракты

```ts
type AiCompositeFrame =
  | SequenceFrame
  | SelectorFrame
  | UtilityExecutionFrame
  | ActionBranchFrame;

interface SequenceFrame {
  nodeId: string;
  kind: 'sequence';
  childIndex: number;
}

interface UtilityExecutionFrame {
  nodeId: string;
  kind: 'utility_execution';
  selectedBranchNodeId: string;
  selectedScoreRevision: number;
}
```

Политика:

- `SequenceWithMemory`: сохраняет child index.
- Обычный `Sequence`: для старых мгновенных графов сохраняет прежнюю evaluate-once семантику; stateful frame создаётся только при наличии длительного descendant.
- `Selector`: удерживает Running child; при failure переходит к следующему.
- `UtilitySelector`: сначала чисто оценивает, затем исполняет только выбранную ветвь; до релевантного события не переоценивает.
- `ActionBranch`: прозрачный frame/trace scope.
- Cancel идёт от корня active stack к child и cleanup.

### Миграции

Старое `sequenceNodeId/childIndex` преобразуется в frame stack из одного Sequence frame. Graph v1 сохраняется.

### Русский интерфейс

Trace показывает `Активная ветвь`, `Шаг N из M`, `Причина удержания выбора`.

### Последовательность

1. RED nested SequenceWithMemory.
2. RED два последовательных длительных действия.
3. RED Selector удерживает Running child.
4. RED Utility проигравшие effects не применяются.
5. RED cancel active nested child.
6. Реализовать stack.
7. Сохранить legacy instant path для графов без stateful descendants.
8. Удалить `findSequence()`/ограничение direct child после green.

### RED-тест

Граф:

```text
UtilitySelector
→ ActionBranch
  → SequenceWithMemory
    → Wait
    → SequenceWithMemory
      → Wait
      → instant action
```

### Минимальная реализация

Без parallel, subgraphs и reactive reevaluation.

### GREEN-тест

```text
npm run runtime:smoke
npm run validate:ai-graph
npm run engine:smoke
npm run build
```

### Регрессии

Score breakdown/veto/cooldown старого Runner неизменны.

### Performance

Utility оценивается при старте/явном replan, а не каждый 60 ms poll.

### Ручная проверка

Будущий fixture, но браузер не запускать без разрешения.

### Не входит

ReactiveSequence, Restart policies.

### Готовность

Вложенные stateful последовательности, Selector и Utility execution проходят smoke; terminal state не оставляет frames/handles.

### Следующий подэтап

4. Новая длительная Reload action.

---

## Подэтап 4. Длительная Reload как доказательство общего registry

### Цель

Добавить одну новую action, не связанную с движением, и доказать универсальность lifecycle.

### Зачем

Если registry работает только для Wait/Move adapters, этап 1 ещё не общий.

### Что уже существует

Мгновенный `SetAction(reload)` ставит ammo=30.

### Файлы

Create:

```text
src/core/ai/runtime/actions/ReloadAction.ts
```

Modify:

```text
src/core/ai/AiNodeTypes.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGameBridge.ts
src/core/behavior/BehaviorModel.ts
src/ai-node-editor/stateful-node-ui.ts
scripts/ai_graph_runtime_smoke.ts
scripts/ai_node_editor_smoke.mjs
```

### Контракт

Новая node type `Reload`:

```text
durationSeconds
targetAmmo
failIfNoWeapon
```

Action local state:

```text
startedAtMs
initialAmmo
targetAmmo
```

Effects:

```text
begin_reload
complete_reload
cancel_reload
```

Игровой adapter меняет ammo только при `complete_reload`; cancel не выдаёт полный магазин.

### Миграции

Старый `SetAction(reload)` остаётся мгновенным legacy behavior. Новая нода добавляется отдельно и не мигрирует старые графы автоматически.

### Русский интерфейс

```text
Перезарядить
Длительность, секунд
Патронов после завершения
```

### Последовательность

1. RED reload remains running across ticks.
2. RED cancel does not refill ammo.
3. RED timeout later can cancel child cleanly.
4. Register action.
5. Add bridge effects.
6. Add human controls/defaults.
7. Add validation.

### RED-тест

Start at ammo=3, cancel midway → ammo remains 3, cleanup once.

### Минимальная реализация

Без анимации, магазина/патронника и оружейного канала.

### GREEN-тест

```text
npm run runtime:smoke
npm run editor:smoke
npm run validate:ai-graph
npm run lab:smoke
npm run build
```

### Регрессии

Legacy `SetAction(reload)` сохраняется.

### Performance

O(1) per active action tick.

### Ручная проверка

Подготовить сценарий, запуск только после разрешения.

### Не входит

AimAt, Fire, ObserveSector.

### Готовность

Reload использует registry, simulation time, exact-once cleanup и корректный cancel.

### Следующий подэтап

5. Scene snapshot.

---

## Подэтап 5. Runtime snapshot и восстановление сцены

### Цель

Сохранить/загрузить сцену посреди Wait, Move или Reload без повторного start.

### Зачем

Без этого этап 1 нельзя считать завершённым.

### Что уже существует

Scene export v5 2m grid и сериализуемые runtime части.

### Файлы

Create:

```text
src/core/ai/runtime/AiRuntimeSnapshot.ts
scripts/ai_runtime_snapshot_smoke.ts
scripts/ai_runtime_snapshot_smoke.mjs
```

Modify:

```text
src/ui/SceneExport.ts
src/core/units/UnitModel.ts
src/core/behavior/BehaviorModel.ts
src/core/orders/MoveOrder.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiStatefulMoveGameBridge.ts
package.json
```

### Контракт

```ts
interface AiRuntimeSceneSnapshotV1 {
  version: 1;
  session: AiRuntimeSessionSnapshotV1;
  activeOrder?: SerializedMoveOrder;
  routeStatus?: AiRouteStatusState;
}
```

Сохранять:

```text
active composite frames
active action state
simulationTimeMs
cooldowns
runtime memory
ownerToken
requested/resolved target
waypoints/index/route cells/index/revision
route status timing
```

Не сохранять:

```text
functions
Map/Set
DOM
Pixi objects
Date.now-derived UI age
```

### Миграции

- Сцены без `aiRuntime` → новая idle session.
- Unknown snapshot version → controlled warning + safe cleanup/reset.
- Graph mismatch/removed node → cleanup owned order only, then idle.
- Scene export version увеличить совместимо, не ломая 10m→2m migration.

### Русский интерфейс

Сообщения:

```text
Runtime восстановлен
Runtime сброшен: граф изменился
Старый формат сцены загружен без активного действия
```

### Последовательность

1. RED round-trip Wait.
2. RED round-trip Move with ownerToken and route.
3. RED round-trip Reload.
4. RED old scene without snapshot.
5. RED incompatible version/graph.
6. Implement encode/decode/normalize.
7. Load order before first runtime update.
8. Ensure first post-load tick is `update`, not `start`.
9. Ensure invalid snapshot clears only owned AI order.

### RED-тест

Save at elapsed 1200 ms; load; next lifecycle event must be `update`, active start timestamp preserved.

### Минимальная реализация

Один selected-soldier runtime per unit data; no whole-army scheduler.

### GREEN-тест

```text
npm run runtime-snapshot:smoke
npm run runtime:smoke
npm run move-bridge:smoke
npm run map-resolution:smoke
npm run game-editor:smoke
npm run build
```

### Регрессии

Старые scene JSON, 10m migration, player order safety, route completion.

### Performance

Snapshot serialize only on explicit export; restore O(number of units + route length), never per frame.

### Ручная проверка

Будущий PNG `runtime-snapshot-restored.png`; запуск по отдельному разрешению.

### Не входит

Event queue snapshot — добавится после подэтапа 6 и расширит version совместимо.

### Готовность

Wait/Move/Reload round-trip; no duplicate start; old scene loads; invalid snapshot safe.

### Следующий подэтап

6. Event format and queue.

---

## Подэтап 6. Универсальный формат событий и bounded queue

### Цель

Добавить чистую детерминированную очередь событий по simulation time.

### Зачем

Это фундамент этапа 2 и замена прямых специальных wakeup-сигналов.

### Что уже существует

Route abort codes и direct force tick.

### Файлы

Create:

```text
src/core/ai/events/AiEvent.ts
src/core/ai/events/AiEventQueue.ts
scripts/ai_event_queue_smoke.ts
scripts/ai_event_queue_smoke.mjs
```

Modify:

```text
src/core/ai/runtime/AiRuntimeSession.ts
package.json
```

### Контракт

```ts
interface AiEvent<T = unknown> {
  version: 1;
  id: string;
  sequence: number;
  type: string;
  sourceId?: string;
  targetId?: string;
  timestampMs: number;
  priority: number;
  expiresAtMs?: number;
  coalesceKey?: string;
  payload: T;
}

interface AiEventQueueSnapshot {
  version: 1;
  maxSize: number;
  nextSequence: number;
  events: AiEvent[];
  droppedCount: number;
  expiredCount: number;
  coalescedCount: number;
}
```

Правила:

- выше priority раньше;
- равные priority: timestamp, затем sequence FIFO;
- expiry по simulation time;
- coalesce заменяет только событие с одинаковым key и type/target;
- max size фиксирован, например 64 на session;
- overflow: сначала удалить expired, затем самый низкий priority/старый coalescable; критический order event не молча терять;
- pause не двигает simulation time.

### Миграции

Session snapshot без queue → пустая queue.

### Русский интерфейс

Пока core/debug labels; editor UI позже.

### Последовательность

1. RED FIFO/equal priority.
2. RED priority ordering.
3. RED expiry.
4. RED coalescing.
5. RED overflow policy.
6. RED snapshot round-trip.
7. Implement pure queue.
8. Add counters.

### RED-тест

Нерелевантные/expired/coalesced события и два order events.

### Минимальная реализация

Без async callbacks, Observable и внешних event buses.

### GREEN-тест

```text
npm run event-queue:smoke
npm run runtime-session:smoke
npm run runtime-snapshot:smoke
npm run build
```

### Регрессии

Queue must not mutate input arrays/payload positions.

### Performance

Push O(log N) или bounded O(N) при N≤64; no unbounded allocation; counters exposed.

### Ручная проверка

Не нужна.

### Не входит

Simulation publication и observers.

### Готовность

Детерминированность, bounded size, pause/expiry и snapshot доказаны.

### Следующий подэтап

7. Simulation event adapter.

---

## Подэтап 7. Адаптер событий существующей симуляции

### Цель

Публиковать события только из уже существующих переходов и revisions.

### Зачем

Не создавать новую Perception System, но дать runtime реальные причины пробуждения.

### Что уже существует

`lastEvent`, PlayerCommand status, MoveOrder lifecycle, route status, ammo/weaponReady, suppression and enemyVisible blackboard values.

### Файлы

Create:

```text
src/core/ai/events/SimulationAiEvents.ts
scripts/ai_simulation_events_smoke.ts
scripts/ai_simulation_events_smoke.mjs
```

Modify:

```text
src/core/simulation/SimulationTick.ts
src/core/simulation/SimulationState.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiStatefulMoveGameBridge.ts
src/core/behavior/BehaviorModel.ts
package.json
```

### Контракты

Publisher functions принимают previous/current compact facts, а не весь UI:

```ts
collectSimulationAiEvents(previousFacts, currentFacts, nowMs): AiEvent[]
```

Первый обязательный набор:

```text
order_received
order_cancelled
move_completed
route_blocked
target_lost
ammo_empty
weapon_ready_changed
suppression_threshold_crossed
```

Опционально в том же slice только при существующем надёжном переходе:

```text
enemy_spotted
enemy_lost
damage_received
shot_nearby
cover_invalidated
```

### Миграции

Session без previous facts получает baseline без генерации ложных historical events.

### Русский интерфейс

Каждый event type имеет русское название и краткую причину.

### Последовательность

1. RED one event per transition, no repeat on stable state.
2. RED order received carries order id/target.
3. RED move completed carries ownerToken/target.
4. RED route blocked preserves route abort reason.
5. RED pause produces no timestamp advance/repeats.
6. Implement compact fact revision.
7. Push events to selected unit session.
8. Route bridge сначала публикует event; direct cancel оставить временным compatibility path с feature flag до ReactiveSequence.

### RED-тест

100 simulation ticks в неизменном состоянии → 0 повторных events.

### Минимальная реализация

Без нового sensor loop.

### GREEN-тест

```text
npm run event-queue:smoke
npm run runtime:smoke
npm run route-status:smoke
npm run routed-move:smoke
npm run build
```

плюс новая simulation-events smoke.

### Регрессии

SimulationTick остаётся единственным coordinate mutator; A* cadence не меняется.

### Performance

Сравнение компактных facts O(1) на selected unit; no awareness rebuild в 60 ms poll.

### Ручная проверка

Не нужна.

### Не входит

Reactive branch switching.

### Готовность

Transition events детерминированы и не шумят.

### Следующий подэтап

8. Blackboard observers.

---

## Подэтап 8. Blackboard observers и revision-based diff

### Цель

Будить runtime только при изменении конкретного наблюдаемого значения/порога.

### Зачем

ReactiveSequence не должен пересчитывать весь граф на любое событие.

### Что уже существует

Plain Blackboard и StableThreshold hysteresis.

### Файлы

Create:

```text
src/core/ai/events/AiBlackboardObserver.ts
src/core/ai/events/AiBlackboardDiff.ts
scripts/ai_blackboard_observer_smoke.ts
scripts/ai_blackboard_observer_smoke.mjs
```

Modify:

```text
src/core/ai/AiBlackboard.ts
src/core/ai/runtime/AiRuntimeSession.ts
src/core/ai/AiGameBridge.ts
package.json
```

### Контракт

Observer kinds:

```text
key_changed
bool_changed
number_threshold_crossed
position_changed
```

Поля:

```text
observerId
key
kind
comparison/threshold
hysteresisEnter/hysteresisExit
lastNormalizedValue
revision
```

Normalization:

- number finite/clamped according to schema;
- bool exact;
- position `{x,y}` value equality;
- null distinct from missing;
- same normalized value does not emit.

### Миграции

Session without observer state initializes baseline silently.

### Русский интерфейс

Пока diagnostics: `Наблюдатель`, `Ключ`, `Изменение`, `Порог пересечён`.

### Последовательность

1. RED specific key subscription.
2. RED same value no repeat.
3. RED position value equality.
4. RED threshold crossing both directions.
5. RED StableThreshold hysteresis no noise.
6. Implement observer registry per active branch.
7. Bridge builds full Blackboard only on normal AI tick; frequent wake path reads compact observed facts/revisions where possible.

### RED-тест

Values 69→71→70→69 with enter=70/exit=50 produce only one enter event.

### Минимальная реализация

No arbitrary callback functions in snapshot; observers are serializable definitions.

### GREEN-тест

```text
npm run runtime:smoke
npm run build
```

плюс observer smoke.

### Регрессии

StableThreshold old Runner behavior unchanged.

### Performance

No full Blackboard JSON deep diff; only registered keys; metrics `observerChecks`, `observerEvents`.

### Ручная проверка

Не нужна.

### Не входит

Graph editor UI for arbitrary observer authoring beyond ReactiveSequence parameters.

### Готовность

Observers are deterministic, serializable and quiet.

### Следующий подэтап

9. ReactiveSequence / ObserverAbort.

---

## Подэтап 9. ReactiveSequence и ObserverAbort

### Цель

Отменять длительный child по релевантному событию/изменению условия и запускать альтернативную ветвь.

### Зачем

Это центральный результат этапа 2.

### Что уже существует

Общий lifecycle/cleanup, composite stack, queue, simulation events, observers и specialized route abort.

### Файлы

Create:

```text
src/core/ai/events/AiReactiveRuntime.ts
scripts/ai_reactive_runtime_smoke.ts
scripts/ai_reactive_runtime_smoke.mjs
```

Modify:

```text
src/core/ai/AiNodeTypes.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/runtime/AiCompositeRuntime.ts
src/core/ai/AiGraphRuntime.ts
src/core/ai/AiStatefulMoveGameBridge.ts
src/ai-node-editor/stateful-node-ui.ts
package.json
```

### Контракт

Первая node type:

```text
ReactiveSequence
```

Abort policy:

```text
observe preceding conditions
abort active child when a relevant dependency becomes false
return failure to parent Selector
parent may start next alternative
```

Trace:

```text
event id/type
observer id
abort source node
old branch
active child
cleanup outcome
new branch
```

### Миграции

Старые SequenceWithMemory не становятся reactive автоматически. Specialized route cancel переводится в event-driven path; compatibility direct cancel удаляется только после parity smoke.

### Русский интерфейс

```text
Реактивная последовательность
Следить за условиями во время действия
Причина прерывания
Старая ветвь / новая ветвь
```

### Последовательность

1. RED preceding condition false cancels Move.
2. RED cleanup before alternative branch start.
3. RED irrelevant event does not wake/reevaluate.
4. RED route_blocked triggers same token-safe cancel as old path.
5. RED player order remains.
6. Implement dependency set from preceding conditions.
7. On relevant event evaluate only dependencies.
8. Abort child, await synchronous cleanup result, pop frames, return failure.
9. Parent Selector chooses alternative.
10. Remove direct specialized cancel only after all route smoke green.

### RED-тест

```text
condition true
→ Move running
→ irrelevant ammo event: no wake
→ target_lost: condition false
→ cancel + clear owned order
→ Selector alternative Wait starts
```

### Минимальная реализация

No restart_child, lower-priority/self abort variants, parallel branches.

### GREEN-тест

```text
npm run reactive-runtime:smoke
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run build
```

### Регрессии

No double begin_move, no double cleanup, player replacement preserved.

### Performance

Each event carries wake targets/dependencies; no full graph rerun on irrelevant event. Counter `runtimeWakeupsByReason`.

### Ручная проверка

Prepare `runtime-reactive-abort.png`; ask before running.

### Не входит

Complex restart policies.

### Готовность

Universal reactive abort replaces route-only direct mechanism without ownership regression.

### Следующий подэтап

10. WaitForEvent.

---

## Подэтап 10. WaitForEvent v1

### Цель

Добавить action, которая спит до подходящего события или timeout.

### Зачем

Позволяет последовательности ждать приказ/готовность/завершение без polling.

### Что уже существует

Queue and lifecycle registry.

### Файлы

Create:

```text
src/core/ai/runtime/actions/WaitForEventAction.ts
scripts/ai_wait_for_event_smoke.ts
scripts/ai_wait_for_event_smoke.mjs
```

Modify:

```text
src/core/ai/AiNodeTypes.ts
src/core/ai/AiGraphValidation.ts
src/ai-node-editor/stateful-node-ui.ts
src/core/ai/AiGraphRuntime.ts
package.json
```

### Контракт

Parameters:

```text
eventType
sourceId? / sourceMode
targetId? / targetMode
timeoutSeconds
consumePolicy: consume_once | keep_latest
writePayloadTo?
```

Semantics:

- `consume_once`: первый подходящий event завершает action и удаляется.
- `keep_latest`: при нескольких подходящих используется новейший, остальные coalesced/consumed по правилу.
- expired never matches.
- timeout uses simulation time and cleanup.

### Миграции

Нет; новая node type.

### Русский интерфейс

```text
Ждать событие
Тип события
Источник
Цель
Максимальное время
После получения: взять первое / взять последнее
Записать данные в память
```

### Последовательность

1. RED wait with empty queue.
2. RED irrelevant event stays queued/does not wake.
3. RED expired ignored.
4. RED consume_once.
5. RED keep_latest.
6. RED timeout and pause.
7. Register action and editor controls.

### RED-тест

WaitForEvent order_received ignores ammo_empty, then succeeds on target order.

### Минимальная реализация

No `queue_all`, restart_child, streaming payload.

### GREEN-тест

```text
npm run event-queue:smoke
npm run reactive-runtime:smoke
npm run runtime:smoke
npm run editor:smoke
npm run validate:ai-graph
npm run build
```

плюс wait-for-event smoke.

### Регрессии

Queue order and expiry.

### Performance

Action registers filter; wake only when matching type/target candidate exists.

### Ручная проверка

Prepare `runtime-wait-for-event.png`; ask before running.

### Не входит

Queue-all/restart policies.

### Готовность

WaitForEvent resume/snapshot/timeout/consume behavior deterministic.

### Следующий подэтап

11. Timeout + bounded Retry.

---

## Подэтап 11. Timeout и ограниченный Retry

### Цель

Добавить минимальные управляющие modifiers, необходимые для безопасного длительного поведения.

### Зачем

Встроенные timeout параметров Wait/Move не композиционны; Retry не должен создавать бесконечный loop.

### Что уже существует

Simulation time, lifecycle cleanup, composite stack.

### Файлы

Create:

```text
src/core/ai/runtime/AiModifierRuntime.ts
scripts/ai_modifier_runtime_smoke.ts
scripts/ai_modifier_runtime_smoke.mjs
```

Modify:

```text
src/core/ai/AiNodeTypes.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGraphRuntime.ts
src/core/ai/runtime/AiCompositeRuntime.ts
src/ai-node-editor/stateful-node-ui.ts
package.json
```

### Контракты

`Timeout`:

```text
timeoutSeconds
onTimeout: failure | success
```

`Retry`:

```text
maxAttempts: 1..N
delaySeconds
retryOn: failure
```

Local state:

```text
childStartedAtMs
attempt
waitingUntilMs?
```

Правила:

- Timeout cancels child, then cleanup, then returns configured terminal.
- Retry starts next attempt only after previous terminal cleanup.
- maxAttempts mandatory and bounded, например ≤20.
- pause does not consume timeout/delay.
- child start count equals attempts, never extra.

### Миграции

Built-in `timeoutSeconds` Wait/Move remain supported for old graphs. New authoring should prefer modifier; automatic conversion later.

### Русский интерфейс

```text
Ограничить время
Повторить при провале
Максимум попыток
Пауза между попытками
```

### Последовательность

1. RED timeout cancels Move and clears owned order.
2. RED pause excludes time.
3. RED Retry max attempts.
4. RED Retry delay.
5. RED cleanup between attempts.
6. Implement modifier frames.
7. Add validation against 0/unbounded attempts and child count !=1.

### RED-тест

Always-failing child with maxAttempts=3 ends after exactly three starts/cleanups.

### Минимальная реализация

No Repeat/Invert/ForceSuccess/ForceFailure/UntilSuccess/UntilFailure/Cooldown modifier.

### GREEN-тест

```text
npm run runtime:smoke
npm run move-bridge:smoke
npm run reactive-runtime:smoke
npm run validate:ai-graph
npm run editor:smoke
npm run build
```

плюс modifier smoke.

### Регрессии

Old per-node cooldown and old timeout still work.

### Performance

Per tick bounded transitions; runtime has `maxTransitionsPerTick` guard to stop pathological instant retry chains.

### Ручная проверка

Prepare `runtime-timeout-retry.png`; ask before running.

### Не входит

Infinite repeat.

### Готовность

Timeout and Retry cannot leak handles or loop forever.

### Следующий подэтап

12. Unified diagnostics and final Gate A.

---

## Подэтап 12. Общая диагностика событий/отмен и финальный Gate A

### Цель

Свести runtime, events, observers, cleanup, snapshot and metrics в один объяснимый contract и доказать оба этапа одним сценарием.

### Зачем

Функциональность без объяснимого trace нельзя считать готовой.

### Что уже существует

Runtime debug overlay, movement extension, Russian statuses.

### Файлы

Modify:

```text
src/core/ai/AiGraphRuntime.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiStatefulMoveGameBridge.ts
src/ai-node-editor/runtime-debug-overlay.ts
src/ai-node-editor/stateful-move-debug.ts
src/ai-node-editor/ai-node-editor.css
scripts/ai_node_editor_smoke.mjs
tests/ai-running-move.spec.ts
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/JOURNAL.md
docs/subprojects/ai-single-unit-editor/HANDOFF.md
```

Create:

```text
tests/ai-runtime-events.spec.ts
docs/subprojects/ai-single-unit-editor/STATEFUL_RUNTIME_AND_EVENTS_V2.md
```

Generated after `subproject.json` update:

```text
docs/subprojects/ai-single-unit-editor/STATUS.md
другие generated docs, определённые docs:generate
```

### Контракты

Debug payload v2:

```text
session version/status
active frame path
active node/progress
lifecycle phase
cleanup status/count
terminal reason
event queue size/counters
last consumed event
observer/wakeup reason
abort source
old/new branch
snapshot restored flag/version
runtime ticks
full evaluations
targeted wakeups
```

### Миграции

Debug reader accepts v1 payload and hides absent v2 fields.

### Русский интерфейс

Все ключевые поля по-русски; raw IDs доступны как вторичная техническая строка.

### Последовательность

1. Добавить единый headless Gate A fixture.
2. Добавить negative assertions.
3. Расширить debug payload.
4. Обновлять существующие DOM элементы по signature/revision; не пересоздавать тяжёлую панель на каждый poll.
5. Добавить Playwright fixtures и screenshot paths.
6. Обновить canonical docs через `subproject.json`.
7. Запустить `npm run docs:sync`; убедиться, что повторный запуск не создаёт diff.
8. Выполнить полный non-visual gate.
9. Подготовить visual command, но спросить разрешение до запуска.

### RED-тест

Единый сценарий ниже должен падать до полного завершения.

### Минимальная реализация

Только diagnostics, tests и docs; новых mechanics сверх предыдущих slices нет.

### GREEN-тест — полный набор

```text
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run runtime:smoke
npm run move-bridge:smoke
npm run route-status:smoke
npm run pathfinding:smoke
npm run routed-move:smoke
npm run build
npm run docs:check
```

Плюс все новые команды, реально добавленные подэтапами 1–11.

### Performance gate

На контрольном сценарии фиксировать:

```text
queue never exceeds max
irrelevant event wakeups = 0
full graph evaluations occur only at start/replan/alternative selection
no awareness rebuild in frequent event/route poll
maxTransitionsPerTick not exceeded
cleanupCount equals terminal action count
no active handles after terminal
```

### Ручная проверка

Подготовить Playwright и PNG:

```text
runtime-event-queue.png
runtime-reactive-abort.png
runtime-wait-for-event.png
runtime-timeout-retry.png
runtime-snapshot-restored.png
```

Перед фактическим запуском обязательно спросить:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

### Не входит

Новые боевые actions, parallel, multi-unit.

### Готовность

Все Gate A positive/negative checks green; generated docs clean; visual run либо выполнен после разрешения, либо честно отмечен `not run — awaiting user approval`.

## 10. Обязательный итоговый сценарий Gate A

```text
боец получает приказ движения
→ создаётся order_received
→ MoveTo переходит в Running
→ Sequence/Utility execution frame сохраняет активного ребёнка
→ приходит релевантное событие route_blocked или target_lost
→ наблюдаемое условие меняется
→ ReactiveSequence фиксирует источник abort
→ активное движение получает cancel
→ cleanup с ownerToken очищает только AI-приказ
→ Selector запускает альтернативную ветвь
→ WaitForEvent ожидает новое order_received/weapon_ready_changed
→ нерелевантное событие не будит ветвь
→ подходящее событие приходит и consume_once завершает ожидание
→ последовательность продолжается
→ запускается Reload или другое длительное registry-действие
→ сцена сохраняется во время длительного действия
→ сцена загружается
→ active frame/action/event queue восстанавливаются
→ start активного действия не повторяется
→ действие корректно завершается
→ trace объясняет event, observer, cancel, cleanup, branch switch, restore и terminal
```

## 11. Обязательные негативные проверки

```text
нерелевантное событие не будит ветвь;
истёкшее событие не применяется;
одинаковое Blackboard-значение не создаёт повтор;
гистерезис StableThreshold не шумит;
coalescing не объединяет разные приказы;
overflow не теряет критический order event молча;
Retry не создаёт бесконечный цикл;
Timeout отменяет child и вызывает cleanup ровно один раз;
player order не удаляется stale AI cleanup;
после terminal state нет занятых handles/frames;
пауза не расходует Wait/Timeout/Retry delay/event expiry;
preview evaluate не меняет session/queue/world;
старый graph v1 загружается;
старая scene без runtime snapshot загружается;
несовместимый snapshot безопасно сбрасывается;
загрузка посреди Move/Reload не вызывает повторный start;
A* не запускается в 60 ms route/event poll;
irrelevant event не вызывает полный Blackboard rebuild или full graph evaluation.
```

## 12. Что считать окончательным закрытием этапов 1–2

Этап 1 закрыт только если:

- есть явный per-unit serializable session;
- start/update/cancel/cleanup общие и cleanup exact-once;
- nested stateful compositions и Utility evaluation/execution доказаны;
- Wait, Move и хотя бы одна новая non-movement action работают через registry;
- scene snapshot восстанавливает action без повторного start;
- debug показывает lifecycle/progress/terminal/restore;
- старые graph/scene совместимы.

Этап 2 закрыт только если:

- есть общий AiEvent и bounded deterministic queue;
- simulation transitions публикуют события без шума;
- observers работают по revisions/normalized values;
- ReactiveSequence/ObserverAbort универсально отменяет active child;
- WaitForEvent v1 работает;
- Timeout и bounded Retry безопасны;
- irrelevant events не вызывают full graph evaluation;
- queue/wakeup/cleanup metrics видны;
- Gate A и негативные проверки зелёные.

## 13. Первый рекомендуемый подэтап

Начать с:

```text
Подэтап 0 — фиксация baseline
затем
Подэтап 1 — явный runtime session envelope
```

Не начинать сразу с событий. Общая реактивность зависит от exact-once cleanup, composite frames и snapshot-compatible session.

## 14. Правила передачи между чатами

После каждого подэтапа исполнитель сообщает:

```text
branch
commit
changed files
checks actually run
checks not run and why
visual QA prepared/run/not run
main touched: no
transfer_path
cleanup_status
next safe slice
```

Для временной ветки до отдельного разрешения:

```text
transfer_path: isolated branch only
cleanup_status: left open
reason: пользователь попросил пока не переносить изменения в real-wargame-preview
```
