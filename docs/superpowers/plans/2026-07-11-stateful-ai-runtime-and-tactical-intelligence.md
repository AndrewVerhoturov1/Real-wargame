# Stateful AI Runtime and Tactical Intelligence — подробный план внедрения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить существующий одноразово вычисляемый `AiGraphRunner + UtilitySelector` в состоянийную, событийную, объяснимую и масштабируемую систему поведения, которая умеет исполнять длительные планы, искать тактические позиции, занимать реальные слоты укрытий, работать с субъективным восприятием и позднее управлять несколькими бойцами.

**Architecture:** Сохранить текущий чистый core без PixiJS/DOM и использовать `AiGameBridge` как адаптер между AI runtime и RTS-симуляцией. Новая архитектура строится слоями: stateful runtime → события и реактивность → типизированные подграфы → иерархические состояния и планы → trace/replay → безопасный параллелизм → Tactical Query System → Smart Objects → Perception → multi-agent scheduler → массовые сценарные тесты.

**Tech Stack:** TypeScript 5.5, Vite 5, PixiJS 7.4, Vitest для модульных тестов, Node.js для headless-сценариев, Playwright + system Chrome для реальной браузерной проверки, GitHub Actions для screenshot artifacts.

## Global Constraints

- Работать только в `real-wargame-preview`; `main` не менять без явного GO пользователя.
- Пользователь не должен вводить команды в терминале: основной живой запуск остаётся `Run-Real-Wargame-Lab.bat`.
- `src/core/**` не импортирует PixiJS, DOM, `window`, `localStorage` или UI-компоненты.
- `AiGameBridge` остаётся адаптером; core runtime не получает прямой доступ к `SimulationState`.
- Не переписывать всю RTS-симуляцию; расширять существующие `SimulationState`, `SimulationTick`, `BehaviorModel`, `UnitModel` через чёткие контракты.
- Сначала стабилизировать одного выбранного бойца. Подключение нескольких бойцов разрешено только после прохождения контрольных точек A–C.
- Awareness, Tactical Query и Perception используют субъективные знания конкретного бойца, а не скрытую объективную информацию мира.
- Тяжёлые расчёты не выполняются в UI-рендере и не пересчитываются без изменения revision/inputs.
- Существующие графы v1, storage v6 и scene-export-v3 должны загружаться через миграции или безопасные значения по умолчанию.
- Русская версия интерфейса и объяснений является версией по умолчанию; служебные идентификаторы и data contract остаются английскими.
- Каждая новая возможность поставляется комплектом: core-логика, объяснение/debug, настройка в редакторе, headless-сценарий и реальная браузерная проверка, если меняется UI.
- Не добавлять полный GOAP, HTN, LLM для каждого бойца, многопоточность или обучение во время боя в рамках этого плана.
- Не добавлять полный произвольный параллелизм до появления жизненного цикла, отмены и владения каналами действий.
- Не запускать полный Tactical Query каждого бойца каждый кадр.
- Не считать этап завершённым только по чтению кода. Нужны реальные команды проверок и, для UI, свежие PNG точного commit SHA.

---

# 1. Источники правды и обязательное чтение перед реализацией

Перед началом любого этапа исполнитель читает:

```text
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/AGENT_START_HERE.md
docs/subprojects/ai-single-unit-editor/HANDOFF.md
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/subproject.json
ideas/AI_BEHAVIOR_NODE_SYSTEM_FEATURES.md
этот план
```

Для UI, браузерных проверок и скриншотов дополнительно:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
.github/workflows/preview-screenshots.yml
playwright.config.ts
tests/preview-screenshots.spec.ts
docs/manual-test/PREVIEW_SCREENSHOTS.md
```

Для рендера, слоёв и производительности дополнительно:

```text
docs/ai/PIXIJS_SKILLS_INDEX.md
.agents/skills/pixijs/SKILL.md
src/rendering/PixiApp.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
src/ui/TacticalWorkspace.ts
```

---

# 2. Текущее состояние и причины выбранного порядка

Сейчас система уже имеет:

```text
AiGraphRunner
UtilitySelector
Sequence / Selector / ActionBranch
score-ноды и veto
cooldown
StableThreshold
DecisionInertia
RandomChance
AiGameBridge
личную память угроз
awareness grid
runtime trace последнего расчёта
редактор нод
Simulation / Editing workspace
Playwright screenshot workflow
```

Но текущий `AiGraphRunner` в основном вычисляет граф за один вызов и возвращает статусы:

```text
pass
fail
skip
select
veto
```

Действия `move_to`, `reload`, `fire`, `set_posture` сейчас применяются как эффекты одного расчёта. Состояние активной ноды между тиками не является полноценным объектом runtime. Поэтому нельзя надёжно выразить:

```text
начать движение
продолжать движение
остановить движение при новой угрозе
сохранить прогресс
восстановить прогресс
освободить зарезервированное укрытие при отмене
```

Порядок этапов выбран по зависимостям:

```text
1. Сначала время и жизненный цикл.
2. Затем реактивность и события.
3. Затем типы и подграфы.
4. Затем состояния и планы.
5. Затем профессиональная отладка.
6. Только после этого параллельные действия.
7. Затем сложный пространственный поиск.
8. Затем реальные занимаемые позиции.
9. Затем полноценное восприятие.
10. Затем несколько бойцов.
11. Затем масштабирование.
12. Затем массовая оценка качества.
```

Если поменять порядок, появятся системы, которые невозможно корректно исполнять или отлаживать.

---

# 3. Целевая архитектура

```text
SIMULATION CORE
│
├─ мир, карта, юниты, приказы
├─ движение и столкновения
├─ объекты и слоты
└─ объективные события
│
▼
PERCEPTION ADAPTERS
│
├─ зрение
├─ слух
├─ урон
├─ сообщения
└─ изменения объектов
│
▼
SUBJECTIVE KNOWLEDGE
│
├─ stimuli
├─ confidence
├─ uncertainty
├─ age / expiry
└─ predicted positions
│
▼
HIERARCHICAL STATE
│
├─ FollowingOrder
├─ Contact
├─ Suppressed
├─ Wounded
├─ Retreating
└─ Panicked
│
▼
UTILITY SELECTOR
│
└─ выбирает лучший допустимый вариант
│
▼
TACTICAL QUERY SYSTEM
│
├─ generators
├─ contexts
├─ hard filters
├─ scorers
└─ selected candidate
│
▼
AI PLAN
│
├─ goal
├─ steps
├─ abort conditions
└─ replan conditions
│
▼
BEHAVIOR SUBGRAPH
│
├─ reactive sequences
├─ retries
├─ timeouts
├─ waits
└─ controlled parallel branches
│
▼
STATEFUL ACTION RUNTIME
│
├─ start
├─ running / waiting
├─ success / failure
├─ cancel
└─ cleanup
│
▼
ACTIONS / EFFECTS
│
├─ movement
├─ posture
├─ body rotation
├─ aim
├─ fire
├─ speech
└─ interaction
│
▼
TRACE / REPLAY / DEBUG
   ├─ timeline
   ├─ blackboard diff
   ├─ score breakdown
   ├─ query candidates
   ├─ breakpoints
   └─ deterministic replay
```

---

# 4. Карта файлов

## 4.1. Существующие файлы, которые будут расширяться

```text
package.json
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGameBridge.ts
src/core/behavior/BehaviorModel.ts
src/core/units/UnitModel.ts
src/core/simulation/SimulationState.ts
src/core/simulation/SimulationTick.ts
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/SoldierAwarenessGrid.ts
src/core/map/MapModel.ts
src/core/cover/CoverEvaluation.ts
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/pressure/ThreatEvaluation.ts
src/core/ui/RuntimeUiState.ts
src/ui/TacticalWorkspace.ts
src/ui/SceneExport.ts
src/rendering/PixiApp.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
src/ai-node-editor/main.ts
src/ai-node-editor/human-node-ui.ts
src/ai-node-editor/runtime-debug-overlay.ts
src/ai-node-editor/ai-test-lab-node-options.ts
scripts/ai_engine_core.mjs
scripts/local_ai_engine.mjs
scripts/local_ai_engine_smoke.mjs
scripts/ai_node_editor_smoke.mjs
scripts/ai_test_lab_smoke.mjs
scripts/tactical_workspace_smoke.mjs
tests/preview-screenshots.spec.ts
```

## 4.2. Новые каталоги и ответственность

```text
src/core/ai/runtime/
  AiRuntimeTypes.ts          — статусы, ids, результаты тика
  AiRuntimeSession.ts        — живое состояние графа конкретного бойца
  AiRuntimeSnapshot.ts       — сериализация и восстановление
  AiNodeLifecycle.ts         — контракт start/update/cancel/cleanup
  AiActionRegistry.ts        — регистрация исполняемых action-нод
  AiCompositeRuntime.ts      — Sequence/Selector/Utility в stateful-режиме
  AiRuntimeCompat.ts         — совместимость с runAiGraph v1

src/core/ai/events/
  AiEvent.ts                 — формат события
  AiEventQueue.ts            — очередь, expiry, coalescing
  AiBlackboardObserver.ts    — подписки на ключи и изменения
  AiReactiveRuntime.ts       — abort/restart реактивных ветвей

src/core/ai/contracts/
  AiNodeContract.ts          — схема параметров и портов
  AiNodeContractRegistry.ts  — единый реестр типов
  AiPortTypes.ts             — типы портов и совместимость
  AiGraphMigration.ts        — v1 → v2 и будущие миграции
  AiSubgraphRegistry.ts      — загрузка и разрешение подграфов

src/core/ai/state/
  AiStateMachine.ts          — состояния и переходы
  AiStateRuntime.ts          — активный state stack
  AiPlan.ts                  — объект плана
  AiPlanRuntime.ts           — шаги, abort/replan

src/core/ai/trace/
  AiTraceTypes.ts            — типы событий trace
  AiTraceBuffer.ts           — ограниченный ring buffer
  AiBlackboardDiff.ts        — изменения памяти
  AiRuntimeRecorder.ts       — запись воспроизводимого сеанса
  AiRuntimeReplay.ts         — повтор
  AiBreakpointManager.ts     — точки останова
  AiFaultInjection.ts        — искусственные отказы
  AiRuntimeProfiler.ts       — длительность и счётчики

src/core/ai/parallel/
  AiActionChannels.ts        — владение Movement/Posture/etc.
  AiParallelRuntime.ts       — SimpleParallel / Parallel
  AiJoinRuntime.ts           — WaitForAll / WaitForAny

src/core/ai/query/
  TacticalQueryTypes.ts      — definition/context/candidate/result
  TacticalQueryRuntime.ts    — конвейер запроса
  TacticalQueryGenerators.ts — генераторы
  TacticalQueryFilters.ts    — жёсткие фильтры
  TacticalQueryScorers.ts    — мягкие оценки
  TacticalQueryCache.ts      — revision-based cache
  TacticalQueryBudget.ts     — лимиты стоимости
  TacticalQueryTrace.ts      — диагностика кандидатов

src/core/smart-objects/
  SmartObjectTypes.ts        — объект, слот, capabilities
  SmartObjectRegistry.ts     — индекс объектов
  SmartObjectReservation.ts  — claim/reserve/occupy/release
  SmartObjectLifecycle.ts    — invalidation/destruction
  CoverSlotBuilder.ts        — построение слотов для укрытий

src/core/perception/
  Stimulus.ts                — общий формат сенсорного события
  PerceptionRuntime.ts       — обработка стимулов
  SightSensor.ts             — зрение
  HearingSensor.ts           — слух
  DamageSensor.ts            — полученный урон
  ReportSensor.ts            — сообщения
  KnowledgeFusion.ts         — объединение и противоречия
  KnowledgeDecay.ts          — забывание
  TargetPrediction.ts        — прогноз положения

src/core/ai/scheduling/
  AiScheduler.ts             — распределение AI-работы по кадрам
  AiPriority.ts              — приоритет агента
  AiBudget.ts                — бюджет времени/операций
  AiLodPolicy.ts             — частота и качество расчётов

src/core/testing/scenarios/
  AiScenarioTypes.ts         — формат сценария
  AiScenarioRunner.ts        — headless-прогон
  AiScenarioAssertions.ts    — ожидаемые/запрещённые события
  AiScenarioMetrics.ts       — метрики
  AiScenarioMatrix.ts        — вариации seed/параметров
  AiScenarioReport.ts        — отчёт сравнения

src/rendering/
  PixiTacticalQueryRenderer.ts — кандидаты и оценки на карте
  PixiSmartObjectSlotRenderer.ts — слоты/резервации
  PixiPerceptionRenderer.ts     — стимулы/неопределённость

src/ui/
  AiTimelinePanel.ts         — временная шкала
  AiBlackboardHistoryPanel.ts — diff памяти
  TacticalQueryInspector.ts  — подробности запроса
  SmartObjectInspector.ts    — слоты и занятость

src/ai-node-editor/
  node-contract-ui.ts        — UI типизированных параметров/портов
  subgraph-ui.ts             — выбор/открытие подграфа
  state-machine-ui.ts        — состояния и переходы
  timeline-ui.ts             — связь редактора с trace

scripts/
  ai_runtime_parity.mjs
  ai_scenario_runner.mjs
  ai_scenario_compare.mjs
  ai_runtime_benchmark.mjs
  ai_graph_migrate.mjs

tests/unit/ai/
  runtime/
  events/
  contracts/
  state/
  trace/
  parallel/
  query/
  smart-objects/
  perception/
  scheduling/
  scenarios/
```

---

# 5. Общая стратегия тестирования

## 5.1. Добавить Vitest

В `package.json` добавить:

```json
{
  "scripts": {
    "test:unit": "vitest run tests/unit",
    "test:ai": "vitest run tests/unit/ai",
    "test:ai:watch": "vitest tests/unit/ai",
    "test:scenarios": "node scripts/ai_scenario_runner.mjs --all",
    "test:parity": "node scripts/ai_runtime_parity.mjs",
    "test:benchmark": "node scripts/ai_runtime_benchmark.mjs"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

Точную совместимую версию при реализации проверить по актуальному npm lockfile; не обновлять остальные зависимости без необходимости.

## 5.2. Пирамида проверок

```text
Много быстрых unit tests
→ headless integration scenarios
→ существующие smoke scripts
→ production build
→ реальный Playwright browser
→ ручной запуск через .bat
```

## 5.3. Базовый набор после каждого task

Запускать минимум:

```text
npm run test:ai -- <затронутый набор>
npm run build
```

После изменения graph format/editor:

```text
npm run validate:ai-graph
npm run editor:smoke
npm run engine:smoke
npm run build
```

После изменения интеграции с игрой:

```text
npm run test:ai
npm run lab:smoke
npm run workspace:smoke
npm run game-editor:smoke
npm run build
```

После изменения UI/рендера:

```text
полный smoke-набор
Playwright exact-SHA workflow
скачивание PNG и playwright log
визуальная проверка каждого изменённого состояния
```

## 5.4. Общий Definition of Done этапа

Этап завершён только когда:

- все новые типы и интерфейсы документированы;
- новая логика имеет unit tests;
- минимум один headless scenario доказывает вертикальный результат;
- старые графы/сцены проходят миграцию;
- существующие smoke/build проверки проходят;
- UI имеет русские подписи и объяснения;
- новые debug данные не требуют чтения консоли;
- performance counters не показывают незапланированный постоянный пересчёт;
- для UI получены и проверены свежие PNG точного SHA;
- обновлены `SUBPROJECT.md`, `JOURNAL.md`, `HANDOFF.md`, manual-test документ и `subproject.json`;
- commit имеет узкий смысл и понятное сообщение;
- `main` не изменён.

---

# КОНТРОЛЬНАЯ ТОЧКА 0 — исходная страховочная сетка

# Этап 0. Зафиксировать существующее поведение

## Почему этот этап обязателен

GraphRunner v2 меняет семантику исполнения. До изменения нужно зафиксировать, как работают существующие:

- `UtilitySelector`;
- score breakdown;
- veto;
- cooldown;
- StableThreshold;
- RandomChance;
- эффекты;
- blackboard memory;
- local JS engine.

Иначе после переписывания невозможно отличить сознательное изменение от регрессии.

## Task 0.1. Подключить модульный test runner

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/unit/ai/test-fixtures.ts`
- Create: `tests/unit/ai/current-runner.spec.ts`

**Interfaces:**

- Produces: команды `test:unit`, `test:ai`, `test:ai:watch`.
- Produces: `makeTestGraph()`, `makeTestBlackboard()`, `makeTestTacticalHost()`.

- [ ] Добавить падающий smoke/assertion, проверяющий наличие команды `test:ai`.
- [ ] Добавить Vitest без изменения runtime dependencies.
- [ ] Настроить `environment: 'node'` и запрет случайного доступа к DOM.
- [ ] Написать первый тест: Root → ActionBranch → SetAction возвращает выбранную ветвь и effect.
- [ ] Написать тест, что `AiGraphRunner.ts` импортируется в Node без `window`/DOM.
- [ ] Запустить `npm run test:ai`; ожидается PASS.
- [ ] Запустить существующий полный smoke/build набор.
- [ ] Commit: `test(ai): add unit test harness for graph runtime`.

## Task 0.2. Golden fixtures текущего GraphRunner

**Files:**

- Create: `tests/fixtures/ai-runtime-v1/basic-action.json`
- Create: `tests/fixtures/ai-runtime-v1/utility-veto.json`
- Create: `tests/fixtures/ai-runtime-v1/stable-threshold.json`
- Create: `tests/fixtures/ai-runtime-v1/cooldown.json`
- Create: `tests/fixtures/ai-runtime-v1/random-seed.json`
- Create: `tests/unit/ai/runtime-v1-golden.spec.ts`

**Interfaces:**

- Fixture input: `{ graph, unitId, blackboard, cooldowns, nowMs, tacticalHostFixture }`.
- Fixture expected: `{ selectedBranchNodeId, scores, effects, blackboard, cooldowns, trace }`.

- [ ] Сохранить реальные результаты текущего runner как утверждённые fixtures.
- [ ] Не нормализовать важные поля; разрешено убрать только нестабильные timestamps.
- [ ] Проверить точное равенство score breakdown и veto reason.
- [ ] Проверить deterministic `RandomChance` для одинакового `unitId/nodeId/nowMs`.
- [ ] Проверить, что изменение `nowMs` меняет бросок только ожидаемым образом.
- [ ] Запустить тесты 100 раз в цикле; результат не должен плавать.
- [ ] Commit: `test(ai): capture v1 graph runner golden behavior`.

## Task 0.3. Parity harness TypeScript и local JS engine

**Files:**

- Create: `scripts/ai_runtime_parity.mjs`
- Modify: `scripts/ai_engine_core.mjs`
- Modify: `scripts/local_ai_engine_smoke.mjs`
- Create: `tests/fixtures/ai-runtime-parity/*.json`

**Interfaces:**

- Produces CLI: `npm run test:parity`.
- Выход: таблица fixture / TS result hash / JS result hash / mismatch fields.

- [ ] Экспортировать из local JS engine чистую функцию, пригодную для parity-runner.
- [ ] Запустить одинаковые fixtures через оба исполнителя.
- [ ] Сравнивать selected branch, scores, veto, effects, blackboard writes и cooldowns.
- [ ] Зафиксировать известные различия отдельным allow-list с пояснениями; не скрывать неизвестные расхождения.
- [ ] Сделать mismatch причиной non-zero exit code.
- [ ] Commit: `test(ai): add TypeScript and local engine parity checks`.

## Task 0.4. Базовые сценарии и performance baseline

**Files:**

- Create: `src/data/ai/scenarios/open-field-safe.json`
- Create: `src/data/ai/scenarios/under-fire-cover.json`
- Create: `src/data/ai/scenarios/no-cover.json`
- Create: `src/data/ai/scenarios/low-ammo.json`
- Create: `src/data/ai/scenarios/order-versus-danger.json`
- Create: `scripts/ai_runtime_benchmark.mjs`
- Create: `docs/performance/AI_RUNTIME_BASELINE.md`

- [ ] Для каждого сценария записать начальные данные, ожидаемую ветвь и объяснение.
- [ ] Измерить 1, 1000 и 10000 evaluate-once вызовов без UI.
- [ ] Зафиксировать p50, p95, max, heap delta и environment.
- [ ] Не использовать baseline как вечный абсолют; использовать его как сигнал регрессии.
- [ ] Commit: `test(ai): add baseline scenarios and runtime benchmark`.

## Gate 0 — обязательные проверки

```text
npm run test:ai
npm run test:parity
npm run test:benchmark
npm run lab:smoke
npm run workspace:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

**Exit criteria:** текущее поведение полностью зафиксировано, оба исполнителя сравнимы, baseline сохранён.

---

# КОНТРОЛЬНАЯ ТОЧКА A — Stateful AI Runtime

# Этап 1. GraphRunner v2: состояние и время

## Цель

Создать живую `AiRuntimeSession`, которая существует между тиками и поддерживает `Running`, `Waiting`, отмену, cleanup, pause и snapshot.

## Основные интерфейсы

```ts
export type AiNodeStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface AiNodeTickResult {
  status: AiNodeStatus;
  reason: string;
  reasonRu?: string;
  wakeAtMs?: number;
}

export interface AiNodeLifecycle<TState = unknown> {
  start(context: AiNodeContext): TState;
  update(context: AiNodeContext, state: TState): AiNodeTickResult;
  cancel(context: AiNodeContext, state: TState, reason: string): void;
  cleanup(context: AiNodeContext, state: TState): void;
  serialize?(state: TState): unknown;
  deserialize?(value: unknown): TState;
}

export interface AiRuntimeSessionSnapshot {
  version: 1;
  graphId: string;
  unitId: string;
  simulationTimeMs: number;
  activeNodeIds: string[];
  nodeStates: Record<string, unknown>;
  blackboard: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  selectedBranchNodeId: string | null;
}
```

## Task 1.1. Runtime types и пустая session

**Files:**

- Create: `src/core/ai/runtime/AiRuntimeTypes.ts`
- Create: `src/core/ai/runtime/AiRuntimeSession.ts`
- Create: `tests/unit/ai/runtime/session.spec.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`
- Modify: `src/core/units/UnitModel.ts`

**Interfaces:**

- Produces: `createAiRuntimeSession(graph, unitId, blackboard)`.
- Produces: `tickAiRuntimeSession(session, input)`.
- Produces: `cancelAiRuntimeSession(session, reason)`.
- `UnitBehaviorRuntime` хранит только serializable runtime handle/snapshot, а не DOM/runtime functions.

- [ ] Написать падающие тесты статусов и создания session.
- [ ] Реализовать session без action-нод: Root может завершить пустой граф.
- [ ] Проверить, что session сохраняет graph id, unit id, time и blackboard.
- [ ] Проверить, что две session одного графа не делят node state.
- [ ] Не изменять старый `runAiGraph` на этом шаге.
- [ ] Commit: `feat(ai): add stateful runtime session foundation`.

## Task 1.2. Lifecycle registry

**Files:**

- Create: `src/core/ai/runtime/AiNodeLifecycle.ts`
- Create: `src/core/ai/runtime/AiActionRegistry.ts`
- Create: `tests/unit/ai/runtime/lifecycle.spec.ts`

**Interfaces:**

```ts
registerAiAction(type: string, lifecycle: AiNodeLifecycle): void;
getAiAction(type: string): AiNodeLifecycle | undefined;
```

- [ ] Тест: `start` вызывается ровно один раз.
- [ ] Тест: `update` вызывается на последующих тиках.
- [ ] Тест: после terminal status `update` больше не вызывается.
- [ ] Тест: `cleanup` вызывается ровно один раз после success/failure/cancel.
- [ ] Тест: исключение lifecycle превращается в controlled failure с trace, а cleanup всё равно вызывается.
- [ ] Реализовать registry без singleton-зависимости от UI.
- [ ] Commit: `feat(ai): add node lifecycle and action registry`.

## Task 1.3. Stateful composite nodes

**Files:**

- Create: `src/core/ai/runtime/AiCompositeRuntime.ts`
- Create: `tests/unit/ai/runtime/sequence.spec.ts`
- Create: `tests/unit/ai/runtime/selector.spec.ts`
- Create: `tests/unit/ai/runtime/utility-selector.spec.ts`

**Interfaces:**

- `Sequence` хранит current child index.
- `Selector` хранит current child index и отменяет active child при reset.
- `UtilitySelector` разделяет evaluation и execution выбранной ветви.

- [ ] Sequence: первый child Running удерживает индекс.
- [ ] Sequence: Success переводит к следующему child.
- [ ] Sequence: Failure завершает sequence и отменяет оставшихся.
- [ ] Selector: Failure переводит к следующему child.
- [ ] Selector: Running удерживает активную ветвь.
- [ ] UtilitySelector: оценивает варианты без применения effects проигравших ветвей.
- [ ] UtilitySelector: выбранная ветвь становится stateful child.
- [ ] UtilitySelector: score reevaluation пока отключена; политика появится в этапе 2.
- [ ] Commit: `feat(ai): add stateful composite node execution`.

## Task 1.4. Первые длительные action-ноды

**Files:**

- Create: `src/core/ai/runtime/actions/WaitAction.ts`
- Create: `src/core/ai/runtime/actions/MoveToAction.ts`
- Create: `src/core/ai/runtime/actions/AimAtAction.ts`
- Create: `src/core/ai/runtime/actions/ReloadAction.ts`
- Create: `src/core/ai/runtime/actions/ObserveSectorAction.ts`
- Create: `tests/unit/ai/runtime/actions/*.spec.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`

**Host contract additions:**

```ts
export interface AiActionHost {
  beginMove(unitId: string, target: GridPosition, mode: string): string;
  getMoveStatus(handleId: string): 'running' | 'succeeded' | 'failed';
  cancelMove(handleId: string): void;
  beginAim(unitId: string, targetKey: string): string;
  getAimStatus(handleId: string): 'running' | 'succeeded' | 'failed';
  cancelAim(handleId: string): void;
  beginReload(unitId: string): string;
  getReloadStatus(handleId: string): 'running' | 'succeeded' | 'failed';
  cancelReload(handleId: string): void;
}
```

- [ ] `WaitAction` завершает работу только после заданного simulation time.
- [ ] `MoveToAction` один раз вызывает `beginMove`, затем опрашивает handle.
- [ ] Отмена `MoveToAction` вызывает `cancelMove` ровно один раз.
- [ ] `ReloadAction` не выдаёт мгновенно полный магазин; прогресс принадлежит action host.
- [ ] Все действия выдают русские причины Running/Success/Failure.
- [ ] Commit: `feat(ai): add first long-running actions`.

## Task 1.5. Интеграция session в AiGameBridge

**Files:**

- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`
- Modify: `src/core/units/UnitModel.ts`
- Create: `src/core/ai/runtime/AiRuntimeHostAdapter.ts`
- Create: `tests/unit/ai/runtime/bridge-integration.spec.ts`

**Interfaces:**

- `AiGameBridge` создаёт/восстанавливает session выбранного бойца.
- `SimulationTick` остаётся владельцем физического движения.
- Runtime host выдаёт handles, связанные с существующим `MoveOrder`.

- [ ] Добавить failing integration test: MoveTo остаётся Running несколько simulation ticks.
- [ ] Отделить `evaluateNow` от `tickNow`: evaluate не изменяет session и мир.
- [ ] `tickNow` обновляет session один раз независимо от browser poll interval.
- [ ] Пауза блокирует обычный tick, но явный step выполняет ровно один AI tick.
- [ ] Смена выбранного бойца не уничтожает session предыдущего бойца; на этом этапе она может быть заморожена.
- [ ] Старый `runAiGraph` остаётся для v1 evaluate-once и parity.
- [ ] Commit: `feat(ai): integrate stateful runtime with game bridge`.

## Task 1.6. Snapshot и восстановление

**Files:**

- Create: `src/core/ai/runtime/AiRuntimeSnapshot.ts`
- Create: `tests/unit/ai/runtime/snapshot.spec.ts`
- Modify: `src/ui/SceneExport.ts`
- Modify: `src/core/units/UnitModel.ts`

- [ ] Сериализовать только данные, не функции и не Map/Set без нормализации.
- [ ] Сохранить активные node states, time, blackboard, cooldowns и selected branch.
- [ ] После восстановления `start` активных нод не вызывается повторно.
- [ ] Несовместимый snapshot возвращает понятную migration error и безопасно начинает новую session.
- [ ] Старые сцены без runtime snapshot загружаются как новая idle session.
- [ ] Commit: `feat(ai): persist and restore active runtime sessions`.

## Task 1.7. Runtime debug overlay v2

**Files:**

- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/ai-node-editor/ai-node-editor.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Добавить статусы `running`, `waiting`, `cancelled`.
- [ ] Показывать длительность активной ноды и текущий progress label.
- [ ] Не пересоздавать все DOM controls при каждом tick; обновлять только изменившиеся badges/text.
- [ ] Добавить screenshot: длительная MoveTo подсвечена как Running.
- [ ] Добавить screenshot: пауза сохраняет активную ветвь.
- [ ] Commit: `feat(ai-editor): show live stateful runtime execution`.

## Gate A1 — тест длительного действия

Headless:

```text
MoveTo starts
→ returns Running for N ticks
→ target reached
→ returns Succeeded
→ Sequence advances to ObserveSector
```

Live browser:

```text
выбрать бойца
→ дать графу выбрать укрытие
→ увидеть Running на MoveTo
→ поставить паузу
→ убедиться, что position/time не меняются
→ выполнить один шаг
→ продолжить
→ увидеть Success и следующий шаг
```

Обязательные команды:

```text
npm run test:ai
npm run test:parity
npm run lab:smoke
npm run workspace:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

---

# Этап 2. События, реактивность и управляющие модификаторы

## Цель

Сделать длительное поведение способным немедленно реагировать на изменения мира и Blackboard.

## Task 2.1. Единый формат событий и очередь

**Files:**

- Create: `src/core/ai/events/AiEvent.ts`
- Create: `src/core/ai/events/AiEventQueue.ts`
- Create: `tests/unit/ai/events/event-queue.spec.ts`
- Modify: `src/core/simulation/SimulationState.ts`

**Interface:**

```ts
export interface AiEvent<T = unknown> {
  id: string;
  type: string;
  sourceId?: string;
  targetId?: string;
  timestampMs: number;
  priority: number;
  expiresAtMs?: number;
  coalesceKey?: string;
  payload: T;
}
```

- [ ] FIFO для одинакового priority/time.
- [ ] Более высокий priority обрабатывается раньше.
- [ ] Expired event удаляется и фиксируется в trace как expired только в debug mode.
- [ ] `coalesceKey` оставляет последнее обновление позиции, но не объединяет разные приказы.
- [ ] Queue имеет жёсткий max size и controlled overflow policy.
- [ ] Commit: `feat(ai): add prioritized expiring event queue`.

## Task 2.2. Адаптеры событий симуляции

**Files:**

- Modify: `src/core/simulation/SimulationState.ts`
- Modify: `src/core/simulation/SimulationTick.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Create: `src/core/ai/events/SimulationAiEvents.ts`
- Create: `tests/unit/ai/events/simulation-events.spec.ts`

Первые события:

```text
enemy_spotted
enemy_lost
shot_nearby
damage_received
order_received
order_cancelled
move_completed
route_blocked
cover_invalidated
```

- [ ] Событие генерируется только при переходе состояния, а не каждый кадр.
- [ ] Новое move order содержит target и order id.
- [ ] `move_completed` связан с handle id длительной ноды.
- [ ] Пауза не изменяет event timestamps.
- [ ] Commit: `feat(ai): publish simulation changes as AI events`.

## Task 2.3. Blackboard observers

**Files:**

- Create: `src/core/ai/events/AiBlackboardObserver.ts`
- Create: `src/core/ai/trace/AiBlackboardDiff.ts`
- Create: `tests/unit/ai/events/blackboard-observer.spec.ts`

- [ ] Подписка на один key.
- [ ] Подписка на threshold crossing.
- [ ] StableThreshold не генерирует шум внутри hysteresis band.
- [ ] Изменение объекта position сравнивается по x/y, а не ссылке.
- [ ] Observer callback не вызывается повторно при одинаковом normalized value.
- [ ] Commit: `feat(ai): add blackboard change observers`.

## Task 2.4. ReactiveSequence и observer abort

**Files:**

- Create: `src/core/ai/events/AiReactiveRuntime.ts`
- Modify: `src/core/ai/runtime/AiCompositeRuntime.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`
- Create: `tests/unit/ai/events/reactive-sequence.spec.ts`

- [ ] Условие перед Running action перепроверяется после relevant event/change.
- [ ] При false активная action получает cancel до запуска альтернативы.
- [ ] Trace содержит `abort source node`, старую ветвь и новую ветвь.
- [ ] Не выполнять полную reevaluation при не относящемся событии.
- [ ] Commit: `feat(ai): add reactive sequence and observer aborts`.

## Task 2.5. WaitForEvent и restart policy

**Files:**

- Create: `src/core/ai/runtime/actions/WaitForEventAction.ts`
- Create: `tests/unit/ai/events/wait-for-event.spec.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`

Policies:

```text
consume_once
keep_latest
queue_all
restart_child
abort_child
```

- [ ] `consume_once` завершает ноду одним событием.
- [ ] `keep_latest` возвращает самый новый payload.
- [ ] `queue_all` обрабатывает события в порядке priority/time.
- [ ] `restart_child` отменяет child, очищает его local state и запускает заново.
- [ ] Commit: `feat(ai): add event waiting and restart policies`.

## Task 2.6. Modifier nodes

**Files:**

- Create: `src/core/ai/runtime/AiModifierRuntime.ts`
- Create: `tests/unit/ai/runtime/modifiers.spec.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`
- Modify: `src/ai-node-editor/human-node-ui.ts`

Добавить:

```text
Timeout
Retry
Repeat
Invert
ForceSuccess
ForceFailure
RunOnce
Delay
```

- [ ] Timeout использует simulation time, не `Date.now()`.
- [ ] Timeout отменяет Running child и ждёт cleanup.
- [ ] Retry имеет max attempts и delay.
- [ ] Repeat имеет max count или explicit forever flag; бесконечный режим требует внешнего cancel.
- [ ] RunOnce хранит результат в выбранной memory scope.
- [ ] UI показывает человеческие формулировки.
- [ ] Commit: `feat(ai): add behavior modifiers and timeout controls`.

## Gate A2 — реактивный сценарий

```text
enemyVisible = true
→ AimAt Running
→ Fire Running
enemy_lost event
→ Fire Cancelled
→ AimAt Cancelled
→ SearchLastKnownPosition starts
```

Проверить:

- реакцию не позднее следующего AI tick;
- cleanup старых действий;
- отсутствие второго активного WeaponFire handle;
- объяснение причины отмены;
- deterministic replay событий.

---

# Этап 3. Контракты нод, типизированные порты, подграфы и graph v2

## Цель

Сделать большие графы безопасными, переиспользуемыми и мигрируемыми.

## Task 3.1. Node contract registry

**Files:**

- Create: `src/core/ai/contracts/AiPortTypes.ts`
- Create: `src/core/ai/contracts/AiNodeContract.ts`
- Create: `src/core/ai/contracts/AiNodeContractRegistry.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`
- Create: `tests/unit/ai/contracts/node-contract.spec.ts`

**Interface:**

```ts
export type AiPortValueKind =
  | 'number'
  | 'boolean'
  | 'string'
  | 'position'
  | 'unitId'
  | 'objectId'
  | 'slotId'
  | 'event'
  | 'plan'
  | 'route';

export interface AiNodeContract {
  type: string;
  category: string;
  inputs: readonly AiPortDefinition[];
  outputs: readonly AiPortDefinition[];
  parameters: readonly AiParameterDefinition[];
  childPolicy: 'none' | 'one' | 'many';
  lifecycle: 'instant' | 'stateful' | 'composite' | 'modifier';
}
```

- [ ] Перенести metadata нод из разрозненных UI defaults в единый registry.
- [ ] Сохранить `label`, `description`, `labelRu`, `descriptionRu`.
- [ ] Добавить unit tests для всех зарегистрированных типов.
- [ ] Запретить duplicate type registration.
- [ ] Commit: `feat(ai): introduce typed node contract registry`.

## Task 3.2. Строгая валидация параметров и портов

**Files:**

- Modify: `src/core/ai/AiGraphValidation.ts`
- Create: `tests/unit/ai/contracts/validation.spec.ts`
- Modify: `scripts/validate_ai_graph.mjs`

- [ ] Обязательный parameter отсутствует → error с node id.
- [ ] Number вне min/max → error.
- [ ] Enum вне options → error.
- [ ] Position port не принимает unitId.
- [ ] Nullable разрешён только явно.
- [ ] Неиспользуемый output → warning, не error.
- [ ] Недостижимая нода → warning.
- [ ] Цикл без специальной loop/modifier ноды → error.
- [ ] Commit: `feat(ai): validate typed parameters and ports`.

## Task 3.3. Graph v2 и миграция v1

**Files:**

- Modify: `src/core/ai/AiGraph.ts`
- Create: `src/core/ai/contracts/AiGraphMigration.ts`
- Create: `scripts/ai_graph_migrate.mjs`
- Create: `tests/unit/ai/contracts/migration.spec.ts`
- Create: `tests/fixtures/ai-graph-v1/*.json`

**Target shape:**

```ts
export interface AiGraphV2 {
  version: 2;
  id: string;
  rootNodeId: string;
  blackboardSchema: AiBlackboardSchemaEntry[];
  blackboardDefaults: Record<string, AiBlackboardValue>;
  nodes: AiNodeV2[];
  subgraphRefs: string[];
}
```

- [ ] Миграция v1 детерминирована и idempotent.
- [ ] `children` сохраняют порядок.
- [ ] Старые parameters преобразуются в typed bindings/default literals.
- [ ] Неизвестные поля сохраняются в `legacyMetadata` или выдаётся явный warning; не терять молча.
- [ ] Storage v6 автоматически читает v1 и сохраняет v2 только после успешной миграции.
- [ ] Commit: `feat(ai): add graph v2 migration without breaking v1`.

## Task 3.4. Memory scopes

**Files:**

- Create: `src/core/ai/contracts/AiMemoryScopes.ts`
- Modify: `src/core/ai/runtime/AiRuntimeSession.ts`
- Create: `tests/unit/ai/contracts/memory-scopes.spec.ts`

Scopes:

```text
persistent soldier memory
runtime session blackboard
state memory
subgraph local memory
node local state
```

- [ ] Local subgraph write не изменяет parent key без explicit output mapping.
- [ ] Persistent write требует отдельной capability/ноды.
- [ ] Reset state очищает state scope, но не persistent memory.
- [ ] Snapshot сохраняет все нужные scopes раздельно.
- [ ] Commit: `feat(ai): separate runtime and local memory scopes`.

## Task 3.5. Static subgraphs

**Files:**

- Create: `src/core/ai/contracts/AiSubgraphRegistry.ts`
- Create: `src/core/ai/runtime/AiSubgraphRuntime.ts`
- Create: `tests/unit/ai/contracts/subgraph.spec.ts`
- Create: `src/data/ai/subgraphs/take_cover.json`
- Create: `src/data/ai/subgraphs/reload_weapon.json`
- Create: `src/data/ai/subgraphs/react_to_fire.json`
- Create: `src/data/ai/subgraphs/move_and_observe.json`

- [ ] Subgraph имеет typed inputs/outputs.
- [ ] Parent передаёт значения через explicit bindings.
- [ ] Subgraph local memory изолирована.
- [ ] Cancel parent отменяет child subgraph.
- [ ] Recursive direct и indirect references запрещаются validation.
- [ ] Trace содержит путь `mainGraph/subgraph/node`.
- [ ] Commit: `feat(ai): add reusable static behavior subgraphs`.

## Task 3.6. Editor UI для контрактов и подграфов

**Files:**

- Create: `src/ai-node-editor/node-contract-ui.ts`
- Create: `src/ai-node-editor/subgraph-ui.ts`
- Modify: `src/ai-node-editor/main.ts`
- Modify: `src/ai-node-editor/human-node-ui.ts`
- Modify: `src/ai-node-editor/ai-node-editor-authoring.css`
- Modify: `scripts/ai_node_editor_smoke.mjs`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Нельзя создать несовместимое соединение мышью.
- [ ] Ошибка указывает на конкретный порт.
- [ ] Карточка показывает фразу «Если опасность выше 70», а не сырой набор полей.
- [ ] Подграф можно открыть двойным кликом и вернуться назад breadcrumb-кнопкой.
- [ ] Screenshot: typed port validation.
- [ ] Screenshot: открытый подграф TakeCover.
- [ ] Commit: `feat(ai-editor): add typed node and subgraph authoring`.

## Gate A — большой контрольный тест

Сценарий:

```text
солдат получает move order
→ MoveTo Running
→ shot_nearby event
→ reactive abort
→ подграф TakeCover
→ найти position
→ MoveTo Running
→ сохранить сцену
→ загрузить сцену
→ продолжить MoveTo без повторного start
→ занять позицию
→ ObserveSector Running
```

Exit criteria:

- ни одного зависшего handle;
- v1 граф мигрирован и работает;
- trace показывает отмену и подграф;
- snapshot/reload детерминирован;
- UI показывает Running и причины;
- все базовые проверки и свежие PNG прошли.

---

# КОНТРОЛЬНАЯ ТОЧКА B — состояния, планы и полная объяснимость

# Этап 4. Иерархические состояния и объект плана

## Task 4.1. State machine model

**Files:**

- Create: `src/core/ai/state/AiStateMachine.ts`
- Create: `src/core/ai/state/AiStateRuntime.ts`
- Create: `tests/unit/ai/state/state-machine.spec.ts`
- Modify: `src/core/behavior/BehaviorModel.ts`

**Initial states:**

```text
Idle
FollowingOrder
Contact
Suppressed
Wounded
Retreating
Panicked
```

**Transition fields:**

```ts
export interface AiStateTransition {
  id: string;
  from: string | '*';
  to: string;
  priority: number;
  trigger: AiTransitionTrigger;
  guards: AiConditionBinding[];
  reasonRu: string;
  minimumSourceDurationMs?: number;
}
```

- [ ] Highest priority valid transition wins deterministically.
- [ ] Wildcard emergency transition работает из любого state.
- [ ] Enter/exit hooks фиксируются в trace.
- [ ] Minimum state duration и StableThreshold защищают от дрожания.
- [ ] Commit: `feat(ai): add hierarchical soldier state runtime`.

## Task 4.2. State stack и inheritance

**Files:**

- Modify: `src/core/ai/state/AiStateRuntime.ts`
- Create: `tests/unit/ai/state/state-stack.spec.ts`

Пример:

```text
Combat
└─ Contact
   └─ TakingCover
```

- [ ] Parent tasks остаются активны вместе с leaf state.
- [ ] Exit выполняется leaf → root.
- [ ] Enter выполняется root → leaf.
- [ ] Переход между sibling не перезапускает общий parent без необходимости.
- [ ] Commit: `feat(ai): support hierarchical active state stacks`.

## Task 4.3. AiPlan model и runtime

**Files:**

- Create: `src/core/ai/state/AiPlan.ts`
- Create: `src/core/ai/state/AiPlanRuntime.ts`
- Create: `tests/unit/ai/state/plan.spec.ts`

```ts
export interface AiPlan {
  id: string;
  goal: string;
  createdAtMs: number;
  steps: AiPlanStep[];
  currentStepIndex: number;
  expectedDurationMs?: number;
  riskScore: number;
  score: number;
  reasons: string[];
  abortConditions: AiConditionBinding[];
  replanConditions: AiConditionBinding[];
}
```

- [ ] Plan step начинается один раз.
- [ ] Success переводит к следующему step.
- [ ] Failure obeys step policy: fail plan / retry / replan.
- [ ] Abort отменяет active subgraph и сохраняет историю.
- [ ] Replan создаёт новый plan id и ссылку `replacesPlanId`.
- [ ] Commit: `feat(ai): add explicit multi-step plan runtime`.

## Task 4.4. State → Utility → Plan pipeline

**Files:**

- Modify: `src/core/ai/runtime/AiRuntimeSession.ts`
- Modify: `src/core/ai/state/AiStateRuntime.ts`
- Modify: `src/core/ai/state/AiPlanRuntime.ts`
- Modify: `src/core/ai/AiGameBridge.ts`
- Create: `tests/unit/ai/state/pipeline.spec.ts`

- [ ] State ограничивает список разрешённых Utility branches.
- [ ] Utility winner создаёт plan, а не мгновенный набор effects.
- [ ] Пока plan валиден, Utility не пересчитывается без trigger/replan condition.
- [ ] Emergency transition отменяет plan раньше Utility reevaluation.
- [ ] Commit: `feat(ai): connect states utility decisions and plans`.

## Task 4.5. State/plan UI

**Files:**

- Create: `src/ai-node-editor/state-machine-ui.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `tests/preview-screenshots.spec.ts`

Показывать:

```text
общее состояние
родительские состояния
предыдущее состояние
причину перехода
текущий plan goal
текущий step
abort/replan conditions
```

- [ ] Screenshot: FollowingOrder → Contact.
- [ ] Screenshot: Contact → Suppressed с причиной.
- [ ] Screenshot: план отменён и заменён.
- [ ] Постоянные UI controls не пересоздаются на каждый runtime tick.
- [ ] Commit: `feat(ui): expose soldier states and active plans`.

## Gate B1 — тест переходов

```text
FollowingOrder
+ enemy_spotted
→ Contact
+ TakeCover plan
+ suppression > critical
→ Suppressed
→ current movement cancelled
→ prone action
suppression falls below stable exit
→ Contact
→ plan recalculated
```

Проверить matrix всех переходов, приоритет ранения над новым приказом и отсутствие state oscillation.

---

# Этап 5. История, timeline, replay, breakpoints и fault injection

## Task 5.1. Унифицированные trace events

**Files:**

- Create: `src/core/ai/trace/AiTraceTypes.ts`
- Create: `src/core/ai/trace/AiTraceBuffer.ts`
- Modify: `src/core/ai/runtime/AiRuntimeSession.ts`
- Create: `tests/unit/ai/trace/trace-buffer.spec.ts`

Trace kinds:

```text
node_enter
node_status
node_exit
node_cancel
state_enter
state_exit
transition
plan_created
plan_step
plan_aborted
blackboard_changed
event_received
utility_scored
query_candidate
handle_created
handle_released
runtime_error
```

- [ ] Ring buffer имеет max events и max bytes estimate.
- [ ] Порядок определяется sequence number, а не только timestamp.
- [ ] Каждое событие содержит unitId, graph path и simulation time.
- [ ] Commit: `feat(ai): add bounded structured runtime trace`.

## Task 5.2. Blackboard diff history

**Files:**

- Modify: `src/core/ai/trace/AiBlackboardDiff.ts`
- Create: `src/ui/AiBlackboardHistoryPanel.ts`
- Create: `tests/unit/ai/trace/blackboard-diff.spec.ts`

- [ ] Хранить old/new normalized values.
- [ ] Не писать запись при semantic equality.
- [ ] Помечать источник изменения: sensor/node/host/migration/user debug override.
- [ ] Фильтр по key и time range.
- [ ] Commit: `feat(ai): record and inspect blackboard history`.

## Task 5.3. Recorder и deterministic replay

**Files:**

- Create: `src/core/ai/trace/AiRuntimeRecorder.ts`
- Create: `src/core/ai/trace/AiRuntimeReplay.ts`
- Create: `tests/unit/ai/trace/replay.spec.ts`
- Modify: `src/ui/SceneExport.ts`

Recorder stores:

```text
initial snapshot
graph versions
seed
events
host action completions
query results or deterministic query inputs
simulation time steps
```

- [ ] Replay не использует wall clock.
- [ ] Replay result hash включает states/plans/blackboard/trace terminal statuses.
- [ ] Одинаковый record даёт одинаковый hash.
- [ ] Любое расхождение показывает первый divergent event.
- [ ] Commit: `feat(ai): add deterministic runtime recording and replay`.

## Task 5.4. Breakpoints

**Files:**

- Create: `src/core/ai/trace/AiBreakpointManager.ts`
- Create: `tests/unit/ai/trace/breakpoints.spec.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`

Breakpoint targets:

```text
node enter/exit/status
state enter/exit
transition id
plan abort
veto
runtime error
blackboard condition
```

- [ ] Breakpoint останавливает симуляцию перед следующим mutating tick.
- [ ] Resume не повторяет уже обработанное событие.
- [ ] Step выполняет ровно один runtime transition/update.
- [ ] Commit: `feat(ai-debug): add runtime breakpoints and stepping`.

## Task 5.5. Debug overrides и fault injection

**Files:**

- Create: `src/core/ai/trace/AiFaultInjection.ts`
- Create: `tests/unit/ai/trace/fault-injection.spec.ts`
- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`

Поддержать:

```text
force condition true/false
disable node
stub success/failure/running
route blocked
cover invalidated
weapon jam
communication lost
target invalidated
```

- [ ] Overrides живут только в debug session и не сохраняются в production graph без явного export.
- [ ] Trace помечает forced result.
- [ ] Очистка override возвращает нормальное поведение.
- [ ] Commit: `feat(ai-debug): add controlled overrides and fault injection`.

## Task 5.6. Runtime profiler

**Files:**

- Create: `src/core/ai/trace/AiRuntimeProfiler.ts`
- Create: `tests/unit/ai/trace/profiler.spec.ts`
- Modify: `src/ui/TacticalWorkspace.ts`

Metrics:

```text
calls
running duration
self time
total subtree time
max time
query count
host calls
cancel count
```

- [ ] Profiler отключаем и имеет минимальный overhead в обычном режиме.
- [ ] Использовать monotonic timer adapter, чтобы core test мог подставить fake clock.
- [ ] Commit: `feat(ai-debug): profile node and query execution`.

## Task 5.7. Timeline UI

**Files:**

- Create: `src/ui/AiTimelinePanel.ts`
- Create: `src/ai-node-editor/timeline-ui.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `src/ai-node-editor/main.ts`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Полосы states/plans/running nodes/events.
- [ ] Jump to next changed frame.
- [ ] Фильтр по kind/node/key.
- [ ] Scrubbing не изменяет живую симуляцию; это только просмотр record.
- [ ] Screenshot: timeline на паузе.
- [ ] Screenshot: breakpoint на plan abort.
- [ ] Commit: `feat(ai-debug): add visual execution timeline`.

## Gate B — большой контрольный тест

Записать многоминутный headless-сценарий с несколькими переходами, сохранить record, воспроизвести и получить одинаковый result hash. В браузере остановиться breakpoint на `Suppressed`, перейти к предыдущему событию и увидеть Blackboard diff, Utility scores и отменённый plan.

---

# Этап 6. Безопасный параллелизм и каналы действий

## Task 6.1. Action channels

**Files:**

- Create: `src/core/ai/parallel/AiActionChannels.ts`
- Create: `tests/unit/ai/parallel/channels.spec.ts`
- Modify: `src/core/ai/contracts/AiNodeContract.ts`

Channels:

```text
Movement
Posture
BodyRotation
WeaponAim
WeaponFire
Speech
Interaction
```

- [ ] Action contract объявляет required/exclusive/shared channels.
- [ ] Acquire атомарен в рамках одного runtime tick.
- [ ] Release происходит при success/failure/cancel/error.
- [ ] Leak detector обнаруживает channel после terminal session.
- [ ] Commit: `feat(ai): add action channel ownership`.

## Task 6.2. SimpleParallel

**Files:**

- Create: `src/core/ai/parallel/AiParallelRuntime.ts`
- Create: `tests/unit/ai/parallel/simple-parallel.spec.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`

- [ ] Main child определяет общий результат.
- [ ] Background child работает пока main Running.
- [ ] При завершении main background отменяется или завершается по policy.
- [ ] Conflict channels выдаёт failure до начала второго action.
- [ ] Commit: `feat(ai): add safe simple parallel behavior`.

## Task 6.3. Full Parallel и join nodes

**Files:**

- Modify: `src/core/ai/parallel/AiParallelRuntime.ts`
- Create: `src/core/ai/parallel/AiJoinRuntime.ts`
- Create: `tests/unit/ai/parallel/parallel.spec.ts`
- Create: `tests/unit/ai/parallel/join.spec.ts`

- [ ] Success threshold.
- [ ] Failure threshold.
- [ ] WaitForAll.
- [ ] WaitForAny.
- [ ] Cancel remaining policy.
- [ ] Deterministic child update order.
- [ ] Commit: `feat(ai): add bounded parallel and join controls`.

## Gate B2 — параллельный тест

```text
MoveTo owns Movement
AimAt owns WeaponAim
SayMessage owns Speech
→ все Running одновременно

Second MoveTo requests Movement
→ не запускается
→ получает conflict reason
```

После cancel/death/load не должно оставаться занятых каналов.

---

# КОНТРОЛЬНАЯ ТОЧКА C — пространственный интеллект и реальные позиции

# Этап 7. Tactical Query System

## Task 7.1. Query data model

**Files:**

- Create: `src/core/ai/query/TacticalQueryTypes.ts`
- Create: `tests/unit/ai/query/types.spec.ts`

```ts
export interface TacticalQueryDefinition {
  id: string;
  generator: TacticalGeneratorDefinition;
  contexts: TacticalContextDefinition[];
  filters: TacticalFilterDefinition[];
  scorers: TacticalScorerDefinition[];
  resultLimit: number;
  budget: TacticalQueryBudgetDefinition;
}

export interface TacticalCandidate {
  id: string;
  position: GridPosition;
  sourceKind: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
}
```

- [ ] Definition serializable.
- [ ] Candidate ids deterministic для одинакового input.
- [ ] Result хранит filter reasons и score contributions.
- [ ] Commit: `feat(ai-query): add tactical query data model`.

## Task 7.2. Query runtime, budget и cache

**Files:**

- Create: `src/core/ai/query/TacticalQueryRuntime.ts`
- Create: `src/core/ai/query/TacticalQueryBudget.ts`
- Create: `src/core/ai/query/TacticalQueryCache.ts`
- Create: `tests/unit/ai/query/runtime.spec.ts`
- Create: `tests/unit/ai/query/budget.spec.ts`

- [ ] Filters выполняются до scorers.
- [ ] Query прекращается по max candidates / operations / elapsed budget.
- [ ] Partial result явно помечается.
- [ ] Cache key включает map revision, knowledge revision, posture, query params.
- [ ] Изменение только UI не инвалидирует cache.
- [ ] Commit: `feat(ai-query): add budgeted cached query pipeline`.

## Task 7.3. Generators

**Files:**

- Create: `src/core/ai/query/TacticalQueryGenerators.ts`
- Create: `tests/unit/ai/query/generators.spec.ts`

Generators:

```text
grid around context
cover points
points along route
forest edge
reverse slope candidates
flanks around target
points around order target
retreat ring
```

- [ ] Все candidates внутри map bounds.
- [ ] Duplicate positions deduplicated детерминированно.
- [ ] Spacing/limit соблюдаются.
- [ ] Generator не читает objective enemies напрямую; только contexts.
- [ ] Commit: `feat(ai-query): add tactical candidate generators`.

## Task 7.4. Contexts

**Files:**

- Modify: `src/core/ai/query/TacticalQueryTypes.ts`
- Create: `src/core/ai/query/TacticalQueryContexts.ts`
- Create: `tests/unit/ai/query/contexts.spec.ts`

Contexts:

```text
self
current target
known threats
commander
order target
allies
current route
```

- [ ] Missing nullable context даёт controlled empty/failure according to definition.
- [ ] `known threats` использует tacticalKnowledge.
- [ ] Commit: `feat(ai-query): add reusable tactical contexts`.

## Task 7.5. Hard filters

**Files:**

- Create: `src/core/ai/query/TacticalQueryFilters.ts`
- Create: `tests/unit/ai/query/filters.spec.ts`

Filters:

```text
inside map
walkable
path exists
max distance
within order bounds
minimum protection
posture supported
slot available
not directly exposed
```

- [ ] Каждый reject хранит code + reasonRu + measured value.
- [ ] Невозможный candidate никогда не возвращается победителем.
- [ ] Commit: `feat(ai-query): add explainable hard filters`.

## Task 7.6. Scorers

**Files:**

- Create: `src/core/ai/query/TacticalQueryScorers.ts`
- Create: `tests/unit/ai/query/scorers.spec.ts`

Scorers:

```text
protection
route danger
distance
concealment
height advantage
line of fire
observation sector
flank risk
cohesion distance
order progress
```

- [ ] Score normalization документирована.
- [ ] Итог равен сумме contributions.
- [ ] Tie break deterministic: score → distance → candidate id.
- [ ] Commit: `feat(ai-query): add weighted tactical scorers`.

## Task 7.7. Интеграция с GraphRunner

**Files:**

- Modify: `src/core/ai/AiGameBridge.ts`
- Modify: `src/core/ai/AiGraphRunner.ts`
- Modify: `src/core/ai/AiNodeTypes.ts`
- Create: `src/core/ai/runtime/actions/RunTacticalQueryAction.ts`
- Create: `tests/unit/ai/query/runtime-integration.spec.ts`

- [ ] Заменить внутренний непрозрачный cover search новым query через compatibility adapter.
- [ ] `RunTacticalQuery` может быть Running, если budget разделён на тики.
- [ ] Output: candidate position/id/slot id/score/failure reason.
- [ ] Старый `FindBestObject` мигрируется в готовый query preset.
- [ ] Commit: `feat(ai-query): integrate tactical queries with behavior runtime`.

## Task 7.8. Query trace и визуализация

**Files:**

- Create: `src/core/ai/query/TacticalQueryTrace.ts`
- Create: `src/rendering/PixiTacticalQueryRenderer.ts`
- Create: `src/ui/TacticalQueryInspector.ts`
- Modify: `src/rendering/PixiApp.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Показать all/generated/after each filter/final modes.
- [ ] Кандидат имеет цвет, итоговый score и reject reason.
- [ ] Rendering использует bounded batched representation, не тысячи DOM элементов.
- [ ] Screenshot: все candidates.
- [ ] Screenshot: после path filter.
- [ ] Screenshot: winner breakdown.
- [ ] Performance assertion: display object count и max build ms.
- [ ] Commit: `feat(ai-query): visualize and inspect tactical candidates`.

## Gate C1 — эталонные карты

Создать fixtures:

```text
one-good-cover
near-cover-dangerous
far-cover-safe
best-cover-unreachable
all-slots-occupied
reverse-slope
multiple-threat-directions
no-valid-candidate
```

Для каждой проверить expected winner или expected failure code, score breakdown и deterministic tie break.

---

# Этап 8. Smart Objects, слоты, вместимость и резервирование

## Task 8.1. Smart Object model

**Files:**

- Create: `src/core/smart-objects/SmartObjectTypes.ts`
- Create: `src/core/smart-objects/SmartObjectRegistry.ts`
- Create: `tests/unit/ai/smart-objects/registry.spec.ts`
- Modify: `src/core/map/MapModel.ts`
- Modify: `src/ui/SceneExport.ts`

```ts
export type SmartObjectSlotState = 'free' | 'reserved' | 'occupied' | 'invalid';

export interface SmartObjectSlot {
  id: string;
  objectId: string;
  position: GridPosition;
  facingDegrees: number;
  allowedPostures: UnitPosture[];
  capabilities: string[];
  protection: number;
  state: SmartObjectSlotState;
  reservation?: SmartObjectReservation;
  occupantUnitId?: string;
}
```

- [ ] Older objects without slots normalize safely.
- [ ] Registry indexes object/slot by id.
- [ ] Revision changes only on meaningful slot change.
- [ ] Commit: `feat(objects): add smart object and slot model`.

## Task 8.2. Cover slot builder

**Files:**

- Create: `src/core/smart-objects/CoverSlotBuilder.ts`
- Create: `tests/unit/ai/smart-objects/cover-slots.spec.ts`
- Modify: `src/core/cover/SmallArmsCoverEvaluation.ts`

- [ ] Для стены создать slots вдоль защищённой стороны.
- [ ] Для окна создать firing/observe slot.
- [ ] Для низкого укрытия ограничить posture.
- [ ] Slot не находится внутри непроходимой геометрии.
- [ ] Manual authored slots имеют приоритет над generated.
- [ ] Commit: `feat(objects): generate tactical cover slots`.

## Task 8.3. Reservation service

**Files:**

- Create: `src/core/smart-objects/SmartObjectReservation.ts`
- Create: `tests/unit/ai/smart-objects/reservation.spec.ts`

**Interface:**

```ts
reserveSlot(slotId: string, unitId: string, nowMs: number, ttlMs: number): ReservationResult;
occupySlot(reservationId: string, unitId: string): OccupyResult;
releaseReservation(reservationId: string, reason: string): void;
invalidateSlot(slotId: string, reason: string): void;
```

- [ ] Два бойца не получают один slot.
- [ ] Expired reservation освобождается.
- [ ] Occupy требует действующую reservation.
- [ ] Release idempotent.
- [ ] Unit death/cancel освобождает все claims.
- [ ] Commit: `feat(objects): add deterministic slot reservations`.

## Task 8.4. Runtime actions для слотов

**Files:**

- Create: `src/core/ai/runtime/actions/ReserveSlotAction.ts`
- Create: `src/core/ai/runtime/actions/OccupySlotAction.ts`
- Create: `src/core/ai/runtime/actions/ReleaseSlotAction.ts`
- Create: `tests/unit/ai/smart-objects/actions.spec.ts`
- Modify: `src/data/ai/subgraphs/take_cover.json`

TakeCover becomes:

```text
RunTacticalQuery
→ ReserveSlot
→ MoveTo slot approach
→ OccupySlot
→ SetPosture
→ Observe/Aim
```

- [ ] Failed reserve triggers requery, not movement to unclaimed slot.
- [ ] Cancel before arrival releases reservation.
- [ ] Slot invalidation cancels MoveTo and triggers replan event.
- [ ] Commit: `feat(ai): integrate slot reservation into take-cover behavior`.

## Task 8.5. Slot editor/debug UI

**Files:**

- Create: `src/rendering/PixiSmartObjectSlotRenderer.ts`
- Create: `src/ui/SmartObjectInspector.ts`
- Modify: `src/ui/GameEditorWorkbench.ts`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Режим отображения slots: free/reserved/occupied/invalid.
- [ ] Инспектор показывает capability, posture, protection, occupant.
- [ ] Ручное добавление/перемещение/поворот slot в Editing.
- [ ] Screenshot: укрытие с несколькими slots.
- [ ] Screenshot: два slots заняты разными бойцами.
- [ ] Commit: `feat(editor): author and inspect smart object slots`.

## Gate C2 — вместимость

```text
укрытие имеет 3 slots
4 бойца запрашивают укрытие
→ 3 получают разные reservations
→ 4-й получает no_slot_available и выбирает другое укрытие
```

Дополнительно разрушить объект во время движения и доказать cancel/release/replan.

---

# Этап 9. Единая система восприятия и субъективной памяти

## Task 9.1. Stimulus model

**Files:**

- Create: `src/core/perception/Stimulus.ts`
- Create: `tests/unit/ai/perception/stimulus.spec.ts`

```ts
export interface Stimulus {
  id: string;
  type: 'sight' | 'hearing' | 'damage' | 'report' | 'flash';
  sourceId?: string;
  targetUnitId: string;
  detectedPosition?: GridPosition;
  observerPosition: GridPosition;
  directionDegrees?: number;
  strength: number;
  confidence: number;
  uncertaintyCells: number;
  createdAtMs: number;
  expiresAtMs: number;
  tags: string[];
}
```

- [ ] Normalize strength/confidence.
- [ ] Unique deterministic id policy.
- [ ] Expiry based on simulation time.
- [ ] Commit: `feat(perception): add unified stimulus contract`.

## Task 9.2. Sight sensor

**Files:**

- Create: `src/core/perception/SightSensor.ts`
- Create: `tests/unit/ai/perception/sight.spec.ts`
- Modify: `src/core/simulation/SimulationTick.ts`

- [ ] View angle/range.
- [ ] LOS blocking by map/object heights.
- [ ] Forest/concealment affects confidence, not binary wall in all cases.
- [ ] Contact gained/lost events generated only on transition.
- [ ] Commit: `feat(perception): add subjective sight stimuli`.

## Task 9.3. Hearing, damage и report sensors

**Files:**

- Create: `src/core/perception/HearingSensor.ts`
- Create: `src/core/perception/DamageSensor.ts`
- Create: `src/core/perception/ReportSensor.ts`
- Create: `tests/unit/ai/perception/hearing.spec.ts`
- Create: `tests/unit/ai/perception/report.spec.ts`

- [ ] Hearing distance depends on source strength and attenuation.
- [ ] Hearing position uncertainty > sight uncertainty.
- [ ] Damage stimulus имеет высокий priority и direction.
- [ ] Report сохраняет source confidence и communication delay.
- [ ] Commit: `feat(perception): add hearing damage and report stimuli`.

## Task 9.4. Knowledge fusion и decay

**Files:**

- Create: `src/core/perception/KnowledgeFusion.ts`
- Create: `src/core/perception/KnowledgeDecay.ts`
- Modify: `src/core/knowledge/SoldierThreatMemory.ts`
- Create: `tests/unit/ai/perception/fusion.spec.ts`
- Create: `tests/unit/ai/perception/decay.spec.ts`

- [ ] Fresh sight overrides weak hearing position.
- [ ] Multiple confirmations raise confidence with cap.
- [ ] Contradictory signals raise uncertainty.
- [ ] Different stimulus types have different decay/expiry.
- [ ] Objective world fields никогда не копируются напрямую без stimulus.
- [ ] Commit: `feat(perception): fuse and decay subjective knowledge`.

## Task 9.5. Target prediction

**Files:**

- Create: `src/core/perception/TargetPrediction.ts`
- Create: `tests/unit/ai/perception/prediction.spec.ts`

- [ ] Prediction uses last known velocity only when confidence sufficient.
- [ ] Uncertainty grows with time.
- [ ] Prediction clamped to map and optionally walkable area.
- [ ] Low confidence returns area/none rather than false exact point.
- [ ] Commit: `feat(perception): add uncertainty-aware target prediction`.

## Task 9.6. Perception debug visualization

**Files:**

- Create: `src/rendering/PixiPerceptionRenderer.ts`
- Modify: `src/ui/TacticalWorkspace.ts`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Objective view и soldier knowledge view визуально различаются.
- [ ] Sight stimulus точнее hearing area.
- [ ] Age/confidence/uncertainty видимы в inspector.
- [ ] Screenshot: враг объективно существует, но боец его не знает.
- [ ] Screenshot: hearing creates uncertain sector.
- [ ] Commit: `feat(ui): visualize subjective perception and uncertainty`.

## Gate C — большой пространственно-субъективный тест

Боец слышит пулемёт, но не видит его. Tactical Query выбирает укрытие против вероятного сектора, не используя точную скрытую позицию. Затем боец видит вспышку, confidence растёт, query пересчитывается и выбирает более подходящий slot.

---

# КОНТРОЛЬНАЯ ТОЧКА D — несколько бойцов и масштаб

# Этап 10. Несколько бойцов, связь, роли и групповые приказы

## Task 10.1. Runtime sessions для малой группы

**Files:**

- Modify: `src/core/ai/AiGameBridge.ts`
- Create: `src/core/ai/scheduling/AiScheduler.ts`
- Create: `tests/unit/ai/scheduling/multi-session.spec.ts`

- [ ] Начать с feature flag и максимум 2 активных AI sessions.
- [ ] Selected unit влияет только на debug focus, не на существование session.
- [ ] Sessions не делят blackboard/local state.
- [ ] Expand tests to 4 and 8 agents после стабильности 2.
- [ ] Commit: `feat(ai): run independent sessions for small groups`.

## Task 10.2. Передача знаний

**Files:**

- Create: `src/core/perception/CommunicationRuntime.ts`
- Create: `tests/unit/ai/perception/communication.spec.ts`
- Modify: `src/core/perception/ReportSensor.ts`

Communication inputs:

```text
voice range
radio capability
commander relationship
message delay
message distortion
source confidence
```

- [ ] Без канала связи знания не передаются.
- [ ] Delay uses simulation time.
- [ ] Получатель хранит source и не превращает report в собственное sight.
- [ ] Потеря связи генерирует event.
- [ ] Commit: `feat(ai): add delayed confidence-aware knowledge sharing`.

## Task 10.3. Dynamic role subgraphs

**Files:**

- Modify: `src/core/ai/contracts/AiSubgraphRegistry.ts`
- Create: `src/data/ai/roles/rifleman.json`
- Create: `src/data/ai/roles/machine_gunner.json`
- Create: `src/data/ai/roles/commander.json`
- Create: `src/data/ai/roles/medic.json`
- Create: `tests/unit/ai/contracts/dynamic-subgraphs.spec.ts`

- [ ] Role selects compatible subgraph at runtime.
- [ ] Shared survival behavior remains common.
- [ ] Blackboard interface compatibility checked before swap.
- [ ] Active dynamic subgraph swap follows explicit cancel/migrate policy.
- [ ] Commit: `feat(ai): add role-specific dynamic behavior subgraphs`.

## Task 10.4. Group orders and local autonomy

**Files:**

- Create: `src/core/orders/GroupOrder.ts`
- Modify: `src/core/simulation/SimulationState.ts`
- Modify: `src/core/ai/state/AiPlan.ts`
- Create: `tests/unit/ai/state/group-orders.spec.ts`

- [ ] Group order stores intent/area/formation constraints, not individual exact path only.
- [ ] Each soldier creates local plan using personal knowledge.
- [ ] Soldier may temporarily diverge for survival with explicit reason.
- [ ] Command cancellation propagates as event.
- [ ] Commit: `feat(ai): translate group intent into local soldier plans`.

## Task 10.5. Распределение слотов и ролей

**Files:**

- Create: `src/core/smart-objects/GroupSlotAssignment.ts`
- Create: `tests/unit/ai/smart-objects/group-assignment.spec.ts`

- [ ] Machine gunner prefers compatible firing slot.
- [ ] Commander avoids occupying scarce specialist slot.
- [ ] Assignment deterministic for same seed/input.
- [ ] Reassignment occurs only on invalidation/meaningful score change.
- [ ] Commit: `feat(ai): distribute group roles across tactical slots`.

## Gate D1 — отделение

Сценарий отделения:

```text
командир + пулемётчик + 4 стрелка
→ приказ занять линию укрытий
→ разные slots
→ пулемётчик получает firing slot
→ один стрелок видит врага
→ сообщение с задержкой доходит остальным
→ командир погибает
→ активные действия не исчезают
→ новый режим и причины видимы
```

---

# Этап 11. Планировщик, бюджеты и масштабирование

## Task 11.1. Priority model

**Files:**

- Create: `src/core/ai/scheduling/AiPriority.ts`
- Create: `tests/unit/ai/scheduling/priority.spec.ts`

Priority factors:

```text
under fire
critical event
nearby enemy
active short deadline
visible/on-screen debug focus
following order
idle/far from events
```

- [ ] Emergency agent всегда выше idle.
- [ ] Debug-selected unit получает display priority, но не меняет семантику решений.
- [ ] Commit: `feat(ai-scheduler): add agent priority calculation`.

## Task 11.2. Frame budget scheduler

**Files:**

- Modify: `src/core/ai/scheduling/AiScheduler.ts`
- Create: `src/core/ai/scheduling/AiBudget.ts`
- Create: `tests/unit/ai/scheduling/budget.spec.ts`

- [ ] Budget задаётся operations и optional measured ms.
- [ ] Scheduler детерминирован при fake clock.
- [ ] Агент не голодает: maximum defer interval.
- [ ] Critical event может разбудить отложенного агента.
- [ ] Commit: `feat(ai-scheduler): distribute runtime work within frame budgets`.

## Task 11.3. AI LOD policy

**Files:**

- Create: `src/core/ai/scheduling/AiLodPolicy.ts`
- Create: `tests/unit/ai/scheduling/lod.spec.ts`

LOD affects:

```text
full query quality
candidate count
sensor update rate
background plan validation rate
trace detail
```

- [ ] LOD не меняет hard safety rules.
- [ ] Переход LOD не сбрасывает active actions.
- [ ] Selected/debug unit always full detail.
- [ ] Commit: `feat(ai-scheduler): add safe AI level-of-detail policies`.

## Task 11.4. Overlay and trace performance hardening

**Files:**

- Modify: `src/ai-node-editor/runtime-debug-overlay.ts`
- Modify: `src/ui/AiTimelinePanel.ts`
- Modify: `src/rendering/PixiTacticalQueryRenderer.ts`
- Modify: `tests/preview-screenshots.spec.ts`

- [ ] Bounded DOM rows with virtualization or paging.
- [ ] Pixi candidates rendered as batched graphics/raster where appropriate.
- [ ] No complete overlay rebuild on unit movement if query revision unchanged.
- [ ] Add browser diagnostics: displayObjectCount, rebuildCount, maxBuildMs.
- [ ] Commit: `perf(ai-debug): bound trace and query visualization costs`.

## Task 11.5. Benchmark matrix

**Files:**

- Modify: `scripts/ai_runtime_benchmark.mjs`
- Create: `docs/performance/AI_RUNTIME_SCALING.md`

Run:

```text
1 agent
10 agents
50 agents
100 agents
300 simplified agents
```

Measure:

```text
AI tick p50/p95/max
query count
candidate count
event queue size
trace bytes
heap delta
browser FPS with overlay on/off
```

- [ ] 10–30 minute soak scenario.
- [ ] Detect memory growth, leaked channels, reservations and Running nodes.
- [ ] Commit: `perf(ai): document scheduler scaling and soak results`.

## Gate D2 — performance

До начала реализации установить числовые thresholds по baseline и целевому ПК. Не придумывать универсальные FPS без измерения. Gate требует:

- отсутствие неограниченного роста памяти;
- соблюдение configured frame budget;
- одинаковую семантику при разных scheduler slice sizes;
- отсутствие скрытой overlay-работы при выключенных слоях;
- пауза прекращает mutating AI work;
- explicit step выполняет один шаг.

---

# Этап 12. Массовые сценарии, assertions и сравнение версий

## Task 12.1. Scenario schema

**Files:**

- Create: `src/core/testing/scenarios/AiScenarioTypes.ts`
- Create: `src/core/testing/scenarios/AiScenarioRunner.ts`
- Create: `tests/unit/ai/scenarios/schema.spec.ts`
- Create: `scripts/ai_scenario_runner.mjs`

```ts
export interface AiScenario {
  id: string;
  map: unknown;
  units: unknown[];
  threats: unknown[];
  smartObjects?: unknown[];
  orders?: unknown[];
  events?: ScheduledAiEvent[];
  seed: number;
  durationMs: number;
  assertions: AiScenarioAssertion[];
  metrics: string[];
}
```

- [ ] JSON validation with readable path errors.
- [ ] Headless run independent from PixiJS/DOM.
- [ ] Fixed time step.
- [ ] Commit: `test(ai): add deterministic headless scenario runner`.

## Task 12.2. Scenario assertions

**Files:**

- Create: `src/core/testing/scenarios/AiScenarioAssertions.ts`
- Create: `tests/unit/ai/scenarios/assertions.spec.ts`

Assertions:

```text
event_occurred
event_not_occurred
state_reached
state_not_reached
plan_selected
node_status
reaction_within_ms
max_decision_changes
slot_unique
no_running_after_end
blackboard_range
metric_range
```

- [ ] Failure report показывает expected, actual и trace window вокруг ошибки.
- [ ] Commit: `test(ai): add behavior scenario assertions`.

## Task 12.3. Метрики

**Files:**

- Create: `src/core/testing/scenarios/AiScenarioMetrics.ts`
- Create: `tests/unit/ai/scenarios/metrics.spec.ts`

Metrics:

```text
reaction time
time exposed
accumulated route danger
decision changes
cancels
replans
idle time
order progress
ammunition use
survival
AI operations
query operations
```

- [ ] Metric definitions documented and unit-tested on synthetic trace.
- [ ] Commit: `test(ai): calculate tactical behavior quality metrics`.

## Task 12.4. Scenario matrix

**Files:**

- Create: `src/core/testing/scenarios/AiScenarioMatrix.ts`
- Create: `tests/unit/ai/scenarios/matrix.spec.ts`

Variations:

```text
seed
starting position
morale
suppression
confidence
threat strength
utility weights
role
```

- [ ] Cartesian explosion controlled by explicit sample/limit.
- [ ] Matrix run deterministic.
- [ ] Commit: `test(ai): run bounded parameter and seed matrices`.

## Task 12.5. Сравнение двух версий

**Files:**

- Create: `src/core/testing/scenarios/AiScenarioReport.ts`
- Create: `scripts/ai_scenario_compare.mjs`
- Create: `tests/unit/ai/scenarios/report.spec.ts`

Report:

```text
old/new summary
improved scenarios
regressed scenarios
metric deltas
first divergent decision
trace links/artifacts
```

- [ ] Non-zero exit only for configured hard regressions.
- [ ] Markdown и JSON outputs.
- [ ] Commit: `test(ai): compare behavior versions by scenarios and metrics`.

## Task 12.6. Эталонный scenario pack

**Files:**

Создать набор в `src/data/ai/scenarios/regression/`:

```text
move-order-safe
shot-interrupts-move
cover-destroyed-during-approach
reload-under-cover
enemy-lost-search
hearing-only-threat
conflicting-reports
slot-contention
commander-loss
suppression-recovery
no-valid-cover
route-timeout
```

Каждый scenario содержит:

- смысл;
- inputs;
- expected transitions;
- forbidden behavior;
- metric ranges;
- связь с конкретной исправленной регрессией.

## Gate D — финальная контрольная точка

- `npm run test:scenarios` проходит весь regression pack.
- Одинаковый seed даёт одинаковый result hash.
- Разные seed меняют только разрешённые случайные выборы.
- Нет бесконечных Retry/Running/plan loops.
- Отделение занимает позиции без конфликтов.
- Performance budget соблюдается.
- Replay позволяет разобрать любой failed scenario.

---

# 6. Постоянная параллельная линия развития редактора

Редактор обновляется на каждом этапе, а не после завершения core.

## После этапа 1

```text
Running / Waiting / Cancelled badges
длительность ноды
progress
пауза и step
```

## После этапа 2

```text
event queue
observed blackboard keys
reactive abort source
Timeout / Retry / WaitForEvent cards
```

## После этапа 3

```text
typed ports
parameter contracts
migration warnings
subgraph navigation
local memory view
```

## После этапа 4

```text
state hierarchy
transitions
active plan
current step
abort/replan conditions
```

## После этапа 5

```text
timeline
blackboard history
breakpoints
record/replay
debug overrides
profiler
```

## После этапа 6

```text
parallel branches
action channels
channel conflicts
```

## После этапа 7

```text
Tactical Query editor
candidate stage selector
filter and scorer breakdown
budget/cache diagnostics
```

## После этапа 8

```text
slot authoring
reservation state
occupant
capabilities/posture
```

## После этапа 9

```text
stimulus list
confidence/uncertainty/age
objective vs subjective toggle
```

## После этапа 10

```text
выбор debug-focused бойца
сравнение двух бойцов
communication trace
role subgraph
```

---

# 7. Обязательные ручные проверки после каждой большой контрольной точки

## После Gate A

Через `Run-Real-Wargame-Lab.bat`:

1. Открыть игру и редактор нод.
2. Выбрать бойца.
3. Запустить длительный MoveTo.
4. Убедиться, что нода подсвечена Running.
5. Поставить игру на паузу.
6. Выполнить один шаг.
7. Создать shot event.
8. Убедиться, что MoveTo отменён и TakeCover запущен.
9. Сохранить сцену в середине движения.
10. Загрузить и продолжить.
11. Проверить, что start не повторился и маршрут не задвоился.

## После Gate B

1. Запустить сценарий с несколькими state transitions.
2. Остановиться breakpoint.
3. Проверить timeline.
4. Посмотреть Blackboard diff.
5. Сохранить record.
6. Воспроизвести.
7. Сравнить hash и последовательность переходов.
8. Принудительно провалить условие и убедиться, что trace помечает override.

## После Gate C

1. Открыть карту с несколькими укрытиями.
2. Показать candidates.
3. Переключить шаги фильтрации.
4. Посмотреть score breakdown.
5. Выбрать slot.
6. Запустить двух бойцов и проверить разные reservations.
7. Разрушить укрытие во время подхода.
8. Проверить cancel/replan/release.
9. Проверить hearing-only ситуацию без утечки объективной позиции.

## После Gate D

1. Запустить отделение.
2. Выдать групповой приказ.
3. Проверить распределение ролей/слотов.
4. Проверить передачу контакта с задержкой.
5. Потерять командира.
6. Проверить новую state/plan реакцию.
7. Запустить 50/100 агентов с overlay off/on.
8. Снять performance report.
9. Запустить regression scenario pack.

---

# 8. Скриншоты и браузерная приёмка

Для каждого UI-этапа расширять `tests/preview-screenshots.spec.ts` отдельными независимыми тестами, а не одним огромным сценарием.

Предлагаемые группы PNG:

```text
stateful-runtime/
  01-move-running.png
  02-runtime-paused.png
  03-action-cancelled.png

state-plan/
  01-following-order.png
  02-contact-transition.png
  03-suppressed-plan.png

trace-replay/
  01-timeline.png
  02-blackboard-diff.png
  03-breakpoint.png

query/
  01-all-candidates.png
  02-after-filters.png
  03-score-winner.png

smart-objects/
  01-cover-slots.png
  02-reservations.png
  03-invalidated-slot.png

perception/
  01-objective-hidden-enemy.png
  02-hearing-uncertainty.png
  03-sight-confirmation.png

multi-agent/
  01-group-slot-assignment.png
  02-communication-trace.png
  03-commander-loss.png
```

Правила:

- workflow head SHA должен совпадать с проверяемым commit;
- скачать и проверить PNG и Playwright log;
- не считать зелёный workflow достаточным без просмотра изображений;
- фиксировать конкретные видимые замечания;
- после исправления получать новый artifact;
- проверять overlay diagnostics и отсутствие массовых display objects.

---

# 9. Документация и handoff после каждого этапа

Обновлять:

```text
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/JOURNAL.md
docs/subprojects/ai-single-unit-editor/HANDOFF.md
docs/subprojects/ai-single-unit-editor/subproject.json
docs/manual-test/<STAGE_NAME>.md
docs/performance/<если есть performance gate>
```

Каждая запись должна содержать:

```text
что изменилось
зачем
новые файлы и interfaces
формат данных и версия
миграции
команды проверок
результаты
ручная проверка
скриншоты/run ids
известные ограничения
следующий безопасный этап
```

---

# 10. Рекомендуемая стратегия веток и commits

Для каждого крупного этапа:

```text
real-wargame-preview
→ отдельная рабочая ветка этапа, если прямой безопасный push невозможен
→ маленькие commits по task
→ PR только в real-wargame-preview
→ unit/headless/smoke/build
→ реальный screenshot workflow при UI
→ проверка artifacts
→ merge в real-wargame-preview
→ удаление временной ветки
```

Не открывать PR в `main`.

Рекомендуемые commit prefixes:

```text
test(ai):
feat(ai):
feat(ai-query):
feat(perception):
feat(objects):
feat(ai-debug):
feat(ai-editor):
perf(ai):
docs(ai):
```

---

# 11. Явные анти-цели и признаки неправильной реализации

Неправильно, если:

- `Running` хранится только строкой в UI, а runtime каждый тик создаётся заново;
- action-нода напрямую меняет Pixi объект;
- `Date.now()` используется как единственный источник времени core;
- отмена просто забывает action без cleanup;
- Utility оценивает и применяет effects всех кандидатов;
- проигравшая ветвь изменяет Blackboard;
- subgraph пишет во все parent keys без interface mapping;
- Tactical Query читает точную позицию невидимого врага;
- filter реализован отрицательным score вместо запрета невозможного кандидата;
- два бойца могут зарезервировать один slot;
- slot не освобождается после cancel/death;
- trace растёт бесконечно;
- overlay пересобирается целиком каждый simulation tick;
- scheduler меняет результат в зависимости от frame rate;
- replay использует wall clock;
- старый граф silently ломается после version bump;
- пользователь должен читать консоль, чтобы понять решение;
- UI проверен только чтением кода без реального браузера.

---

# 12. Итоговые контрольные точки

## Gate 0 — Baseline

```text
старое поведение зафиксировано
TS/JS parity видима
baseline performance сохранён
```

## Gate A — Stateful Runtime

```text
Running / Waiting
lifecycle
cancel / cleanup
pause / step
snapshot / restore
events / reactive abort
typed contracts
static subgraphs
```

## Gate B — Explainable Planning

```text
hierarchical states
plans
transitions
timeline
blackboard diff
record/replay
breakpoints
safe parallelism
```

## Gate C — Tactical Intelligence

```text
Tactical Query System
candidate filters/scores
visual inspection
Smart Object slots
reservations
subjective perception
```

## Gate D — Group and Scale

```text
multiple sessions
knowledge sharing
role subgraphs
group orders
scheduler/budgets
scenario matrices
regression reports
```

---

# 13. Первый рекомендуемый исполняемый подпроект

Не начинать сразу со всего плана. Первый отдельный implementation package:

```text
Stateful AI Runtime v2 — Gate A, часть 1
```

В него входят только:

```text
Task 0.1–0.4
Task 1.1–1.7
Task 2.1–2.6
```

Его конечная демонстрация:

```text
солдат начал длительное движение
→ нода Running
→ пауза и step работают
→ событие обстрела отменяет движение
→ cleanup выполняется
→ запускается другая ветвь
→ состояние сохраняется и восстанавливается
→ редактор показывает причины
```

Только после прохождения этой демонстрации переходить к typed subgraphs и Graph v2.

---

# 14. Финальный результат всей программы

После выполнения большинства пунктов система должна позволять пользователю без программирования:

1. Собрать поведение бойца из состояний, Utility-выбора и подграфов.
2. Увидеть, какая нода выполняется прямо сейчас.
3. Понять, почему действие началось, продолжилось, отменилось или провалилось.
4. Просмотреть историю и временную шкалу.
5. Воспроизвести ошибку детерминированно.
6. Увидеть все кандидаты позиции, фильтры и оценки.
7. Настроить реальные точки занятия укрытия.
8. Наблюдать субъективную память и неопределённость.
9. Проверить обмен сведениями между бойцами.
10. Массово прогнать сценарии и сравнить версии ИИ числами.

Целевая формула проекта:

```text
StateTree-подобный общий режим
+
Utility AI для выбора
+
Behavior Tree / подграф для исполнения
+
Tactical Query System для пространства
+
Smart Objects для взаимодействия
+
Perception для субъективных знаний
+
Groot-подобный trace/replay/debugger
+
Scenario Runner для объективной проверки качества
```
