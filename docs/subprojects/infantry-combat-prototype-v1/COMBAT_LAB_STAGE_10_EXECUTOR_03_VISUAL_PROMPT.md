# Stage 10 — Исполнитель 3: visual runtime, управление прогоном и скорость ×0,1

## Роль

Ты — Исполнитель 3 в координированной реализации Stage 10 для `Combat Lab`.

Твоя зона ответственности — visual controller поверх общего `CombatLabScenarioExecutor`, lifecycle визуального прогона, hooks вокруг единственного production tick, reset/start/pause/stop/step, breakpoint, runtime status, step journal, скорость `×0,1` и воспроизведение representative Seed.

Ты не реализуешь experiment contracts, editor/map authoring, headless batch runner, статистику или общий wiring `CombatLabExtension`/`CombatLabShell`.

## Репозиторий и contract gate

```text
repository: AndrewVerhoturov1/Real-wargame
orchestrator branch: feature/20260729-combat-lab-scenario-system
required preview ancestor: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
required prompt ancestor: bf4de09549b5160a5ec99f3063a6f0585417468b
worker branch: worker/20260729-combat-lab-stage10-visual
```

Создание worker-ветки от orchestration feature-ветки для этой координированной задачи явно разрешено.

Перед реализацией:

1. получить фактический remote HEAD orchestration branch;
2. проверить, что `bf4de09549b5160a5ec99f3063a6f0585417468b` является его предком;
3. проверить наличие `CombatLabExperimentContracts.ts` и `CombatLabScenarioExecutor.ts`;
4. проверить экспорт `CombatLabScenarioRuntimeSnapshotV1` и `CombatLabScenarioExecutor`;
5. записать HEAD как `contract_base_sha`;
6. создать isolated branch/worktree `worker/20260729-combat-lab-stage10-visual`.

Если executor ещё не принят в общую ветку, вернуть `BLOCKED: CORE EXECUTOR GATE NOT MERGED`. Не создавать временный второй executor внутри `src/combat-lab`.

## Обязательное чтение

Полностью прочитать:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/index.json`;
- `docs/subprojects/infantry-combat-prototype-v1/STATUS.md`;
- `docs/ai/SKILLS_INDEX.md`;
- `docs/performance/PERFORMANCE_PRINCIPLES.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-pixijs/SKILL.md`;
- `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`;
- `docs/subprojects/infantry-combat-prototype-v1/COMBAT_LAB_STAGE_10_SCENARIO_EDITOR_AND_BATCH_PROMPT.md`;
- принятые Stage 10 core files.

Изучить:

- `src/combat-lab/runtime/CombatLabVisualSession.ts`;
- `src/combat-lab/rendering/CombatLabRenderer.ts`;
- `src/combat-lab/CombatLabExtension.ts`;
- `src/combat-lab/ui/CombatLabShell.ts`;
- `src/core/testing/combat-lab/CombatLabCheckpoint.ts`;
- `src/core/testing/combat-lab/CombatLabCommands.ts`;
- `src/core/testing/combat-lab/CombatLabMetrics.ts`;
- `src/game/GameApplicationTypes.ts`;
- существующий shared time controller;
- existing journal/event snapshot path.

## Главная цель

Подготовить visual execution layer, который выполняет authored experiment через общий core executor и существующий `CombatLabVisualSession`.

Обязательные свойства:

- один объект `SimulationState`;
- один Pixi ticker;
- один fixed-step pipeline;
- `beforeSimulationStep` перед текущим `tickSimulation`;
- `afterSimulationStep` после него;
- visual runtime не создаёт gameplay facts;
- reset восстанавливает exact `sceneSnapshot`;
- manual mode продолжает использовать существующие команды;
- step cards получают immutable runtime snapshot;
- representative Seed можно загрузить для визуального повтора.

## Разрешённые файлы

```text
src/combat-lab/runtime/CombatLabExperimentVisualController.ts
src/combat-lab/runtime/CombatLabExperimentRunState.ts
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
src/combat-lab/runtime/CombatLabVisualSession.ts
src/combat-lab/ui/CombatLabExperimentRunToolbar.ts
src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts
src/combat-lab/ui/combat-lab-experiment-run.css
scripts/combat_lab_experiment_visual_*
scripts/combat_lab_visual_speed_*
scripts/combat_lab_representative_replay_*
```

Не изменять напрямую:

```text
src/combat-lab/CombatLabExtension.ts
src/combat-lab/ui/CombatLabShell.ts
src/combat-lab/rendering/CombatLabRenderer.ts
src/combat-lab/main.ts
src/combat-lab/combat-lab.css
src/combat-lab/combat-lab-workspace.css
src/core/testing/combat-lab/experiment/**
src/combat-lab/scenario-editor/**
src/combat-lab/workers/**
package.json
.github/workflows/**
docs/ai/**
real-wargame-preview
main
```

Общий wiring передать patch suggestion оркестратору.

## Жёсткие инварианты времени

Итоговый список visual speeds:

```ts
[0.1, 0.25, 0.5, 1, 2, 4, 10]
```

- `×8` не возвращать.
- `stepOnce()` всегда выполняет ровно один `COMBAT_LAB_FIXED_STEP_SECONDS`.
- Выбранная speed не влияет на один шаг.
- Pause не вызывает executor hooks и не продвигает simulation.
- Speed меняет только преобразование real delta в количество fixed steps.
- Gameplay result зависит от fixed steps и Seed, не от FPS.
- Второй ticker, `setInterval` и browser-owned simulation loop запрещены.

# Task 1. Visual controller

Создать:

```text
src/combat-lab/runtime/CombatLabExperimentVisualController.ts
src/combat-lab/runtime/CombatLabExperimentRunState.ts
scripts/combat_lab_experiment_visual_controller_smoke.mjs
```

Публичный интерфейс:

```ts
export interface CombatLabExperimentVisualControllerOptions {
  readonly session: CombatLabVisualSession;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly onRuntimeChanged: (snapshot: CombatLabScenarioRuntimeSnapshotV1) => void;
}

export class CombatLabExperimentVisualController {
  static create(options: CombatLabExperimentVisualControllerOptions): CombatLabExperimentVisualController;
  reset(seed?: number): void;
  start(): void;
  pause(): void;
  stop(): void;
  stepOnce(): void;
  beforeSimulationStep(): void;
  afterSimulationStep(): void;
  getSnapshot(): CombatLabScenarioRuntimeSnapshotV1;
  destroy(): void;
}
```

Reset обязан:

1. получить current experiment;
2. восстановить `sceneSnapshot` через существующий `restoreExportedScene`/канонический import path;
3. сохранить идентичность `session.state`;
4. применить exact Seed;
5. очистить active projectiles/actions через существующий reset path, а не вручную выборочно;
6. пересоздать `CombatLabScenarioExecutor`;
7. сбросить runtime step states;
8. увеличить visual revision;
9. очистить stale checkpoint/overlay bookkeeping через существующие hooks;
10. оставить session на паузе в состоянии ready.

Stop обязан:

- отменить только production actions с owner token текущего experiment;
- не отменять чужие manual/AI actions;
- пометить runtime `stopped`;
- не заменять state object.

Smoke cases:

- reset сохраняет state identity;
- start/pause;
- stop ownership;
- step once;
- repeated reset не накапливает listeners/actions;
- change experiment revision invalidates old executor;
- callbacks получают immutable snapshot.

# Task 2. Hooks в `CombatLabVisualSession` и speed ×0.1

Согласованно изменить:

```text
src/combat-lab/runtime/CombatLabVisualSession.ts
scripts/combat_lab_visual_speed_regression_smoke.mjs
```

Добавить минимальный hook contract, не превращая visual session в владельца experiment semantics.

Допустимый подход:

```ts
export interface CombatLabVisualStepHooks {
  beforeSimulationStep(): void;
  afterSimulationStep(): void;
}
```

Visual session должна позволить установить/снять один hook owner. Нельзя создавать список бесконтрольных hooks.

Один fixed step:

```text
hook.beforeSimulationStep()
tickSimulation(state, COMBAT_LAB_FIXED_STEP_SECONDS)
hook.afterSimulationStep()
observe metrics / refresh snapshot
```

Regression cases:

- speeds list exact;
- одинаковое real delta при ×0.1 и ×1 даёт отношение simulation time 0.1 с fixed-step tolerance;
- одинаковое количество fixed steps даёт одинаковый digest;
- pause zero advancement;
- stepOnce one fixed step at any selected speed;
- no duplicate tick;
- no second ticker.

Не обновлять документацию самостоятельно; передать оркестратору exact doc patch: заменить устаревший список скоростей на `×0,1, ×0,25, ×0,5, ×1, ×2, ×4, ×10`.

# Task 3. Breakpoint и runtime status

Создать:

```text
src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts
scripts/combat_lab_experiment_visual_breakpoint_smoke.mjs
```

Breakpoint semantics:

- пауза возникает до `executeCombatLabCommand`;
- step state становится `paused_at_breakpoint`;
- продолжение выдаёт команду ровно один раз;
- повторное refresh UI не выдаёт команду;
- stepOnce из breakpoint выполняет один fixed step и не дублирует command;
- disabled step не ставит breakpoint.

Runtime status показывает:

- experiment title/revision;
- Seed;
- simulation time;
- ready/running/paused/completed/failed/stopped;
- active step кратко;
- attempt count;
- failure reason;
- success condition status.

UI читает snapshot и не вычисляет completion.

# Task 4. Compact run toolbar

Создать:

```text
src/combat-lab/ui/CombatLabExperimentRunToolbar.ts
src/combat-lab/ui/combat-lab-experiment-run.css
scripts/combat_lab_experiment_run_ui_contract_smoke.mjs
```

Публичный интерфейс:

```ts
export interface CombatLabExperimentRunToolbarOptions {
  readonly host: HTMLElement;
  readonly controller: CombatLabExperimentVisualController;
  readonly getValidationIssues: () => readonly CombatLabExperimentIssueV1[];
  readonly onRequestBatch: () => void;
}

export class CombatLabExperimentRunToolbar {
  static create(options: CombatLabExperimentRunToolbarOptions): CombatLabExperimentRunToolbar;
  refresh(snapshot: CombatLabScenarioRuntimeSnapshotV1): void;
  destroy(): void;
}
```

Основные controls всегда видимы:

```text
[Сбросить] [▶ Запустить] [Пауза] [Шаг] [■ Остановить] [Скорость]
```

Правила:

- start disabled при validation errors;
- reset восстанавливает initial scene;
- pause/step/status используют один controller;
- request batch только вызывает callback;
- secondary Seed/checkpoint/debug controls не дублировать;
- style использует existing Combat Lab tokens/classes;
- no horizontal overflow;
- destroy снимает listeners.

# Task 5. Step journal events

Создать helper внутри разрешённого runtime файла или отдельный:

```text
src/combat-lab/runtime/CombatLabExperimentRunState.ts
```

Публиковать bounded user-facing entries:

- step started;
- command accepted/rejected;
- step completed;
- retry with attempt number;
- skipped;
- failed;
- experiment completed/failed/stopped;
- breakpoint reached.

Не дублировать production shot/impact/wound journal. Не хранить больше существующего bounded journal limit. Если требуется wiring в `CombatLabShell`, дать patch suggestion.

# Task 6. Representative replay

Создать:

```text
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
scripts/combat_lab_representative_replay_smoke.mjs
```

Публичный контракт должен принимать representative DTO из Stage 10 batch contract и visual controller.

```ts
export function replayCombatLabRepresentativeRun(
  controller: CombatLabExperimentVisualController,
  representative: CombatLabRepresentativeRunV1,
): void;
```

Semantics:

- reset current experiment scene;
- apply exact representative Seed;
- clear stale runtime result;
- remain paused/ready;
- не начинать Play автоматически;
- показывать выбранный runIndex/stopReason через status callback;
- не использовать saved final state representative run.

Smoke:

- exact seed;
- no autostart;
- old active run stopped cleanly;
- repeated replay deterministic;
- invalid/stale representative rejected by experiment revision/digest when contract exposes identity.

# Проверки Исполнителя 3

Запустить минимум:

```bash
npx tsc --noEmit
node scripts/combat_lab_experiment_visual_controller_smoke.mjs
node scripts/combat_lab_visual_speed_regression_smoke.mjs
node scripts/combat_lab_experiment_visual_breakpoint_smoke.mjs
node scripts/combat_lab_experiment_run_ui_contract_smoke.mjs
node scripts/combat_lab_representative_replay_smoke.mjs
npm run combat-lab:smoke
npm run combat-lab-runner:smoke
npm run infantry-combat-stage9:verify
npm run build
```

Не изменять `package.json`; aggregate scripts добавляет оркестратор.

Не запускать Chromium/Playwright без отдельного разрешения. Не заявлять visual QA по source smoke.

## Коммиты

Не более трёх осмысленных коммитов:

```text
feat(combat-lab): run authored experiments visually
feat(combat-lab): add slow motion and scenario breakpoints
feat(combat-lab): add experiment run controls and replay
```

## Обязательный patch suggestion оркестратору

Указать:

- где создать visual controller;
- как установить hooks в session;
- как подключить toolbar без второго time controller;
- как передать snapshots editor cards;
- как связать batch representative button с replay;
- как добавить CSS import;
- как заменить old `Новый visual run` и `Рекомендуемый запуск` без сохранения двух конкурирующих runtime.

## Стоп-условия

Вернуть `BLOCKED`, если:

- core executor gate отсутствует;
- visual parity требует второй simulation pipeline;
- невозможно сохранить state identity;
- stop требует отменять чужие actions;
- требуется менять `.github/workflows/`.

Вернуть `FAIL`, если:

- один logical step вызывает два ticks;
- speed/FPS меняет gameplay result;
- breakpoint дублирует command;
- reset накапливает lifecycle resources;
- typecheck/build падает из-за diff.

Вернуть `READY FOR INTEGRATION`, только когда visual components и focused checks готовы.

## Финальный отчёт

```text
status: READY FOR INTEGRATION | BLOCKED | FAIL
executor: 3
worker_branch: worker/20260729-combat-lab-stage10-visual
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