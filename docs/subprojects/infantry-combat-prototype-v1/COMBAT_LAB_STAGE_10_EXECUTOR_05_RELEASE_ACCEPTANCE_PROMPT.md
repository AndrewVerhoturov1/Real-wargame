# Stage 10 — Исполнитель 5: финальная интеграция, Preview-деплой и приёмочные исправления

## Роль

Ты — финальный Исполнитель 5 координированной реализации Stage 10 для `Combat Lab`.

Исполнители 1–4 уже создали и передали:

- experiment contracts, validation, serialization и digest;
- общий `CombatLabScenarioExecutor`;
- browser-free `SceneSnapshot` build/restore boundary;
- built-in experiments;
- immutable editor draft, Scene/Program UI и map authoring;
- visual controller, visual runtime snapshot, toolbar, status и representative replay;
- browser-free headless runner, deterministic batch, Web Worker client и compact result UI.

Твоя задача — не создать пятую параллельную подсистему. Ты должен:

1. связать уже принятые части через один composition root;
2. устранить только реальные интеграционные дефекты;
3. выполнить полную репозиторную verification matrix;
4. создать Vercel Preview точного проверенного SHA;
5. остаться владельцем той же worker-ветки и того же чата для исправления замечаний пользователя;
6. после каждого принятого пакета замечаний создать новый проверенный SHA и новый Preview;
7. остановиться после явного одобрения пользователя со статусом `READY FOR ORCHESTRATOR INTEGRATION`.

Ты не переносишь результат в `real-wargame-preview` и не изменяешь `main`.

---

## Репозиторий и обязательный gate

```text
repository: AndrewVerhoturov1/Real-wargame
orchestrator branch: feature/20260729-combat-lab-scenario-system
required preview ancestor: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
required fully-integrated Stage 10 executor ancestor: e97fb36102d2ef0e548215392887ade52dc23eb0
worker branch: worker/20260729-combat-lab-stage10-release-acceptance
```

Точный `release_start_sha` передаёт оркестратор вместе с этим prompt. Он должен быть фактическим remote HEAD orchestration branch и потомком `e97fb36102d2ef0e548215392887ade52dc23eb0`.

Перед изменениями:

1. получить фактический remote HEAD `feature/20260729-combat-lab-scenario-system`;
2. сравнить его с переданным `release_start_sha`;
3. проверить, что `e97fb36102d2ef0e548215392887ade52dc23eb0` является предком;
4. проверить, что orchestration branch не содержит незаявленных коммитов после `release_start_sha`;
5. создать отдельную worker-ветку/worktree точно от `release_start_sha`;
6. записать точные SHA всех четырёх executor-результатов в рабочий отчёт.

Если remote HEAD не равен переданному `release_start_sha`:

1. не начинать изменения;
2. вернуть `BLOCKED: RELEASE BASE MOVED`;
3. указать новый HEAD и base-to-head diff;
4. не rebase и не force-push без новой команды оркестратора.

Если отсутствует любая из принятых Stage 10 частей, вернуть `BLOCKED: INTEGRATED COMPONENT MISSING`.

---

## Разрешение на Preview-деплой

Пользователь явно разрешил этому исполнителю создавать и обновлять **Vercel Preview** текущей worker-ветки после полного verification gate.

Это разрешение:

- не разрешает перенос в `real-wargame-preview`;
- не разрешает изменение или deployment `main`;
- не разрешает Git-triggered deployment на каждый push;
- не разрешает использовать Vercel как удалённый TypeScript/test runner;
- не разрешает создавать дополнительные Vercel projects;
- не разрешает печатать или коммитить secrets;
- не заменяет отдельное разрешение на Chromium/Playwright visual QA.

Один нормальный deployment создаётся только для одного полного проверенного SHA.

---

## Обязательное чтение

Полностью прочитать перед реализацией:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `docs/subprojects/index.json`;
- `docs/subprojects/infantry-combat-prototype-v1/STATUS.md`;
- `docs/ai/SKILLS_INDEX.md`;
- `docs/performance/PERFORMANCE_PRINCIPLES.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-pixijs/SKILL.md`;
- `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`;
- `docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md`;
- `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md`;
- `docs/subprojects/infantry-combat-prototype-v1/COMBAT_LAB_STAGE_10_SCENARIO_EDITOR_AND_BATCH_PROMPT.md`;
- `COMBAT_LAB_STAGE_10_EXECUTOR_01_CORE_PROMPT.md`;
- `COMBAT_LAB_STAGE_10_EXECUTOR_02_EDITOR_PROMPT.md`;
- `COMBAT_LAB_STAGE_10_EXECUTOR_03_VISUAL_PROMPT.md`;
- `COMBAT_LAB_STAGE_10_EXECUTOR_04_BATCH_PROMPT.md`;
- все фактически интегрированные Stage 10 файлы.

Перед wiring отдельно изучить актуальные public interfaces:

```text
src/core/testing/combat-lab/experiment/**
src/combat-lab/scenario-editor/**
src/combat-lab/runtime/CombatLabExperimentVisualController.ts
src/combat-lab/runtime/CombatLabExperimentRunState.ts
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
src/combat-lab/runtime/CombatLabBatchClient.ts
src/combat-lab/ui/CombatLabExperimentRunToolbar.ts
src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts
src/combat-lab/ui/CombatLabBatchPanel.ts
src/combat-lab/ui/CombatLabBatchResultsView.ts
src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts
```

---

# 1. Зафиксированная архитектура интеграции

## 1.1. Владение

Итоговая система должна иметь ровно:

```text
1 CombatLabVisualSession
1 CombatLabExperimentDraft
1 CombatLabExperimentVisualController
1 CombatLabBatchClient
1 CombatLabMapAuthoringController
1 CombatLabScenarioAuthoringOverlayRenderer
1 CombatLabScenePanel
1 CombatLabScenarioEditorPanel
1 CombatLabExperimentRunToolbar
1 CombatLabScenarioRuntimeStatus
1 CombatLabBatchPanel
1 CombatLabBatchResultsView
```

Не создавать:

- второй `CombatLabVisualSession`;
- второй ticker;
- второй `CombatLabScenarioExecutor` для visual;
- второй headless pipeline;
- второй canvas;
- отдельный UI-owned simulation loop;
- параллельный legacy recommended-program runtime;
- параллельный старый headless button, конкурирующий с Batch UI.

## 1.2. Composition root

`CombatLabExtension` является composition root и владеет долгоживущими controller/client объектами.

Рекомендуемое разделение:

- `CombatLabExtension` — lifecycle, wiring, experiment state flow, tab activation;
- `CombatLabShell` — явные DOM hosts и compact layout, без gameplay computation;
- `CombatLabRenderer` — Pixi diagnostic overlay и authoring overlay, без DOM/editor state ownership;
- core experiment modules — validation/execution/headless/statistics;
- editor UI — immutable draft mutations;
- visual controller — единственный visual executor owner;
- batch client — worker lifecycle.

Не оставлять интеграцию через хрупкие positional DOM assumptions вроде зависимости от `toolbar.children[11]`. Общие hosts и callbacks должны иметь явные имена.

## 1.3. Единственный experiment state

`CombatLabExperimentDraft` — единственный mutable-at-the-boundary источник текущего сериализуемого `CombatLabExperimentV1`.

Все потребители читают:

```ts
draft.getExperiment()
```

Изменение эксперимента проходит через один central integration callback, который:

1. получает новый immutable experiment;
2. пересчитывает validation issues;
3. обновляет Scene/Program UI;
4. обновляет authoring overlay;
5. отменяет или делает stale текущий batch;
6. запрещает смешивание runtime snapshot старой revision с новым experiment;
7. не изменяет production state напрямую.

Не хранить отдельные копии experiment в Shell, toolbar, batch panel или renderer.

---

# 2. Разрешённая область изменений

## 2.1. Основные orchestrator-owned файлы

Разрешено изменять:

```text
src/combat-lab/CombatLabExtension.ts
src/combat-lab/ui/CombatLabShell.ts
src/combat-lab/rendering/CombatLabRenderer.ts
src/combat-lab/main.ts
src/combat-lab/combat-lab.css
src/combat-lab/combat-lab-workspace.css
src/combat-lab/combat-lab-ui-polish.css
src/combat-lab/combat-lab-header-final.css
package.json
scripts/combat_lab_stage10_*
scripts/combat_lab_scenario_system_*
docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9V_COMBAT_LAB.md
docs/subprojects/infantry-combat-prototype-v1/STATUS.md
docs/subprojects/infantry-combat-prototype-v1/subproject.json
```

## 2.2. Точечные интеграционные изменения

Разрешены только при доказанной необходимости и с focused regression test:

```text
src/core/testing/combat-lab/experiment/index.ts
src/core/testing/combat-lab/index.ts
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts
src/combat-lab/scenario-editor/index.ts
src/combat-lab/ui/CombatLabExperimentRunToolbar.ts
src/combat-lab/ui/CombatLabBatchPanel.ts
src/combat-lab/ui/CombatLabBatchResultsView.ts
```

Примеры допустимых причин:

- добавить missing public export;
- заменить temporary structural DTO прямым импортом итогового batch DTO;
- добавить необязательный selection callback для authoring overlay;
- устранить lifecycle leak;
- исправить несовместимость wiring, доказанную TypeScript или focused test.

## 2.3. Не переписывать без отдельного blocker report

Не переделывать заново:

```text
CombatLabScenarioExecutor
CombatLabExperimentRunner
CombatLabBatchRunner
CombatLabBatchStatistics
SceneSnapshot
CombatLabExperimentDraft
CombatLabMapAuthoringController
CombatLabExperimentVisualController
CombatLabVisualSession
```

Если финальная интеграция требует архитектурного изменения одного из этих владельцев, сначала вернуть `BLOCKED` с точным минимальным patch proposal. Не создавать обходной второй runtime.

Не изменять:

```text
.github/workflows/**
real-wargame-preview
main
```

---

# 3. TDD и порядок коммитов

До functional wiring создать focused failing contracts минимум для:

1. единственного composition root;
2. отсутствия legacy competing controls;
3. runtime snapshot flow в editor/toolbar/status;
4. batch result → representative replay;
5. map authoring mode switching;
6. authoring overlay lifecycle;
7. symmetric destroy;
8. public batch exports;
9. aggregate package scripts.

Рекомендуемые новые scripts:

```text
scripts/combat_lab_stage10_wiring_contract_smoke.mjs
scripts/combat_lab_stage10_lifecycle_contract_smoke.mjs
scripts/combat_lab_stage10_ui_integration_contract_smoke.mjs
scripts/combat_lab_stage10_representative_integration_smoke.mjs
scripts/combat_lab_scenario_system_verify.mjs
```

Для каждого integration task:

```text
RED focused test
minimal implementation
focused PASS
relevant existing smokes PASS
commit
```

Начальный кандидат собрать в 1–3 осмысленных integration-коммита. Пользовательские исправления после первого Preview делать отдельными correction-коммитами; не переписывать уже опубликованные SHA.

---

# 4. Public exports и DTO reconciliation

## 4.1. Batch exports

Добавить в:

```text
src/core/testing/combat-lab/experiment/index.ts
```

экспорты:

```ts
export * from './CombatLabExperimentRunner';
export * from './CombatLabBatchContracts';
export * from './CombatLabBatchStatistics';
export * from './CombatLabRepresentativeRuns';
export * from './CombatLabBatchRunner';
```

`src/core/testing/combat-lab/index.ts` уже экспортирует `./experiment`; не добавлять дублирующий второй public path без необходимости.

## 4.2. Representative DTO

Удалить temporary visual-side declaration `CombatLabRepresentativeRunV1` из:

```text
src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts
```

и импортировать итоговый тип из:

```text
../../core/testing/combat-lab/experiment/CombatLabBatchContracts
```

Не менять поведение replay:

```text
controller.stop()
controller.reset(representative.seed)
controller.setRepresentativeContext(...)
```

Replay не должен автоматически вызывать `start()`.

Добавить compile/focused contract, доказывающий прямую DTO совместимость.

---

# 5. Initial experiment и file codec

## 5.1. Initial experiment

При запуске Combat Lab создать initial experiment через принятый built-in API:

```ts
buildCombatLabBuiltInExperiment(session.definition.scenarioId, session.seed)
```

Создать один:

```ts
new CombatLabExperimentDraft(initialExperiment)
```

Существующий каталог стендов сохранить как выбор built-in template. При выборе другого template:

1. построить новый built-in experiment;
2. заменить draft через один central flow;
3. обновить Scene/Program views;
4. обновить overlay;
5. reset visual controller к новому experiment;
6. отменить активный batch;
7. не создавать новую session.

## 5.2. File codec

Передать `CombatLabScenePanel` реальный `CombatLabExperimentFileCodecV1`:

```ts
{
  serialize: serializeCombatLabExperiment,
  parse: parseCombatLabExperiment,
}
```

Импорт с validation errors не заменяет текущий draft.

Экспорт использует deterministic 2-space JSON serializer.

Local storage хранит только сериализуемый experiment, без runtime snapshots, editor history и UI state.

---

# 6. Shell и compact layout

## 6.1. Верхнеуровневые вкладки

Сохранить:

```text
Стенд
Метрики
Журнал
```

## 6.2. Внутри «Стенд»

Добавить компактный switch:

```text
Сцена
Программа
```

`Сцена` содержит:

- built-in template selector;
- metadata и initial scene capture;
- role assignment;
- import/export/local storage;
- существующие manual diagnostic/action controls в компактном блоке;
- map mode indicator.

`Программа` содержит:

- `CombatLabScenarioEditorPanel`;
- track cards;
- inspector;
- undo/redo;
- map authoring controls.

Общий visual toolbar и runtime status должны быть видимы без создания второго toolbar/runtime.

## 6.3. Внутри «Метрики»

Добавить compact switch:

```text
Текущий прогон
Серия прогонов
```

`Текущий прогон` сохраняет текущие production diagnostics/metric cards.

`Серия прогонов` содержит:

- `CombatLabBatchPanel`;
- `CombatLabBatchResultsView`;
- distributions;
- representative replay buttons.

## 6.4. Legacy controls

Удалить или заменить конкурирующие controls:

```text
Новый visual run
Чистый headless run
Рекомендуемый запуск
```

Не оставлять одновременно old visual controls и `CombatLabExperimentRunToolbar`.

Не удалять manual gameplay actions. Они должны оставаться доступны в режиме `Ручное управление`, но не владеть experiment runtime.

Кнопка `Серия` в visual toolbar должна активировать:

```text
Метрики → Серия прогонов
```

## 6.5. Явные hosts

Расширить Shell/layout явными именованными hosts или отдельным mount contract. Не полагаться на порядковые позиции child nodes.

Shell не должен импортировать `tickSimulation`, `executeCombatLabCommand` для experiment runtime или создавать workers.

---

# 7. Visual controller wiring

Создать ровно один:

```ts
CombatLabExperimentVisualController.create({
  session,
  getExperiment: () => draft.getExperiment(),
  onRuntimeChanged,
})
```

`onRuntimeChanged(snapshot)` обязан обновлять:

1. `CombatLabExperimentRunToolbar.refresh(snapshot)`;
2. `CombatLabScenarioRuntimeStatus.refresh(snapshot)`;
3. `CombatLabScenarioEditorPanel.setRuntimeSnapshot(snapshot)`;
4. active-step/selection presentation;
5. renderer/overlay через существующий render path;
6. общий compact status без второго runtime snapshot owner.

Создать `CombatLabExperimentRunToolbar` с:

```text
controller
getValidationIssues
onRequestBatch
```

Validation errors блокируют visual start и batch start.

`reset/start/pause/stop/step` проходят только через visual controller.

Один шаг всегда выполняет ровно один `COMBAT_LAB_FIXED_STEP_SECONDS` независимо от выбранной скорости.

Итоговый список скоростей:

```text
×0,1
×0,25
×0,5
×1
×2
×4
×10
```

Не возвращать `×8`.

## 7.1. Structural editing lock

Во время активного visual run структурные изменения experiment запрещены.

Минимум блокировать mutation UI и map authoring при runtime statuses, в которых execution уже начался и не был reset:

```text
running
paused
```

`completed`, `failed` и `stopped` не должны молча смешиваться с новой revision; перед новым editing/run должен существовать понятный reset/replace flow.

Не мутировать draft из runtime callback.

---

# 8. Scene/Program wiring

Создать один `CombatLabScenePanel` и один `CombatLabScenarioEditorPanel`, передав им один draft.

Central experiment change flow должен обновлять обе панели без создания двух history owners.

`CombatLabScenarioEditorPanel.acceptExternalExperiment()` использовать для import/template/load flows, когда требуется синхронизировать history и selection.

`onSelectRole(roleId)` должен выбирать соответствующего production unit через существующий selection API, если роль существует.

`getSelectedUnitId()` для Scene role editor читает production selection, а не отдельную копию.

Validation issues получать через общий:

```ts
validateCombatLabExperiment(draft.getExperiment())
```

Не создавать второй валидатор в UI.

---

# 9. Map authoring и Pixi overlay

Создать один `CombatLabMapAuthoringController` с существующим `GameApplicationContext`, production state и общим draft.

Map mode:

```text
scenario_editor
manual_control
```

В `scenario_editor`:

- right-click открывает authoring menu;
- point/circle markers и actions изменяют draft;
- normal immediate command не выполняется.

В `manual_control`:

- authoring menu и pending pick закрыты;
- normal game right-click проходит существующим production path;
- не создавать собственный manual command dispatcher.

`onMapModeChanged` обязан вызывать `CombatLabMapAuthoringController.syncMode()`.

## 9.1. Overlay ownership

`CombatLabRenderer` должен владеть `CombatLabScenarioAuthoringOverlayRenderer` рядом с diagnostic overlay либо предоставить равноценный единый lifecycle owner.

Overlay подключается к существующему:

```ts
context.getWorldContainer()
```

Не создавать второй Pixi app/container root/canvas/ticker.

Обеспечить методы уровня renderer для:

```text
set authored experiment
set selected editor step
clear authoring overlay
force render
destroy
```

Если текущему `CombatLabScenarioEditorPanel` не хватает selection callback, допускается добавить необязательный `onSelectionChanged` в options с focused regression test. Не вводить polling по frame и не сканировать карту.

---

# 10. Batch wiring

Создать один `CombatLabBatchClient` на весь lifecycle extension.

Создать один `CombatLabBatchPanel`:

```ts
{
  host,
  client,
  getExperiment: () => draft.getExperiment(),
  getValidationIssues,
  onResult,
}
```

`onResult(result)`:

1. сохраняет только последний bounded aggregate result;
2. передаёт его в `CombatLabBatchResultsView.render(result)`;
3. не хранит full states и 10 000 rows;
4. не изменяет draft;
5. не применяет stale result.

`CombatLabBatchResultsView` получает:

```ts
onReplayRepresentative: (representative) => {
  replayCombatLabRepresentativeRun(visualController, representative);
}
```

После representative replay:

- активировать вкладку `Стенд`;
- показать runtime toolbar/status;
- отображать точный Seed и representative context;
- не запускать Play автоматически.

При изменении experiment revision/digest активную batch-серию отменить или гарантированно оставить stale; поздний result не применяется.

`destroy()` extension обязан вызвать:

```ts
batchClient.destroy()
```

---

# 11. Lifecycle и cleanup

Добавить явный symmetric lifecycle для всех созданных объектов.

Минимальный порядок destroy:

1. запретить новые callbacks через destroyed flag;
2. destroy batch panel/results views;
3. destroy run toolbar/runtime status;
4. destroy Scene/Program panels;
5. destroy map authoring controller;
6. destroy visual controller и снять step hooks;
7. destroy batch client/workers/timers;
8. destroy Shell-owned observers/listeners;
9. destroy renderer overlays/ticker listener;
10. restore shared simulation controls;
11. очистить root/body classes.

Проверить и устранить integration lifecycle leaks, включая:

- `MutationObserver` без `disconnect()`;
- anonymous listeners, которые продолжают ссылаться на destroyed views;
- pending map pick/context menu;
- worker progress timers;
- authoring overlay labels/containers;
- stale runtime callbacks после destroy.

Повторный destroy должен быть безопасен.

---

# 12. CSS и responsive layout

Импортировать ровно один раз:

```text
src/combat-lab/ui/combat-lab-experiment-run.css
src/combat-lab/ui/combat-lab-batch-results.css
```

Scenario editor уже импортирует свой локальный CSS; не создавать дублирующий import graph без необходимости.

Итог на `1440×900`:

- один canvas;
- нет horizontal page overflow;
- top-level tabs помещаются;
- Scene/Program и Current/Batch switches помещаются;
- toolbar не создаёт горизонтальный scroll;
- track cards остаются компактными;
- context menu остаётся внутри viewport;
- left/right panels не перекрывают карту;
- batch results не рендерят 10 000 строк;
- long Russian labels переносятся, а не расширяют страницу.

Не менять общий визуальный язык Combat Lab на отдельную IDE.

---

# 13. Package scripts

Добавить агрегаты:

```json
{
  "combat-lab-experiment:smoke": "...",
  "combat-lab-scenario-editor:smoke": "...",
  "combat-lab-batch:smoke": "...",
  "combat-lab-scenario-system:verify": "..."
}
```

## 13.1. `combat-lab-experiment:smoke`

Должен фактически запускать принятые core и visual scripts:

```text
combat_lab_experiment_contract_smoke.mjs
combat_lab_experiment_validation_smoke.mjs
combat_lab_experiment_serialization_smoke.mjs
combat_lab_scenario_executor_smoke.mjs
combat_lab_built_in_experiments_smoke.mjs
combat_lab_core_scene_snapshot_smoke.mjs
combat_lab_experiment_visual_controller_smoke.mjs
combat_lab_visual_speed_regression_smoke.mjs
combat_lab_experiment_visual_breakpoint_smoke.mjs
combat_lab_experiment_run_ui_contract_smoke.mjs
combat_lab_representative_replay_smoke.mjs
```

## 13.2. `combat-lab-scenario-editor:smoke`

Должен запускать:

```text
combat_lab_scenario_editor_state_smoke.mjs
combat_lab_scenario_editor_ui_contract_smoke.mjs
combat_lab_scene_authoring_ui_contract_smoke.mjs
combat_lab_map_authoring_contract_smoke.mjs
combat_lab_map_authoring_regression_smoke.mjs
```

## 13.3. `combat-lab-batch:smoke`

Должен запускать:

```text
combat_lab_experiment_runner_smoke.mjs
combat_lab_batch_statistics_smoke.mjs
combat_lab_batch_runner_smoke.mjs
combat_lab_batch_worker_contract_smoke.mjs
combat_lab_batch_results_ui_contract_smoke.mjs
combat_lab_batch_result_render_contract_smoke.mjs
combat_lab_batch_path_contract_smoke.mjs
```

## 13.4. `combat-lab-scenario-system:verify`

Использовать существующий repository verification/isolated-process pattern с timeout и captured stdout/stderr.

Он должен включать новые wiring/lifecycle contracts и три агрегата Stage 10. Не ослаблять существующие Stage 9/Preview gates.

Не создавать unbounded hanging parent process.

---

# 14. Полная verification matrix

Исполнитель работает в полном exact checkout. Focused mirror/stubs не заменяют repository-wide проверки.

До первого deployment обязательно выполнить:

```bash
npm ci
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

Canonical Preview gate:

```bash
npm run verify:preview -- --report <report-file>
```

При изменении generated docs/metadata:

```bash
npm run docs:sync
npm run docs:check
```

Фиксировать для каждой команды:

```text
exact command
exit code
PASS/FAIL
duration
important stdout/stderr
```

Не объявлять skipped или focused-stub check полноценным repository PASS.

Если падает код:

1. не деплоить;
2. определить root cause;
3. добавить/усилить regression test;
4. исправить минимально;
5. повторить focused check;
6. повторить canonical Preview gate.

Не удалять и не ослаблять test только ради зелёного результата.

---

# 15. Determinism и функциональная приёмка

До первого Preview доказать автоматизировано, где возможно:

1. один experiment, Seed `9041`, headless два раза;
2. exact equality metrics/event digest/final state digest;
3. batch workerCount `1` и `4`;
4. equality aggregates и representative Seeds;
5. visual controller использует тот же experiment revision/Seed;
6. representative replay reset к точному Seed;
7. reset полностью восстанавливает initial scene;
8. breakpoint не выполняет production tick до продолжения;
9. `×0,1` работает через существующий ticker;
10. editor revision invalidates старый batch result.

Обязательный пользовательский сценарий Stage 10:

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

Проверить contract/source/runtime tests для:

- роли назначаются существующим бойцам;
- point/circle markers создаются;
- right-click добавляет действия;
- tracks разных бойцов идут параллельно;
- movement ждёт production arrival;
- prone ждёт production posture completion;
- fire repeat создаёт отдельные production tasks;
- target state читается через real capabilities;
- batch count `100` не выполняется на main thread;
- representative replay использует exact Seed;
- visual/headless не создают две simulation pipelines.

---

# 16. Preview deployment

## 16.1. Preferred route

Использовать первым доступным способом manual workflow:

```text
.github/workflows/manual-vercel-preview.yml
workflow_dispatch
ref: worker/20260729-combat-lab-stage10-release-acceptance
expected_sha: <exact verified SHA>
```

Workflow должен:

1. checkout exact SHA;
2. проверить `git rev-parse HEAD`;
3. выполнить canonical gate;
4. собрать один раз;
5. задеплоить один раз через pinned Vercel CLI;
6. использовать permanent project `repo`.

## 16.2. Local route

Если manual workflow недоступен, разрешён exact local checkout route из:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

Emergency fallback использовать только если обе normal routes недоступны.

## 16.3. Проверка после публикации

Успешный Preview требует:

```text
Vercel status READY
/ responds successfully
/ai-node-editor.html responds successfully
/deployment-source.json exists
source ref exact match
source SHA exact match
checks_run recorded
skipped_checks recorded
deployment ID recorded
Preview URL recorded
```

Не считать deployment успешным только по завершившемуся build log.

Не создавать dummy commit для повторного deployment.

---

# 17. Visual QA

Chromium/Playwright/agent-browser visual QA выполнять только после отдельного явного разрешения пользователя.

До такого разрешения допускаются:

- source inspection;
- TypeScript/smoke/build;
- deployment status;
- HTTP/page availability checks;
- передача Preview URL пользователю для ручной проверки.

После отдельного разрешения проверить на `1440×900`:

```text
one canvas
no page errors
no horizontal overflow
Scene/Program switch
Current/Batch switch
context menu viewport bounds
drag and keyboard reorder
undo/redo
marker create/move/delete
visual start/pause/step/stop/reset
speed ×0,1
breakpoint
active step highlight
batch progress/cancel
representative replay
normal game input in manual mode
symmetric collapse/resize
```

Static source inspection не считать visual QA.

---

# 18. Пользовательский correction cycle

После первого verified deployment вернуть пользователю Preview URL и статус:

```text
READY FOR USER ACCEPTANCE
```

Остаться в том же чате и worker-ветке.

Когда пользователь передаёт замечания:

1. принять весь пакет как acceptance input;
2. воспроизвести каждую проблему на точном текущем SHA;
3. сгруппировать только связанные root causes;
4. написать regression test до исправления;
5. внести минимальную правку;
6. запустить focused checks;
7. запустить полный canonical Preview gate;
8. создать новый correction commit;
9. задеплоить новый exact SHA один раз;
10. вернуть новый Preview URL и issue-by-issue status.

Не отвечать пользователю только объяснением без правки, если проблема воспроизводится и входит в Stage 10 scope.

Не использовать deployment для поиска следующей ошибки. Ошибка должна быть исправлена до публикации нового SHA.

Если пользователь просит feature вне Stage 10, явно отделить:

```text
acceptance defect
small in-scope usability correction
new feature outside Stage 10
```

Новый feature не реализовывать без отдельного согласования scope.

После каждого correction deployment вернуть:

```text
ACCEPTANCE CORRECTION DEPLOYED
previous_sha:
current_sha:
correction_commits:
issues_fixed:
regression_tests_added:
focused_checks:
full_preview_gate:
deployment_id:
preview_url:
deployment_source_verified:
visual_qa_status:
remaining_known_issues:
```

---

# 19. Stop conditions

Вернуть `BLOCKED`, если:

- release base moved;
- отсутствует интегрированный executor result;
- требуется изменить `.github/workflows/**`;
- canonical Preview gate невозможно запустить и пользователь не разрешил documented skips;
- Vercel project identity не совпадает с permanent project `repo`;
- требуется второй ticker/session/simulation pipeline;
- visual/headless parity невозможно сохранить;
- ordinary game input невозможно сохранить в manual mode;
- требуется ослабить Stage 8/9/Preview tests;
- нужен новый продуктовый feature вне Stage 10.

Вернуть `FAIL`, если:

- repository-wide TypeScript воспроизводимо падает из-за итоговой реализации;
- production build не проходит;
- determinism acceptance не достигнут;
- workerCount меняет Seed-to-run mapping или aggregates;
- stale batch result применяется;
- lifecycle leak сохраняется после исправления;
- пользовательский correction воспроизводимо не исправлен;
- разрешённый visual QA выявил page error/overflow/second canvas.

Не деплоить статус `BLOCKED` или `FAIL` как нормальный кандидат.

---

# 20. Git и доставка

- Работать только в `worker/20260729-combat-lab-stage10-release-acceptance`.
- Не изменять orchestration branch напрямую.
- Не создавать ранний PR.
- Не force-push.
- Не переписывать принятые Executor 1–4 commits.
- Не создавать dummy commits.
- Не переносить в `real-wargame-preview`.
- Не изменять `main`.
- Не включать deployment на push.
- Перед каждым readiness просмотреть полный `release_start_sha..HEAD` diff.
- Каждый deployment привязать к точному SHA.
- Secrets, `.vercel`, token files и project credentials не коммитить.

---

# 21. Первый итоговый отчёт

После initial integration, полной проверки и первого Preview вернуть:

```text
status: READY FOR USER ACCEPTANCE | BLOCKED | FAIL
executor: 5
worker_branch: worker/20260729-combat-lab-stage10-release-acceptance
orchestrator_branch: feature/20260729-combat-lab-scenario-system
release_start_sha:
current_commit:
integration_commits:
files_changed:
public_exports_added:
wiring_summary:
single_owner_invariants:
lifecycle_results:
checks_run:
full_preview_gate:
determinism_results:
performance_impact:
deployment_route:
deployment_id:
preview_url:
deployment_source_ref:
deployment_source_sha:
deployment_source_verified:
visual_qa_status:
preview_touched: false
main_touched: false
pr_created: false
```

`preview_touched: false` означает, что Git branch `real-wargame-preview` не изменялась; Vercel Preview deployment при этом разрешён и должен быть отдельно отражён.

---

# 22. Финальный отчёт после одобрения пользователя

Только после явного сообщения пользователя, что результат принят, вернуть:

```text
status: READY FOR ORCHESTRATOR INTEGRATION
executor: 5
worker_branch:
release_start_sha:
accepted_commit:
integration_commits:
acceptance_correction_commits:
final_checks_run:
final_preview_gate:
final_deployment_id:
final_preview_url:
deployment_source_verified:
user_acceptance_received: true
known_remaining_issues:
performance_impact:
visual_qa_status:
preview_touched: false
main_touched: false
pr_created: false
```

После этого остановиться. Не переносить worker result в orchestration branch самостоятельно.