# Stage 10 — Исполнитель 1: контракты, валидация и общий сценарный runtime

## Роль

Ты — Исполнитель 1 в координированной реализации Stage 10 для `Combat Lab`.

Ты не являешься оркестратором всей задачи. Твоя зона ответственности — browser-free core нового формата эксперимента, его валидация, сериализация, условия, завершение действий, общий детерминированный executor и встроенные experiment templates.

После выполнения остановись. Не интегрируй UI, visual controller, batch worker и общие wiring-файлы.

## Репозиторий и обязательная база

```text
repository: AndrewVerhoturov1/Real-wargame
orchestrator branch: feature/20260729-combat-lab-scenario-system
required coordination ancestor: b6ba83097de4c56a5d45723e2b9fd0ed7f2a44fd
required preview ancestor: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
worker branch: worker/20260729-combat-lab-stage10-core
```

Создание worker-ветки от orchestration feature-ветки для этой координированной задачи явно разрешено данным заданием. Не использовать другую активную feature-ветку.

Перед изменениями:

1. проверить фактический удалённый HEAD `feature/20260729-combat-lab-scenario-system`;
2. проверить, что `b6ba83097de4c56a5d45723e2b9fd0ed7f2a44fd` является его предком;
3. проверить, что `6a21502da66b2b7dbd9054db7f57e6864b1c4fb5` является предком coordination ancestor;
4. сравнить actual HEAD с `b6ba83097de4c56a5d45723e2b9fd0ed7f2a44fd`;
5. до contract gate разрешены только добавленные Stage 10 prompt/docs-файлы; product-код `src/**`, tests `scripts/**`, `package.json` и workflows не должны отличаться;
6. записать actual HEAD как `coordination_start_sha`;
7. создать изолированный worktree или локальную ветку `worker/20260729-combat-lab-stage10-core` от actual HEAD;
8. не изменять orchestration branch напрямую.

Если после coordination ancestor уже изменён product-код или добавлены несовместимые experiment contracts, не начинать реализацию. Вернуть `BLOCKED` с фактическим SHA и сравнением.

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
- `docs/subprojects/infantry-combat-prototype-v1/COMBAT_LAB_STAGE_10_SCENARIO_EDITOR_AND_BATCH_PROMPT.md`.

Изучить существующие реализации:

- `src/core/testing/combat-lab/CombatLabContracts.ts`;
- `src/core/testing/combat-lab/CombatLabCommands.ts`;
- `src/core/testing/combat-lab/CombatLabRunner.ts`;
- `src/core/testing/combat-lab/CombatLabScenarioRegistry.ts`;
- `src/core/testing/combat-lab/CombatLabScenarioFactories.ts`;
- `src/core/testing/combat-lab/CombatLabDigest.ts`;
- `src/core/testing/combat-lab/CombatLabMetrics.ts`;
- `src/core/testing/combat-lab/CombatLabCheckpoint.ts`;
- `src/ui/SceneExport.ts`;
- production completion state для movement, posture, fire, reload, deployment, transfer и first aid.

## Главная цель

Создать стабильный сериализуемый контракт `CombatLabExperimentV1` и один core-исполнитель `CombatLabScenarioExecutor`, который:

- выполняет последовательные действия внутри дорожки;
- выполняет разные дорожки параллельно;
- выдаёт команды только через существующий `executeCombatLabCommand`;
- определяет завершение по наблюдаемому production state/event;
- поддерживает bounded repeat;
- одинаково используется будущим visual и headless runtime;
- не импортирует DOM, PixiJS, `GameApplication` или browser timers.

## Жёсткие границы

Разрешённые product-файлы:

```text
src/core/testing/combat-lab/experiment/**
src/core/testing/combat-lab/index.ts
src/core/testing/combat-lab/CombatLabScenarioRegistry.ts
```

Разрешённые test-файлы:

```text
scripts/combat_lab_experiment_*
scripts/combat_lab_scenario_executor_*
scripts/combat_lab_built_in_experiments_*
```

Не изменять:

```text
src/combat-lab/**
src/game/**
src/ui/** кроме чтения SceneExport
package.json
.github/workflows/**
docs/ai/**
docs/subprojects/infantry-combat-prototype-v1/subproject.json
real-wargame-preview
main
```

Если нужен export или wiring за пределами разрешённых файлов, зафиксировать точный patch suggestion в отчёте оркестратору, но не менять файл.

## Производственные инварианты

- Не создавать пули, impacts, ранения или подавление напрямую.
- Не менять положение, позу или capability напрямую.
- Не подставлять objective position скрытой цели.
- Не считать действие завершённым по произвольному timeout, если существует наблюдаемый production-факт.
- `CombatLabScenarioExecutor` не вызывает `tickSimulation`.
- На один fixed step проверяется максимум первый незавершённый enabled-step каждой дорожки.
- Максимум 64 дорожки, 512 steps, 256 markers.
- Repeat имеет `maximumAttempts` в диапазоне `1..1000`.
- Все ID стабильны и уникальны в своей области.
- Все координаты core-контракта хранятся в метрах или отдельно обозначенной grid-системе, не в пикселях.

# Волна 1 — обязательный contract gate

Эта часть должна быть отдельным первым коммитом. После неё остановись и передай SHA оркестратору, прежде чем продолжать Wave 2.

## Task 1. Контракты

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts
src/core/testing/combat-lab/experiment/index.ts
scripts/combat_lab_experiment_contract_smoke.mjs
```

Определить и экспортировать:

- `CombatLabExperimentV1`;
- `CombatLabExperimentRoleV1`;
- `CombatLabMarkerV1` с `point | circle`;
- `CombatLabTrackV1`;
- `CombatLabScenarioStepV1`;
- `CombatLabActionV1`;
- `CombatLabConditionV1`;
- `CombatLabCompletionV1`;
- `CombatLabRepeatPolicyV1`;
- `CombatLabExperimentDefaultsV1`;
- `CombatLabExperimentStopConditionV1`;
- `CombatLabBatchConfigV1`;
- `CombatLabScenarioRuntimeSnapshotV1`;
- `CombatLabStepRuntimeState`.

Контракты должны точно соответствовать разделам 5–7 главного Stage 10 prompt.

Обязательные действия первой версии:

- fire;
- stop_fire;
- move;
- posture;
- wait;
- reload;
- deploy;
- undeploy;
- transfer;
- first_aid.

Обязательные условия первой версии:

- always;
- elapsed;
- step_state;
- role_state;
- contact;
- ammo;
- suppression.

Обязательные runtime-состояния step:

```text
pending
waiting
running
completed
failed
skipped
paused_at_breakpoint
```

### Contract smoke

Проверить:

- `schemaVersion: 1`;
- отсутствие DOM/Pixi imports;
- отсутствие неограниченного repeat;
- наличие role/marker references;
- наличие ограничений batch/track/step;
- экспорт через `experiment/index.ts` и core `index.ts`;
- отсутствие `any` в публичных типах.

Запустить:

```bash
node scripts/combat_lab_experiment_contract_smoke.mjs
npx tsc --noEmit
```

Сначала smoke обязан воспроизводимо падать из-за отсутствующего контракта. Затем реализовать минимальный контракт и добиться PASS.

### Contract gate commit

```bash
git add src/core/testing/combat-lab/experiment src/core/testing/combat-lab/index.ts scripts/combat_lab_experiment_contract_smoke.mjs
git commit -m "feat(combat-lab): define Stage 10 experiment contracts"
```

После коммита сообщить оркестратору:

```text
CONTRACT GATE READY
worker_branch:
coordination_start_sha:
contract_commit:
checks:
public_exports:
```

Не продолжать Wave 2 до подтверждения, что оркестратор перенёс contract commit в общую feature-ветку.

# Волна 2 — core-реализация

После подтверждения оркестратора обновить worker-ветку на принятую общую feature-ветку без переписывания уже переданного contract commit.

## Task 2. Limits, validation и issues

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts
scripts/combat_lab_experiment_validation_smoke.mjs
```

Публичный контракт:

```ts
export interface CombatLabExperimentIssueV1 {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly messageRu: string;
  readonly path: string;
}

export function validateCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): readonly CombatLabExperimentIssueV1[];
```

Errors:

- unsupported schema;
- duplicate role/marker/track/step ID;
- отсутствующая ссылка;
- role unit отсутствует в scene snapshot;
- marker вне карты;
- invalid circle radius;
- dependency cycle через `step_state`;
- invalid timeout/repeat/batch limit;
- превышение entity limits.

Warnings:

- у firing role нет primary weapon;
- mode не поддерживается;
- helper совпадает с actor;
- condition уже true;
- статически недостижимый step;
- недостаточный боекомплект для ожидаемого repeat.

Валидация не запускает симуляцию и не бросает исключения на корректно типизированном пользовательском объекте.

## Task 3. Serialization и digest

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentSerialization.ts
src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts
scripts/combat_lab_experiment_serialization_smoke.mjs
```

Публичный контракт:

```ts
export function serializeCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): string;

export function parseCombatLabExperiment(
  json: string,
): {
  readonly experiment: CombatLabExperimentV1 | null;
  readonly issues: readonly CombatLabExperimentIssueV1[];
};

export function digestCombatLabExperiment(
  experiment: CombatLabExperimentV1,
): string;
```

Требования:

- deterministic JSON;
- форматирование в два пробела;
- round-trip сохраняет digest;
- повреждённый JSON возвращает issue, а не необработанное исключение;
- UI-only state не входит в digest;
- изменение семантики step меняет digest.

Использовать существующую стабильную canonicalization/digest практику Combat Lab, не создавать несовместимый второй алгоритм без причины.

## Task 4. Conditions и observable completion

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabScenarioConditions.ts
src/core/testing/combat-lab/experiment/CombatLabScenarioCompletion.ts
```

Реализовать чистые функции оценки условий и завершения.

Обязательные факты завершения:

- движение завершено production movement/order state;
- posture transition завершён;
- fire task завершена;
- committed shot получил impact или termination;
- reload завершён;
- deployment/undeployment завершён;
- transfer завершён;
- first aid stage/action завершён;
- условие действительно стало true.

Не использовать arbitrary elapsed time как замену production completion.

## Task 5. `CombatLabScenarioExecutor`

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts
scripts/combat_lab_scenario_executor_smoke.mjs
```

Публичный контракт:

```ts
export class CombatLabScenarioExecutor {
  static create(
    experiment: CombatLabExperimentV1,
    state: SimulationState,
  ): CombatLabScenarioExecutor;

  beforeSimulationStep(): readonly CombatLabCommandResultV1[];
  afterSimulationStep(): void;
  getSnapshot(): CombatLabScenarioRuntimeSnapshotV1;
  stop(reasonCode: string, reasonRu: string): void;
}
```

Детерминированный порядок:

1. track source order;
2. первый незавершённый enabled-step;
3. start condition;
4. компиляция action в `CombatLabScriptCommandV1`;
5. один вызов `executeCombatLabCommand` на одну попытку;
6. production tick выполняет внешний caller;
7. completion/repeat/failure policy после tick;
8. immutable snapshot.

Обязательные smoke cases:

- последовательные steps одной дорожки;
- параллельные дорожки;
- elapsed wait;
- зависимость от завершения другого step;
- movement completion;
- posture completion;
- single shot после разрешения projectile;
- repeat fire до incapacitated;
- bounded maximumAttempts;
- failure policies `stop_experiment | wait | skip_step`;
- deterministic same seed;
- executor не вызывает `tickSimulation`;
- executor не создаёт projectile/wound/suppression напрямую.

## Task 6. Built-in experiment templates

Создать:

```text
src/core/testing/combat-lab/experiment/CombatLabBuiltInExperiments.ts
scripts/combat_lab_built_in_experiments_smoke.mjs
```

Разрешено согласованно изменить:

```text
src/core/testing/combat-lab/CombatLabScenarioRegistry.ts
```

Публичный контракт:

```ts
export function buildCombatLabBuiltInExperiment(
  scenarioId: CombatLabScenarioId,
  seed: number,
): CombatLabExperimentV1;

export function listCombatLabBuiltInExperiments(
  seedOverride?: number,
): readonly CombatLabExperimentV1[];
```

Требования:

- все восемь текущих scenarios представлены;
- sceneSnapshot строится через канонический scene export;
- текущие stable role IDs сохраняются;
- current `defaultProgram` конвертируется в tracks;
- template имеет read-only metadata, но core не владеет UI copy action;
- существующий `runCombatLabScenario` остаётся рабочим до интеграции.

## Проверки Исполнителя 1

Запустить минимум:

```bash
npx tsc --noEmit
node scripts/combat_lab_experiment_contract_smoke.mjs
node scripts/combat_lab_experiment_validation_smoke.mjs
node scripts/combat_lab_experiment_serialization_smoke.mjs
node scripts/combat_lab_scenario_executor_smoke.mjs
node scripts/combat_lab_built_in_experiments_smoke.mjs
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run infantry-combat-stage9:verify
npm run build
```

Не изменять `package.json`; оркестратор добавит aggregate scripts.

## Коммиты

После contract gate использовать не более двух дополнительных осмысленных коммитов:

```text
feat(combat-lab): validate and execute authored experiments
feat(combat-lab): expose built-in experiment templates
```

Перед отчётом просмотреть полный diff worker-ветки относительно принятой orchestration branch.

## Стоп-условия

Вернуть `BLOCKED`, если:

- обязательные ancestors не совпали;
- после coordination ancestor уже изменён product-код;
- для completion требуется прямая мутация gameplay state;
- нужен второй simulation pipeline;
- требуется менять `.github/workflows/`;
- нужно ослабить существующие Stage 8/9/Combat Lab tests.

Вернуть `FAIL`, если:

- новый focused smoke воспроизводимо падает;
- typecheck или build не проходит из-за твоего diff;
- executor недетерминирован;
- existing runner/scenario behavior сломан.

Вернуть `READY FOR INTEGRATION`, только когда core готов и проверки зелёные.

## Финальный отчёт

```text
status: READY FOR INTEGRATION | BLOCKED | FAIL
executor: 1
worker_branch: worker/20260729-combat-lab-stage10-core
orchestrator_branch: feature/20260729-combat-lab-scenario-system
required_coordination_ancestor: b6ba83097de4c56a5d45723e2b9fd0ed7f2a44fd
coordination_start_sha:
contract_commit:
implementation_commits:
current_commit:
files_changed:
public_interfaces:
checks_run:
performance_impact:
integration_patch_suggestions:
deployment_requested: false
deployment_status: not_started
preview_touched: false
main_touched: false
```

После отчёта остановиться. Не создавать PR, не merge, не push в orchestration branch, не деплоить.