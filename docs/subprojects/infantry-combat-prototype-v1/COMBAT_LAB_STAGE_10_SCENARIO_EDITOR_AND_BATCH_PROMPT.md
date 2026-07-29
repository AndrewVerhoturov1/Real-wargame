# Combat Lab Stage 10 — визуальный редактор сценариев и массовые прогоны

## Статус документа

Этот файл является обязательным заданием на следующий этап развития `Combat Lab`.

Работа начинается только от указанной базы и выполняется в отдельной feature-ветке. Документ фиксирует продуктовые решения, архитектурные границы, распределение работы между четырьмя исполнителями, критерии проверки и стоп-условия.

## Репозиторий и обязательная база

```text
repository: AndrewVerhoturov1/Real-wargame
base branch: real-wargame-preview
required base SHA: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
working branch: feature/20260729-combat-lab-scenario-system
```

Перед любыми изменениями:

1. прочитать `AGENTS.md`;
2. прочитать `docs/ai/repo-context.json`;
3. прочитать `docs/subprojects/index.json`;
4. прочитать `docs/subprojects/infantry-combat-prototype-v1/STATUS.md`;
5. прочитать `docs/ai/SKILLS_INDEX.md`;
6. прочитать `docs/performance/PERFORMANCE_PRINCIPLES.md`;
7. прочитать `.agents/skills/real-wargame-performance/SKILL.md`;
8. прочитать `.agents/skills/real-wargame-pixijs/SKILL.md` перед изменениями карты, pointer events или Pixi overlay;
9. прочитать `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
10. прочитать `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`;
11. проверить фактический удалённый HEAD `real-wargame-preview`.

Если фактический HEAD `real-wargame-preview` отличается от обязательного SHA:

1. не начинать реализацию;
2. зафиксировать новый SHA;
3. сравнить его с обязательной базой;
4. вернуть статус `BLOCKED` с оценкой влияния расхождения.

Не использовать другую активную feature-ветку как базу.

---

# 1. Цель этапа

Превратить текущий Combat Lab из набора жёстко заданных демонстрационных программ в компактный визуальный конструктор воспроизводимых боевых экспериментов.

Пользователь должен иметь возможность:

1. подготовить начальную сцену на существующей игровой карте;
2. назначить бойцам понятные роли;
3. поставить именованные точки и области на карте;
4. собрать для каждого бойца последовательную дорожку действий;
5. запускать дорожки разных бойцов параллельно;
6. добавлять действия непосредственно правой кнопкой по бойцу или местности;
7. визуально запустить эксперимент через настоящую производственную симуляцию;
8. поставить паузу, сделать один шаг и использовать скорости от `×0,1` до `×10`;
9. выполнить тот же эксперимент без графики много раз;
10. получить агрегированные показатели;
11. выбрать необычный результат серии и воспроизвести его визуально по точному Seed.

Главная пользовательская формула:

> Собрать эксперимент на карте → посмотреть его вживую → просчитать сотни или тысячи повторений → открыть характерный Seed в визуальном режиме.

---

# 2. Зафиксированные продуктовые решения

Эти решения не подлежат замене без отдельного согласования.

## 2.1. Сцена, программа и эксперимент

Система различает три сущности:

- **Сцена** — карта, бойцы, оружие, патроны, позиции, позы, ранения и остальные исходные состояния.
- **Программа** — роли, метки, дорожки, действия, условия и повторы.
- **Эксперимент** — сцена + программа + Seed + параметры точности + критерии успеха + настройки серии прогонов.

## 2.2. Дорожки бойцов

Для каждого исполнителя существует отдельная дорожка.

- Внутри одной дорожки действия выполняются последовательно.
- Дорожки разных бойцов выполняются параллельно.
- Основой является завершение физического действия, а не абсолютная временная шкала.
- Абсолютная задержка допускается только как отдельное действие или условие.

Пример:

```text
Стрелок №1
1. Одиночный выстрел по Цели №1
2. Двигаться к Позиции А
3. Лечь
4. Стрелять по Цели №2 до потери ею боеспособности

Цель №1
1. Ждать 0,5 секунды
2. Двигаться к Позиции Б
```

## 2.3. Не создавать второй редактор ИИ

Этот этап является режиссёром испытания, а не системой принятия решений.

Редактор сценария говорит:

> «Стрелок должен перейти в точку А, лечь и стрелять по цели».

Редактор ИИ говорит:

> «Если противник обнаружен и опасность высока, выбрать укрытие и открыть огонь».

Не добавлять в Stage 10:

- произвольный node graph;
- общий язык скриптов;
- пользовательский JavaScript;
- вложенные `if/else`;
- неограниченные циклы;
- импорт Graph v2;
- перенос сценария в обычную кампанию.

## 2.4. Один исполнитель для visual и headless

Визуальный и невизуальный режимы обязаны выполнять один сериализуемый объект эксперимента одним core-исполнителем.

Различается только продвижение времени и представление результата:

- visual использует существующий Pixi ticker и `CombatLabVisualSession`;
- headless вызывает тот же сценарный runtime вокруг канонического `tickSimulation`;
- UI, DOM и PixiJS не участвуют в принятии решений сценария.

## 2.5. Производственная симуляция остаётся источником истины

Редактор сценария не имеет права напрямую:

- создавать пулю;
- назначать попадание;
- создавать рану;
- менять подавление;
- телепортировать бойца;
- мгновенно завершать позу;
- напрямую менять боеспособность цели.

Все команды выполняются через существующий `executeCombatLabCommand` и производственные request/cancel-функции.

## 2.6. Скорость времени

Итоговый список визуальных скоростей:

```ts
[0.1, 0.25, 0.5, 1, 2, 4, 10]
```

Добавить `×0,1`.

Не возвращать устаревшую скорость `×8`.

`Один шаг` всегда продвигает ровно один `COMBAT_LAB_FIXED_STEP_SECONDS`, независимо от выбранной скорости.

## 2.7. Компактный интерфейс

Интерфейс обязан соответствовать существующему Combat Lab:

- та же типографика;
- те же компактные кнопки и поля;
- те же границы, цвета и раскрывающиеся секции;
- никакой отдельной полноэкранной IDE;
- никакого второго canvas;
- никакого горизонтального overflow страницы на `1440×900`.

Сохранить верхнеуровневые вкладки:

- `Стенд`;
- `Метрики`;
- `Журнал`.

Внутри `Стенд` добавить компактный сегмент:

- `Сцена`;
- `Программа`.

Внутри `Метрики` добавить:

- `Текущий прогон`;
- `Серия`.

Основная панель запуска:

```text
[Сбросить] [▶ Запустить] [Пауза] [Шаг] [■ Остановить] [×0,1 … ×10]
```

Редкие команды находятся в существующем `details` «Дополнительно».

---

# 3. Пользовательский интерфейс

## 3.1. Режимы карты

В панели `Программа` добавить заметный переключатель:

```text
[Редактор сценария] [Ручное управление]
```

### Редактор сценария

Правый клик не выполняет приказ немедленно. Он открывает контекстное меню и добавляет действие в выбранную дорожку.

### Ручное управление

Правый клик работает как существующая игра/Combat Lab и выполняет непосредственный приказ.

Требования:

- режим не должен быть двусмысленным;
- переключение режима не запускает симуляцию;
- обычная игра вне Combat Lab не изменяется;
- все listener-ы удаляются в `destroy()`.

## 3.2. Контекстное меню карты

### Правый клик по вражескому бойцу

Показывать доступные действия выбранного исполнителя:

- одиночный выстрел;
- короткая очередь;
- длинная очередь;
- подавляющий огонь;
- стрелять до условия;
- ждать обнаружения цели.

Недоступные режимы оружия должны быть видимы, но disabled с понятной причиной.

### Правый клик по своему бойцу

- оказать первую помощь;
- передать патроны;
- выбрать как помощника;
- ждать завершения его действия.

### Правый клик по местности

- двигаться сюда;
- создать точечную метку;
- создать круглую область;
- подавлять область;
- установить оружие здесь;
- повернуться к точке.

В первой версии разрешено реализовать только действия, поддерживаемые общим контрактом Stage 10. Не создавать UI-пункты без рабочего runtime.

## 3.3. Метки

Первая версия поддерживает:

- точечную метку;
- круглую область.

Метка имеет:

- стабильный `markerId`;
- русское название;
- координаты в метрах;
- радиус для области.

Действия ссылаются на `markerId`, а не копируют координаты.

При перемещении метки все связанные действия автоматически получают новое положение без изменения своих ID.

## 3.4. Роли

Действия ссылаются на стабильные роли, а не напрямую на временные DOM selections.

Примеры:

```text
shooter-1     → Стрелок №1
target-1      → Цель №1
machinegunner → Пулемётчик
assistant     → Помощник
patient       → Раненый
```

Роль содержит стабильный `roleId` и текущий `unitId`.

Пользователь может переназначить роль другому бойцу, не переписывая программу.

## 3.5. Карточки действий

Свёрнутая карточка показывает:

- номер;
- краткое русское название;
- цель/метку;
- состояние выполнения.

Раскрытая карточка показывает:

- исполнителя;
- параметры действия;
- условие начала;
- условие завершения;
- repeat-политику;
- timeout;
- failure policy;
- локальные accuracy overrides;
- breakpoint перед действием.

Поддержать:

- drag reorder внутри дорожки;
- keyboard reorder `Alt+↑` / `Alt+↓`;
- duplicate;
- delete;
- enable/disable;
- undo `Ctrl+Z`;
- redo `Ctrl+Y`;
- максимум 100 состояний истории.

Не добавлять внешнюю drag-and-drop библиотеку.

## 3.6. Состояния карточки при запуске

```text
pending
waiting
running
completed
failed
skipped
paused_at_breakpoint
```

Активная карточка подсвечивается. Завершённая остаётся компактной. Failed-карточка показывает `reasonRu`.

---

# 4. Поддерживаемые действия Stage 10

Обязательный минимум:

## Движение

- двигаться к точечной метке;
- остановиться через отмену принадлежащего сценарию движения, если существующий production path это поддерживает;
- завершение определяется фактическим прибытием/завершением production order.

## Поза

- стоя;
- пригнувшись;
- лёжа;
- завершение только после физического завершения transition.

## Огонь

- одиночный;
- короткая очередь;
- длинная очередь;
- подавляющий огонь по точке/области;
- остановить огневую задачу;
- повторять огневое действие до условия.

## Оружейные действия

- перезарядить;
- установить оружие;
- снять оружие;
- явный помощник.

## Боеприпасы

- передать заданное количество патронов.

## Медицина

- первая помощь с автоматическим приоритетом;
- первая помощь по указанной зоне.

## Управляющие действия

- ждать заданное время;
- ждать условия;
- завершить дорожку;
- остановить эксперимент с success/failure.

Не добавлять действие, которое нельзя доказать через observable production state/event.

---

# 5. Условия и повторы

## 5.1. Условия начала

Минимально поддержать:

- всегда;
- прошло N секунд с начала эксперимента;
- другой step started/completed/failed;
- у наблюдателя появился/исчез contact цели;
- роль боеспособна/небоеспособна;
- роль может/не может стрелять;
- роль может/не может двигаться;
- количество патронов пусто/не больше/не меньше значения;
- suppression не выше/не ниже значения.

## 5.2. Условия завершения

- production action complete;
- shot resolved попаданием или промахом;
- заданное condition стало true.

## 5.3. Повтор

Разрешить:

- один раз;
- повторять до условия.

Каждый repeat обязан иметь:

- `maximumAttempts` в диапазоне `1..1000`;
- `retryDelaySeconds`;
- общий step timeout.

Неограниченного repeat нет.

## 5.4. Failure policy

```text
stop_experiment
wait
skip_step
```

- `stop_experiment` немедленно завершает experiment как failed;
- `wait` повторно проверяет доступность, не создавая новую команду каждый tick;
- `skip_step` фиксирует reason и переходит дальше.

---

# 6. Контракт данных

Создать каталог:

```text
src/core/testing/combat-lab/experiment/
```

Рекомендуемое разделение:

```text
CombatLabExperimentContracts.ts
CombatLabExperimentValidation.ts
CombatLabExperimentSerialization.ts
CombatLabExperimentDigest.ts
CombatLabScenarioConditions.ts
CombatLabScenarioCompletion.ts
CombatLabScenarioExecutor.ts
CombatLabExperimentRunner.ts
CombatLabBatchContracts.ts
CombatLabBatchRunner.ts
CombatLabBatchStatistics.ts
CombatLabBuiltInExperiments.ts
index.ts
```

## 6.1. Главный объект

```ts
export interface CombatLabExperimentV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly revision: number;
  readonly titleRu: string;
  readonly descriptionRu: string;
  readonly baseScenarioId: CombatLabScenarioId | null;
  readonly sceneSnapshot: ExportedSceneData;
  readonly roles: readonly CombatLabExperimentRoleV1[];
  readonly markers: readonly CombatLabMarkerV1[];
  readonly tracks: readonly CombatLabTrackV1[];
  readonly defaults: CombatLabExperimentDefaultsV1;
  readonly successCondition: CombatLabConditionV1;
  readonly stopCondition: CombatLabExperimentStopConditionV1;
  readonly batchDefaults: CombatLabBatchConfigV1;
}
```

## 6.2. Limits

Обязательные пределы:

```text
tracks: <= 64
steps total: <= 512
markers: <= 256
undo states: <= 100
run count: 1..10000
worker count: 1..4
representative runs: 1..20
maximum simulation seconds: 0.1..600
maximum attempts per repeat: 1..1000
```

## 6.3. Валидация

Errors блокируют запуск:

- unsupported schema;
- duplicate IDs;
- missing role/marker/track/step reference;
- role unit отсутствует в scene snapshot;
- marker за пределами карты;
- invalid radius;
- dependency cycle;
- invalid timeout/repeat/batch limits;
- больше разрешённого количества сущностей.

Warnings не блокируют запуск:

- оружие отсутствует;
- fire mode не поддерживается;
- helper совпадает с actor;
- condition уже true в начальной сцене;
- статически недостижимое действие;
- слишком маленький боекомплект для ожидаемого повтора.

Пользовательский импорт не должен выбрасывать необработанное исключение. Он возвращает issues и не заменяет текущий эксперимент при errors.

## 6.4. Serialization и digest

- JSON с `schemaVersion: 1`;
- стабильные ID;
- deterministic serialization;
- digest исключает UI-only state;
- одинаковая семантика даёт одинаковый digest;
- изменение программы меняет digest.

---

# 7. Общий сценарный runtime

Создать `CombatLabScenarioExecutor`.

Пример публичного контракта:

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

Порядок одного fixed step:

1. выбрать первый незавершённый enabled-step каждой дорожки;
2. проверить start condition в стабильном порядке дорожек;
3. преобразовать action в существующий `CombatLabScriptCommandV1`;
4. вызвать `executeCombatLabCommand` максимум один раз для одной попытки;
5. вызвать канонический `tickSimulation` вне executor;
6. после tick проверить реальные production state/events;
7. завершить, повторить, ждать, пропустить или остановить step;
8. опубликовать immutable runtime snapshot.

Executor:

- не вызывает `tickSimulation` сам;
- не импортирует DOM/PixiJS;
- не использует wall-clock;
- не зависит от FPS;
- не читает renderer state;
- не создаёт gameplay facts напрямую;
- проверяет максимум первый незавершённый step каждой дорожки за fixed step.

## 7.1. Observable completion

Тесты и runtime должны ждать наблюдаемого факта:

- movement order завершён;
- posture transition завершён;
- fire task завершена;
- committed shot получил impact/termination;
- reload/deploy/transfer/first aid action завершено;
- condition реально стало true.

Запрещено считать действие завершённым только потому, что прошло произвольное фиксированное время.

---

# 8. Visual runtime

Visual execution интегрируется в существующий `CombatLabVisualSession`.

Требования:

- сохраняется один объект `SimulationState`;
- reset восстанавливает `sceneSnapshot` через существующий scene export/import path;
- сохраняется один Pixi ticker;
- `beforeSimulationStep` вызывается перед текущим `tickSimulation`;
- `afterSimulationStep` вызывается после него;
- пауза не продвигает runtime;
- step продвигает один fixed step;
- stop отменяет только действия, принадлежащие текущему experiment owner;
- ручные команды остаются доступны в режиме `Ручное управление`;
- смена experiment revision сбрасывает stale runtime, overlay и checkpoint bookkeeping.

Breakpoint:

- пауза наступает до выдачи команды step;
- step получает `paused_at_breakpoint`;
- продолжение выдаёт команду ровно один раз.

---

# 9. Массовые headless-прогоны

## 9.1. Single run

Создать browser-free:

```ts
runCombatLabExperiment(request): CombatLabExperimentRunResultV1
```

Цикл:

```text
executor.beforeSimulationStep()
tickSimulation(fixedStep)
executor.afterSimulationStep()
```

Результат содержит:

- experiment ID/revision/digest;
- seed;
- success;
- stop reason;
- simulated seconds;
- metrics;
- event digest;
- final state digest;
- step failure code.

Visual и headless count=1 при одинаковой сцене, программе, Seed и количестве fixed steps обязаны совпадать по gameplay result.

## 9.2. Batch

Пользователь задаёт:

- число прогонов `1..10000`;
- fixed/sequential/explicit Seed strategy;
- maximum simulation seconds;
- worker count `1..4`;
- список собираемых метрик;
- success condition из experiment.

Исполнение:

- Web Worker;
- chunks не больше 25 прогонов;
- bounded worker count;
- progress не чаще 10 раз/с;
- cancel прекращает назначение новых chunks;
- stale result rejection по `batchRunId + experimentRevision + sourceDigest`;
- UI не получает полный `SimulationState` каждого прогона;
- worker teardown обязателен.

## 9.3. Aggregates

Для числовых метрик:

- count;
- minimum;
- maximum;
- mean;
- median;
- p05;
- p95.

Общая сводка:

- run count;
- success count;
- failure count;
- success rate;
- failure reasons;
- average time;
- average ammo consumption;
- average hits/misses.

## 9.4. Representative runs

Сохранять максимум 20 характерных прогонов:

- fastest success;
- slowest success;
- highest ammo use;
- lowest ammo use;
- first failure каждого доминирующего failure reason.

Tie-break детерминированный: меньший `runIndex`.

Каждый representative содержит Seed и кнопку:

```text
Повторить визуально
```

Кнопка восстанавливает experiment, устанавливает точный Seed, но не начинает Play автоматически.

---

# 10. Встроенные стенды

Текущие восемь Combat Lab scenarios не удалять:

- `rifle-distance-baseline`;
- `rifle-moving-target`;
- `ppsh-burst-recoil`;
- `dp27-portable-deployed`;
- `dp27-assistant-ammo`;
- `wounds-first-aid`;
- `suppression-events`;
- `combat-save-load-boundaries`.

Они становятся встроенными experiment templates.

Для каждого:

- scene создаётся текущей factory;
- roles сохраняются;
- current `defaultProgram` конвертируется в дорожки;
- пользователь открывает template read-only;
- изменение требует `Создать копию`;
- старый `Рекомендуемый запуск` исчезает как отдельная вторая система;
- существующий headless runner сохраняется до завершения совместимого перехода.

---

# 11. Разделение работы между четырьмя исполнителями

Оркестратор владеет общей веткой:

```text
feature/20260729-combat-lab-scenario-system
```

Исполнители работают в изолированных worktree или эквивалентных локальных ветках от одного base SHA. Не создавать ранний PR. Удалённо публикуется только итоговая feature-ветка.

## Исполнитель 1 — contracts, validation, executor, built-ins

Владение:

```text
src/core/testing/combat-lab/experiment/**
scripts/combat_lab_experiment_*
scripts/combat_lab_scenario_executor_*
scripts/combat_lab_built_in_experiments_*
```

Задачи:

1. контракты;
2. limits;
3. validation;
4. serialization/digest;
5. conditions/completion;
6. общий executor;
7. built-in templates;
8. core smoke-тесты.

Первым отдельным коммитом зафиксировать контракты, чтобы остальные исполнители работали против стабильных типов.

## Исполнитель 2 — compact editor UI и authoring на карте

Владение:

```text
src/combat-lab/scenario-editor/**
src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts
scripts/combat_lab_scenario_editor_*
scripts/combat_lab_map_authoring_*
```

Задачи:

1. immutable draft;
2. undo/redo;
3. tracks/cards/inspector;
4. roles;
5. capture initial scene;
6. import/export/localStorage;
7. map mode switch;
8. context menu;
9. point/circle markers;
10. authoring overlay.

Не менять общие wiring-файлы напрямую без согласования с оркестратором.

## Исполнитель 3 — visual controller, runtime UI, speed ×0.1

Владение:

```text
src/combat-lab/runtime/CombatLabExperimentVisualController.ts
src/combat-lab/runtime/CombatLabExperimentRunState.ts
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
src/combat-lab/ui/CombatLabExperimentRunToolbar.ts
src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts
scripts/combat_lab_experiment_visual_*
scripts/combat_lab_visual_speed_*
scripts/combat_lab_representative_replay_*
```

Согласованное изменение:

```text
src/combat-lab/runtime/CombatLabVisualSession.ts
```

Задачи:

1. reset/start/pause/stop/step;
2. visual hooks вокруг одного tick;
3. speed `×0,1`;
4. breakpoint;
5. step status;
6. journal step events;
7. representative replay.

## Исполнитель 4 — headless runner, batch worker, statistics, result UI

Владение:

```text
src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts
src/core/testing/combat-lab/experiment/CombatLabBatch*.ts
src/combat-lab/workers/combat-lab-batch.worker.ts
src/combat-lab/runtime/CombatLabBatchClient.ts
src/combat-lab/ui/CombatLabBatchPanel.ts
src/combat-lab/ui/CombatLabBatchResultsView.ts
src/combat-lab/ui/CombatLabMetricDistributionView.ts
scripts/combat_lab_batch_*
scripts/combat_lab_experiment_runner_*
```

Задачи:

1. single headless experiment;
2. batch contracts;
3. deterministic seed assignment;
4. statistics;
5. representative selection;
6. Web Worker;
7. progress/cancel/stale rejection;
8. compact result UI;
9. CSS/SVG histogram без внешней библиотеки.

## Общие файлы — только оркестратор

```text
src/combat-lab/CombatLabExtension.ts
src/combat-lab/ui/CombatLabShell.ts
src/combat-lab/rendering/CombatLabRenderer.ts
src/combat-lab/main.ts
src/combat-lab/combat-lab.css
src/combat-lab/combat-lab-workspace.css
package.json
docs/ai/**
docs/subprojects/infantry-combat-prototype-v1/subproject.json
```

Исполнитель передаёт точный patch suggestion, если ему требуется изменение общего файла.

---

# 12. Волны реализации

## Волна 1 — contract gate

Исполнитель 1:

1. создаёт contracts;
2. создаёт validation skeleton;
3. экспортирует типы;
4. запускает typecheck и contract smoke;
5. отдаёт один стабильный contract commit.

Оркестратор переносит этот commit в общую feature-ветку.

До этого исполнители 2–4 могут только изучать код и готовить локальные тесты, но не фиксировать несовместимые публичные типы.

## Волна 2 — параллельная реализация

- Исполнитель 1: executor и built-ins.
- Исполнитель 2: editor и map authoring.
- Исполнитель 3: visual runtime.
- Исполнитель 4: headless/batch/results.

## Волна 3 — интеграция

Оркестратор:

1. объединяет коммиты в фиксированном порядке;
2. связывает UI и runtime;
3. заменяет old recommended program UI;
4. добавляет package scripts;
5. мигрирует built-ins;
6. обновляет docs;
7. запускает focused matrix;
8. исправляет только интеграционные дефекты.

Порядок merge:

1. core contracts;
2. validation/serialization;
3. executor/built-ins;
4. editor state/UI;
5. map authoring;
6. visual controller/speed;
7. run UI/replay;
8. headless/batch core;
9. worker/results UI;
10. orchestrator wiring/docs.

---

# 13. Производительность

Обязательные инварианты:

- core не импортирует DOM/PixiJS;
- UI не владеет gameplay computation;
- authoring overlay не сканирует карту;
- runtime проверяет максимум один текущий step на дорожку за fixed step;
- максимум 64 дорожки;
- batch не выполняется на main thread;
- worker queue bounded;
- chunks <= 25;
- workers <= 4;
- progress <= 10 Hz;
- result UI не рендерит 10 000 строк прогонов;
- full run states не сохраняются;
- stale results не применяются;
- listeners/tickers/workers уничтожаются симметрично;
- обычная игра не импортирует scenario editor entrypoint.

Не принимать функционально правильную реализацию, если она оставляет main-thread stall, lifecycle leak или unbounded queue.

---

# 14. Обязательные проверки

Добавить focused scripts:

```text
combat-lab-experiment:smoke
combat-lab-scenario-editor:smoke
combat-lab-batch:smoke
combat-lab-scenario-system:verify
```

Минимальная финальная матрица:

```bash
npx tsc --noEmit
npm run combat-lab-experiment:smoke
npm run combat-lab-scenario-editor:smoke
npm run combat-lab-batch:smoke
npm run combat-lab-scenario-system:verify
npm run combat-lab:smoke
npm run combat-lab-scenarios:smoke
npm run combat-lab-runner:smoke
npm run infantry-combat-stage9:verify
npm run build
```

При изменении документации:

```bash
npm run docs:sync
npm run docs:check
```

Не изменять `.github/workflows/`.

PR Risk CI запускается один раз только после готовности кандидата. Разрешён один rerun после агрегированной коррекции согласно правилам репозитория.

---

# 15. Обязательный сценарий приёмки

Пользователь вручную создаёт:

```text
Стрелок
1. Выстрелить по Цели 1
2. Двигаться к Метке А
3. Лечь
4. Стрелять по Цели 2 до потери ею боеспособности

Цель 1
1. Ждать 0,5 секунды
2. Двигаться к Метке Б
```

Pass:

- роли назначаются существующим бойцам;
- метки создаются на карте;
- команды добавляются через right-click menu;
- карточки компактны;
- дорожки выполняются параллельно;
- movement ждёт реального прибытия;
- prone ждёт реального transition completion;
- fire repeat создаёт отдельные production fire tasks;
- цель проверяется через реальную capability state;
- visual и headless count=1 совпадают;
- batch count=100 не блокирует UI;
- slowest representative открывается visual с точным Seed;
- speed `×0,1` работает;
- reset полностью восстанавливает initial scene.

---

# 16. Determinism acceptance

Для одного experiment:

1. headless count=1, Seed 9041 два раза;
2. сравнить metrics, event digest, final state digest;
3. visual Seed 9041 до завершения;
4. сравнить gameplay result с headless;
5. batch с worker count 1;
6. batch с worker count 4;
7. сравнить aggregates и representative seeds.

Результаты должны совпасть. UI timestamps в digest не входят.

---

# 17. Visual acceptance

Визуальная проверка выполняется только после отдельного разрешения пользователя на браузер/Chromium/Playwright.

Проверить на `1440×900`:

- один canvas;
- нет page errors;
- нет horizontal overflow;
- левая панель и правый inspector независимо сворачиваются;
- Scene/Program compact switch;
- Current/Batch metrics switch;
- context menu остаётся в viewport;
- drag и keyboard reorder;
- undo/redo;
- marker create/move/delete;
- visual start/pause/step/stop/reset;
- speed ×0,1;
- breakpoint;
- active step highlight;
- batch progress/cancel;
- representative replay;
- normal game input не изменён.

Не считать static source inspection визуальной проверкой.

---

# 18. Явно вне этапа

Не реализовывать:

- A/B comparison;
- parameter sweep;
- automatic parameter optimizer;
- server storage;
- collaborative editing;
- arbitrary branching;
- script language;
- AI Graph integration;
- campaign scenario export;
- новые оружейные механики;
- новый баланс оружия;
- изменения в `main`;
- deployment.

Архитектура должна позволить позднее добавить A/B и sweep поверх batch runner, но Stage 10 их не реализует.

---

# 19. Стоп-условия

Остановиться и вернуть `BLOCKED`, если:

- base SHA не совпадает;
- текущие production-команды не позволяют доказать completion обязательного действия без прямой мутации gameplay state;
- требуется менять `.github/workflows/`;
- visual/headless parity требует второй simulation pipeline;
- batch невозможно вынести из main thread без изменения запрещённых границ;
- возникает необходимость ослабить существующие Stage 8/9/Combat Lab проверки.

Остановиться и вернуть `FAIL`, если:

- новый focused test воспроизводимо падает из-за текущей реализации;
- production build не проходит;
- visual/headless determinism не достигнут;
- ordinary game behavior изменился;
- UI имеет overflow/overlap и визуальная проверка была разрешена и выполнена.

Вернуть `READY FOR VERIFICATION`, только когда весь код готов, focused matrix зелёная и кандидат зафиксирован точным SHA.

---

# 20. Git и доставка

- Работать только в `feature/20260729-combat-lab-scenario-system`.
- Не создавать ранний PR.
- Не переносить в `real-wargame-preview`.
- Не трогать `main`.
- Не деплоить.
- Не создавать dummy commit.
- Не force-push после начала shared review.
- Перед readiness просмотреть полный base-to-head diff.
- Кандидат должен быть собран в 1–3 осмысленных итоговых коммита, если ветка ещё не опубликована для shared review.

Финальный отчёт:

```text
status: READY FOR VERIFICATION | BLOCKED | FAIL
feature_branch: feature/20260729-combat-lab-scenario-system
base_sha: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
current_commit:
executor_1_commits:
executor_2_commits:
executor_3_commits:
executor_4_commits:
checks_run:
performance_impact:
deployment_requested: false
deployment_status: not_started
live_test_status: not_started
visual_qa_status:
preview_touched: false
main_touched: false
```

После `READY FOR VERIFICATION` остановиться. Не создавать deployment и не переносить результат без следующей явной команды пользователя.
