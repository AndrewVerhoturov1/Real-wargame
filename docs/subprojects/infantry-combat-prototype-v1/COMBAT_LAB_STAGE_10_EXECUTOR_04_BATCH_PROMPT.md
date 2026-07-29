# Stage 10 — Исполнитель 4: headless runner, batch worker, статистика и результаты

## Роль

Ты — Исполнитель 4 в координированной реализации Stage 10 для `Combat Lab`.

Твоя зона ответственности — одиночный browser-free run нового experiment, deterministic batch execution, Seed assignment, агрегаты, representative runs, Web Worker, progress/cancel/stale-result rejection и компактный result UI.

Ты не реализуешь experiment contracts/executor, editor/map authoring, visual controller или общий wiring `CombatLabExtension`/`CombatLabShell`.

## Репозиторий и contract gate

```text
repository: AndrewVerhoturov1/Real-wargame
orchestrator branch: feature/20260729-combat-lab-scenario-system
required preview ancestor: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
required prompt ancestor: 6197529e082368329a711d4b2c352d666b16aa0d
worker branch: worker/20260729-combat-lab-stage10-batch
```

Создание worker-ветки от orchestration feature-ветки для этой координированной задачи явно разрешено.

Перед реализацией:

1. получить фактический remote HEAD orchestration branch;
2. проверить, что `6197529e082368329a711d4b2c352d666b16aa0d` является его предком;
3. проверить наличие `CombatLabExperimentContracts.ts`, `CombatLabScenarioExecutor.ts`, serializer/digest и validation;
4. проверить export `CombatLabExperimentV1`, `CombatLabBatchConfigV1`, `CombatLabScenarioExecutor`;
5. записать HEAD как `contract_base_sha`;
6. создать isolated branch/worktree `worker/20260729-combat-lab-stage10-batch`.

Если core executor ещё не принят, вернуть `BLOCKED: CORE EXECUTOR GATE NOT MERGED`. Не копировать executor в batch layer.

## Обязательное чтение

Полностью прочитать:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/index.json`;
- `docs/subprojects/infantry-combat-prototype-v1/STATUS.md`;
- `docs/ai/SKILLS_INDEX.md`;
- `docs/performance/PERFORMANCE_PRINCIPLES.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`;
- `docs/subprojects/infantry-combat-prototype-v1/COMBAT_LAB_STAGE_10_SCENARIO_EDITOR_AND_BATCH_PROMPT.md`;
- принятые Stage 10 core files.

Изучить:

- `src/core/testing/combat-lab/CombatLabRunner.ts`;
- `src/core/testing/combat-lab/CombatLabMetrics.ts`;
- `src/core/testing/combat-lab/CombatLabDigest.ts`;
- `src/core/testing/combat-lab/CombatLabScenarioRegistry.ts`;
- `src/core/testing/combat-lab/CombatLabCheckpoint.ts`;
- существующие Worker contracts и lifecycle patterns репозитория;
- существующие compact metric cards и Russian metric labels;
- Vite worker bundling practice в проекте.

## Главная цель

Реализовать один browser-free experiment run и массовый batch, которые используют тот же `CombatLabScenarioExecutor`, ту же initial scene, тот же Seed и тот же `tickSimulation`, что visual execution.

Пользователь должен иметь возможность:

- запустить от 1 до 10 000 прогонов;
- выбрать fixed/sequential/explicit Seed strategy;
- указать maximum simulation seconds;
- использовать 1–4 workers;
- видеть bounded progress;
- отменить серию;
- получить deterministic aggregates;
- получить максимум 20 representative runs;
- передать representative в visual replay по точному Seed.

## Разрешённые файлы

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts
src/core/testing/combat-lab/experiment/CombatLabBatchContracts.ts
src/core/testing/combat-lab/experiment/CombatLabBatchRunner.ts
src/core/testing/combat-lab/experiment/CombatLabBatchStatistics.ts
src/core/testing/combat-lab/experiment/CombatLabRepresentativeRuns.ts
src/combat-lab/workers/combat-lab-batch.worker.ts
src/combat-lab/runtime/CombatLabBatchClient.ts
src/combat-lab/ui/CombatLabBatchPanel.ts
src/combat-lab/ui/CombatLabBatchResultsView.ts
src/combat-lab/ui/CombatLabMetricDistributionView.ts
src/combat-lab/ui/combat-lab-batch-results.css
scripts/combat_lab_experiment_runner_*
scripts/combat_lab_batch_*
```

Не изменять напрямую:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts
src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts
src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts
src/core/testing/combat-lab/experiment/CombatLabExperimentSerialization.ts
src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts
src/combat-lab/CombatLabExtension.ts
src/combat-lab/ui/CombatLabShell.ts
src/combat-lab/main.ts
src/combat-lab/runtime/CombatLabVisualSession.ts
src/combat-lab/scenario-editor/**
package.json
.github/workflows/**
docs/ai/**
real-wargame-preview
main
```

Если необходим дополнительный public export из core index, передать patch suggestion оркестратору или Исполнителю 1; не переписывать чужие файлы.

## Производительность и lifecycle

- Batch не выполняется на main thread.
- Worker count `1..4`.
- Chunk size `<=25`.
- Progress UI `<=10 Hz`.
- Queue bounded.
- Cancel прекращает назначение новых chunks.
- Worker teardown обязателен.
- UI не получает full `SimulationState` каждого run.
- UI не хранит 10 000 individual result rows.
- Full event history каждого run не сохраняется.
- Stale result rejection: `batchRunId + experimentRevision + sourceDigest`.
- Worker count не меняет Seed-to-run mapping и aggregates.
- Асинхронная completion order не меняет итог.
- Ошибки workers видимы пользователю и не замалчиваются.

# Task 1. Single headless experiment run

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts
scripts/combat_lab_experiment_runner_smoke.mjs
```

Публичные контракты:

```ts
export interface CombatLabExperimentRunRequestV1 {
  readonly schemaVersion: 1;
  readonly experiment: CombatLabExperimentV1;
  readonly seed: number;
  readonly maximumSimulationSeconds: number;
}

export interface CombatLabExperimentRunResultV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
  readonly seed: number;
  readonly completed: boolean;
  readonly success: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
  readonly stepFailureCode: string | null;
}

export function runCombatLabExperiment(
  request: CombatLabExperimentRunRequestV1,
): CombatLabExperimentRunResultV1;
```

Цикл строго:

```text
executor.beforeSimulationStep()
tickSimulation(state, COMBAT_LAB_FIXED_STEP_SECONDS)
executor.afterSimulationStep()
```

Требования:

- initial state создаётся из experiment scene snapshot через канонический restore path;
- validation errors блокируют run;
- explicit seed override применяется детерминированно;
- stop при executor complete/failed, success condition или maximum simulation time;
- metrics используют существующий collector;
- event/final digest используют существующую stable digest practice;
- browser-free, no DOM/Pixi/GameApplication;
- не создавать второй simulation pipeline.

Smoke:

- same seed exact equality;
- different seed может менять stochastic result, но contract остаётся valid;
- maximum time;
- failed step code;
- all tracks complete;
- visual parity fixture по одинаковым fixed steps, если accepted visual helper доступен;
- no browser imports.

# Task 2. Batch contracts

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabBatchContracts.ts
```

Публичные контракты:

```ts
export interface CombatLabBatchRequestV1 {
  readonly schemaVersion: 1;
  readonly batchRunId: string;
  readonly experiment: CombatLabExperimentV1;
  readonly config: CombatLabBatchConfigV1;
}

export interface CombatLabBatchProgressV1 {
  readonly batchRunId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
  readonly completedRuns: number;
  readonly totalRuns: number;
}

export interface CombatLabDistributionSummaryV1 {
  readonly count: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly mean: number;
  readonly median: number;
  readonly p05: number;
  readonly p95: number;
}

export interface CombatLabRepresentativeRunV1 {
  readonly runIndex: number;
  readonly seed: number;
  readonly success: boolean;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
}

export interface CombatLabBatchResultV1 {
  readonly schemaVersion: 1;
  readonly batchRunId: string;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
  readonly runCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly metrics: Readonly<Record<string, CombatLabDistributionSummaryV1>>;
  readonly failureReasons: Readonly<Record<string, number>>;
  readonly representatives: readonly CombatLabRepresentativeRunV1[];
}
```

Не добавлять full per-run array в итоговый публичный результат.

# Task 3. Seed assignment, statistics и representatives

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabBatchStatistics.ts
src/core/testing/combat-lab/experiment/CombatLabRepresentativeRuns.ts
scripts/combat_lab_batch_statistics_smoke.mjs
```

Seed semantics:

- fixed: один exact seed для каждого run;
- sequential: `firstSeed + runIndex` с uint32 normalization; zero становится one;
- explicit: exact list; runCount должен совпадать с list length.

Statistics:

- count;
- minimum;
- maximum;
- mean;
- median;
- p05;
- p95.

Percentile algorithm должен быть явно зафиксирован тестом и детерминирован. Использовать один выбранный interpolation rule для всех metrics.

Representative selection, максимум 20:

- fastest success;
- slowest success;
- highest ammo use;
- lowest ammo use;
- first failure для каждого доминирующего failure reason;
- дополнительно только если остаётся лимит и правило детерминировано.

Tie-break: меньший `runIndex`.

Smoke:

- known sample distributions;
- even/odd median;
- p05/p95 fixtures;
- merge order invariance;
- representative tie-break;
- no duplicates unless один run одновременно является единственным representative для разных categories, при этом public list содержит его один раз.

# Task 4. Pure batch runner

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabBatchRunner.ts
scripts/combat_lab_batch_runner_smoke.mjs
```

Публичный pure contract:

```ts
export interface CombatLabBatchRunOptionsV1 {
  readonly onProgress?: (progress: CombatLabBatchProgressV1) => void;
  readonly shouldAbort?: () => boolean;
  readonly chunkSize?: number;
}

export function runCombatLabBatch(
  request: CombatLabBatchRequestV1,
  options?: CombatLabBatchRunOptionsV1,
): CombatLabBatchResultV1;
```

Это browser-free reference runner для tests/worker internals. Он может быть synchronous, но не вызывается UI main thread в production.

Требования:

- run count `1..10000`;
- chunk `1..25`;
- deterministic runIndex order;
- progress только на chunk boundary и final;
- abort прекращает новые runs;
- отменённый run не выдаётся как полный successful batch result: использовать typed cancellation result/error contract, согласованный с accepted contracts;
- aggregation streaming/bounded, без сохранения full states;
- same request exact equality;
- worker concurrency merge order не должен менять result.

Smoke:

- 1/10/100 runs;
- worker-count-independent reference partition merge;
- cancellation;
- invalid limits;
- deterministic representatives;
- failure reasons;
- no DOM/Pixi imports.

# Task 5. Web Worker и client

Создать:

```text
src/combat-lab/workers/combat-lab-batch.worker.ts
src/combat-lab/runtime/CombatLabBatchClient.ts
scripts/combat_lab_batch_worker_contract_smoke.mjs
```

Публичный client contract:

```ts
export interface CombatLabBatchClientCallbacks {
  readonly onProgress: (progress: CombatLabBatchProgressV1) => void;
  readonly onComplete: (result: CombatLabBatchResultV1) => void;
  readonly onCancelled: (completedRuns: number, totalRuns: number) => void;
  readonly onError: (messageRu: string, technicalDetail: string) => void;
}

export class CombatLabBatchClient {
  start(request: CombatLabBatchRequestV1, callbacks: CombatLabBatchClientCallbacks): void;
  cancel(): void;
  destroy(): void;
}
```

Worker protocol обязан быть versioned и discriminated.

Минимальные message kinds:

```text
start
cancel
progress
complete
cancelled
error
```

Правила:

- client не запускает второй active batch без явной отмены старого;
- default worker count = clamp(`hardwareConcurrency - 1`, 1, 4), fallback 1;
- run indices partitions deterministic;
- chunks <=25;
- progress throttled <=10 Hz в client/UI boundary;
- stale messages rejected по batchRunId/revision/digest;
- destroy terminates all workers;
- worker exception сообщает русский summary и technical detail;
- no SimulationState posted to UI;
- request/result structured clone compatible;
- не использовать SharedArrayBuffer.

Source contract smoke проверяет lifecycle и protocol. Production build обязан подтвердить Vite bundling worker entry.

# Task 6. Compact batch panel

Создать:

```text
src/combat-lab/ui/CombatLabBatchPanel.ts
src/combat-lab/ui/combat-lab-batch-results.css
scripts/combat_lab_batch_results_ui_contract_smoke.mjs
```

Controls:

- run count;
- Seed strategy fixed/sequential/explicit;
- first/fixed Seed;
- explicit seed list input;
- maximum simulation seconds;
- worker count;
- metrics selection;
- start;
- cancel;
- progress.

Rules:

- validation errors disable start;
- default count 100;
- allowed count 1..10000;
- explicit list parser reports line/token error without exception;
- controls compact, existing Combat Lab style;
- no horizontal overflow;
- progress DOM updates <=10 Hz;
- cancellation clearly says partial result not accepted as final;
- edit experiment while batch active does not let stale result replace current result.

Публичный interface:

```ts
export interface CombatLabBatchPanelOptions {
  readonly host: HTMLElement;
  readonly client: CombatLabBatchClient;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly getValidationIssues: () => readonly CombatLabExperimentIssueV1[];
  readonly onResult: (result: CombatLabBatchResultV1) => void;
}
```

# Task 7. Results, distributions и representative actions

Создать:

```text
src/combat-lab/ui/CombatLabBatchResultsView.ts
src/combat-lab/ui/CombatLabMetricDistributionView.ts
scripts/combat_lab_batch_result_render_contract_smoke.mjs
```

Result summary:

- run count;
- success/failure;
- success rate;
- mean/median/p05/p95 time;
- average ammo;
- average hits/misses;
- dominant failure reasons.

Histogram:

- CSS/SVG only;
- no external chart library;
- maximum 40 buckets;
- renderer receives aggregate/bounded distribution input, not 10 000 rows;
- Russian metric labels reuse existing `CombatLabMetricLabels` through injected label function or import, без duplicate dictionary.

Representative cards:

```text
Самый долгий успешный прогон · Seed 9274 · 58,3 с
[Повторить визуально]
```

View only invokes callback:

```ts
onReplayRepresentative(representative: CombatLabRepresentativeRunV1): void
```

Не импортировать visual controller напрямую в results view.

# Проверки Исполнителя 4

Запустить минимум:

```bash
npx tsc --noEmit
node scripts/combat_lab_experiment_runner_smoke.mjs
node scripts/combat_lab_batch_statistics_smoke.mjs
node scripts/combat_lab_batch_runner_smoke.mjs
node scripts/combat_lab_batch_worker_contract_smoke.mjs
node scripts/combat_lab_batch_results_ui_contract_smoke.mjs
node scripts/combat_lab_batch_result_render_contract_smoke.mjs
npm run combat-lab-runner:smoke
npm run combat-lab-scenarios:smoke
npm run infantry-combat-stage9:verify
npm run build
```

Не изменять `package.json`; aggregate scripts добавляет оркестратор.

Не запускать Chromium/Playwright без отдельного разрешения. Не считать source rendering contract визуальной проверкой.

## Коммиты

Не более трёх осмысленных коммитов:

```text
feat(combat-lab): run authored experiments headlessly
feat(combat-lab): add deterministic batch workers
feat(combat-lab): add compact experiment results
```

## Обязательный patch suggestion оркестратору

Указать:

- какие exports добавить в core/combat-lab index;
- где создать `CombatLabBatchClient`;
- как смонтировать `CombatLabBatchPanel` в `Метрики → Серия`;
- как передать experiment validation/digest;
- как соединить representative callback с visual replay;
- как импортировать scoped CSS;
- как заменить `Чистый headless run` на `Серия прогонов`;
- какие package scripts добавить.

## Стоп-условия

Вернуть `BLOCKED`, если:

- core executor gate отсутствует;
- batch требует второй simulation pipeline;
- worker не может импортировать browser-free core без DOM/Pixi dependency;
- требуется SharedArrayBuffer/server;
- требуется менять `.github/workflows/`.

Вернуть `FAIL`, если:

- same request недетерминирован;
- worker count меняет aggregates/representatives;
- stale result применяется;
- cancel оставляет workers;
- main-thread production path выполняет batch synchronously;
- typecheck/build падает из-за diff.

Вернуть `READY FOR INTEGRATION`, когда headless/batch/results готовы и focused checks зелёные.

## Финальный отчёт

```text
status: READY FOR INTEGRATION | BLOCKED | FAIL
executor: 4
worker_branch: worker/20260729-combat-lab-stage10-batch
orchestrator_branch: feature/20260729-combat-lab-scenario-system
contract_base_sha:
current_commit:
implementation_commits:
files_changed:
public_interfaces:
checks_run:
performance_impact:
integration_patch_suggestions:
visual_qa_status: not_run_without_permission
deployment_requested: false
deployment_status: not_started
preview_touched: false
main_touched: false
```

После отчёта остановиться. Не создавать PR, не merge, не push в orchestration branch, не деплоить.