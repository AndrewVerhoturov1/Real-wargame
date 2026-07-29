# Stage 10 — Исполнитель 2: компактный редактор сценариев и authoring на карте

## Роль

Ты — Исполнитель 2 в координированной реализации Stage 10 для `Combat Lab`.

Ты отвечаешь только за состояние редактора, компактный UI дорожек и карточек, роли, сохранение начальной сцены, import/export, undo/redo, контекстное меню карты, point/circle markers и authoring overlay.

Ты не реализуешь core executor, visual runtime, headless runner, batch worker или общую интеграцию `CombatLabShell`.

## Репозиторий и contract gate

```text
repository: AndrewVerhoturov1/Real-wargame
orchestrator branch: feature/20260729-combat-lab-scenario-system
required preview ancestor: 6a21502da66b2b7dbd9054db7f57e6864b1c4fb5
required prompt ancestor: 25e626d5f08cfd51d7e6797f9e84fe4d719a6b20
worker branch: worker/20260729-combat-lab-stage10-editor
```

Создание worker-ветки от orchestration feature-ветки для этой координированной задачи явно разрешено данным заданием.

Перед реализацией:

1. получить фактический remote HEAD `feature/20260729-combat-lab-scenario-system`;
2. проверить, что `25e626d5f08cfd51d7e6797f9e84fe4d719a6b20` является его предком;
3. проверить наличие файла `src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts`;
4. проверить экспорт контрактов через `src/core/testing/combat-lab/experiment/index.ts`;
5. записать фактический HEAD как `contract_base_sha`;
6. создать isolated worktree/local branch `worker/20260729-combat-lab-stage10-editor` от этого SHA.

Если contract-файл отсутствует, вернуть `BLOCKED: CONTRACT GATE NOT MERGED`. Не создавать собственные несовместимые публичные типы вместо него.

Если orchestration branch изменилась после начала твоей работы, не подтягивать новые изменения вслепую. Зафиксировать расхождение и согласовать rebase/cherry-pick через оркестратора.

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
- принятые Stage 10 experiment contracts.

Изучить:

- `src/combat-lab/CombatLabExtension.ts`;
- `src/combat-lab/ui/CombatLabShell.ts`;
- `src/combat-lab/rendering/CombatLabRenderer.ts`;
- `src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts`;
- `src/game/GameApplicationTypes.ts`;
- текущий input/radial/context-menu path игры;
- текущий game editor и scene export/import path;
- существующие CSS переменные и классы Combat Lab.

## Главная цель

Подготовить автономные компоненты редактора, которые оркестратор сможет смонтировать в существующую левую панель Combat Lab без второго canvas и без замены production map/input architecture.

Пользователь должен иметь возможность:

- назначить существующим бойцам стабильные роли;
- сохранить текущую production scene как initial snapshot;
- создать point/circle markers на карте;
- создать отдельную дорожку для каждого actor role;
- добавить действия правым кликом по бойцу или местности;
- редактировать, reorder, duplicate, disable и delete steps;
- использовать undo/redo;
- сохранить/загрузить experiment JSON;
- видеть markers и связи выбранного действия на существующей карте.

## Разрешённые файлы

```text
src/combat-lab/scenario-editor/**
src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts
scripts/combat_lab_scenario_editor_*
scripts/combat_lab_map_authoring_*
```

Разрешено создавать отдельные scoped CSS-файлы внутри:

```text
src/combat-lab/scenario-editor/**
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
src/game/**
package.json
.github/workflows/**
docs/ai/**
real-wargame-preview
main
```

Если для монтажа нужен общий файл, передать точный patch suggestion оркестратору.

## Архитектурные границы

- Editor draft хранит сериализуемый `CombatLabExperimentV1`.
- UI не владеет gameplay computation.
- UI не запускает `tickSimulation`.
- Overlay только визуализирует authored markers/selected step и не становится источником истины.
- Overlay не сканирует карту.
- Обычная игра вне Combat Lab не импортирует scenario editor entrypoint.
- Все listeners/pointer handlers/DOM nodes/Pixi containers удаляются симметрично в `destroy()`.
- Нет внешних библиотек drag-and-drop, state management или charts.
- Максимум 100 undo states.
- Максимум 64 tracks, 512 steps, 256 markers принимаются из core validation limits.

# Task 1. Immutable draft и history

Создать:

```text
src/combat-lab/scenario-editor/CombatLabExperimentDraft.ts
src/combat-lab/scenario-editor/CombatLabEditorHistory.ts
src/combat-lab/scenario-editor/index.ts
scripts/combat_lab_scenario_editor_state_smoke.mjs
```

Публичные интерфейсы:

```ts
export class CombatLabExperimentDraft {
  getExperiment(): CombatLabExperimentV1;
  replaceExperiment(experiment: CombatLabExperimentV1): void;
  addTrack(actorRoleId: string): string;
  removeTrack(trackId: string): void;
  addStep(trackId: string, step: CombatLabScenarioStepV1): void;
  updateStep(trackId: string, stepId: string, patch: Partial<CombatLabScenarioStepV1>): void;
  moveStep(trackId: string, stepId: string, targetIndex: number): void;
  duplicateStep(trackId: string, stepId: string): string;
  removeStep(trackId: string, stepId: string): void;
  addMarker(marker: CombatLabMarkerV1): void;
  updateMarker(markerId: string, marker: CombatLabMarkerV1): void;
  removeMarker(markerId: string): void;
  assignRole(role: CombatLabExperimentRoleV1): void;
  removeRole(roleId: string): void;
}

export class CombatLabEditorHistory {
  execute(next: CombatLabExperimentV1): void;
  undo(): CombatLabExperimentV1 | null;
  redo(): CombatLabExperimentV1 | null;
  clear(): void;
}
```

Требования:

- входной experiment не мутируется;
- каждое изменение увеличивает revision ровно один раз;
- стабильные IDs не меняются при reorder/update;
- duplicate получает новый ID;
- удаление role/marker с references не выполняется молча: draft возвращает понятную ошибку или требует предварительной очистки references;
- history ограничена 100 состояниями;
- новая операция после undo очищает redo tail.

Smoke:

- add/update/move/duplicate/remove;
- revision;
- immutability;
- undo/redo;
- capacity eviction;
- referenced entity protection.

# Task 2. Компактные tracks/cards/inspector

Создать:

```text
src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts
src/combat-lab/scenario-editor/CombatLabTrackList.ts
src/combat-lab/scenario-editor/CombatLabStepCard.ts
src/combat-lab/scenario-editor/CombatLabStepInspector.ts
src/combat-lab/scenario-editor/combat-lab-scenario-editor.css
scripts/combat_lab_scenario_editor_ui_contract_smoke.mjs
```

Публичный интерфейс:

```ts
export interface CombatLabScenarioEditorPanelOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onRequestMapPick: (request: CombatLabMapPickRequestV1) => void;
  readonly onSelectRole: (roleId: string) => void;
}

export class CombatLabScenarioEditorPanel {
  static create(options: CombatLabScenarioEditorPanelOptions): CombatLabScenarioEditorPanel;
  setRuntimeSnapshot(snapshot: CombatLabScenarioRuntimeSnapshotV1 | null): void;
  selectStep(trackId: string, stepId: string): void;
  destroy(): void;
}
```

UI requirements:

- collapsed card занимает одну компактную строку;
- показывает номер, action label, target/marker и runtime state;
- details открывает параметры, conditions, repeat, timeout, failure policy, breakpoint;
- кнопки duplicate/disable/delete не раздувают карточку;
- drag reorder реализован native pointer events;
- keyboard reorder: `Alt+ArrowUp` / `Alt+ArrowDown`;
- `Ctrl+Z` и `Ctrl+Y` работают, когда focus не находится в текстовом поле;
- disabled step остаётся видимым;
- runtime states отображаются существующими semantic colors;
- нет горизонтального overflow внутри dock;
- не задавать ширину больше текущей панели;
- действия, не поддержанные current weapon/runtime, показываются disabled с reason.

Использовать существующие значения accuracy controls через adapter/options. Не копировать формулы accuracy и не создавать второй source of truth.

# Task 3. Scene panel, roles, import/export и local persistence

Создать:

```text
src/combat-lab/scenario-editor/CombatLabScenePanel.ts
src/combat-lab/scenario-editor/CombatLabRoleEditor.ts
src/combat-lab/scenario-editor/CombatLabExperimentFileActions.ts
src/combat-lab/scenario-editor/CombatLabExperimentLocalStore.ts
scripts/combat_lab_scene_authoring_ui_contract_smoke.mjs
```

Публичные интерфейсы:

```ts
export function captureCombatLabInitialScene(
  state: SimulationState,
  current: CombatLabExperimentV1,
): CombatLabExperimentV1;

export interface CombatLabScenePanelOptions {
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly getSelectedUnitId: () => string | null;
}
```

Требования:

- initial scene сохраняется только через канонический `buildExportedScene`;
- выбранному production unit назначается стабильный role ID и русское имя;
- role ID не меняется при rename;
- export создаёт `.combat-lab.json` через core serializer;
- import использует core parser/validation;
- errors не заменяют текущий draft;
- warnings показываются пользователю;
- localStorage хранит максимум 10 recent experiments;
- ключи содержат schema и experiment ID;
- oldest entry удаляется детерминированно;
- storage failure не ломает editor session и даёт русское сообщение.

# Task 4. Map authoring controller и context menu

Создать:

```text
src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts
src/combat-lab/scenario-editor/CombatLabMapContextMenu.ts
src/combat-lab/scenario-editor/combat-lab-map-context-menu.css
scripts/combat_lab_map_authoring_contract_smoke.mjs
scripts/combat_lab_map_authoring_regression_smoke.mjs
```

Публичные типы:

```ts
export type CombatLabMapPickRequestV1 =
  | { readonly kind: 'point_marker'; readonly suggestedTitleRu: string }
  | { readonly kind: 'circle_marker'; readonly suggestedTitleRu: string; readonly defaultRadiusMetres: number }
  | { readonly kind: 'target_role'; readonly actorRoleId: string; readonly actionKind: 'fire' | 'first_aid' | 'transfer' };

export interface CombatLabMapAuthoringControllerOptions {
  readonly context: GameApplicationContext;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getMode: () => 'scenario_editor' | 'manual_control';
  readonly getSelectedActorRoleId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
}

export class CombatLabMapAuthoringController {
  static create(options: CombatLabMapAuthoringControllerOptions): CombatLabMapAuthoringController;
  requestPick(request: CombatLabMapPickRequestV1): void;
  destroy(): void;
}
```

Правила input:

- intercept right-click только в `scenario_editor` mode;
- в `manual_control` не мешать существующему игровому input;
- вне Combat Lab ничего не меняется;
- Escape закрывает menu/pick mode;
- menu остаётся внутри viewport;
- повторный right-click закрывает старое menu;
- listener не дублируется при refresh;
- destroy снимает всё.

Menu по enemy:

- single;
- short burst;
- long burst;
- suppress;
- fire until condition;
- wait for contact.

Menu по friendly:

- first aid;
- transfer ammo;
- select helper;
- wait for its step.

Menu по ground:

- move;
- point marker;
- circle marker;
- suppress area;
- deploy anchor;
- face point только если соответствующее действие реально есть в принятом core contract; иначе не показывать.

# Task 5. Authoring overlay

Создать:

```text
src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts
```

Требования:

- использует существующий world container;
- не создаёт Pixi Application/canvas/ticker/camera;
- показывает point/circle markers;
- показывает names и стабильные IDs компактно;
- показывает selected step target и route guide;
- отображает step number/track relation только для выбранной дорожки или bounded visible set;
- не сканирует карту;
- O(markers + selected guides), bounded limits;
- destroy idempotent;
- не хранит gameplay truth;
- не читает objective hidden position цели вместо authored marker/known role reference.

# Проверки Исполнителя 2

Запустить минимум:

```bash
npx tsc --noEmit
node scripts/combat_lab_scenario_editor_state_smoke.mjs
node scripts/combat_lab_scenario_editor_ui_contract_smoke.mjs
node scripts/combat_lab_scene_authoring_ui_contract_smoke.mjs
node scripts/combat_lab_map_authoring_contract_smoke.mjs
node scripts/combat_lab_map_authoring_regression_smoke.mjs
npm run combat-lab-ui-contract:smoke
npm run workspace:smoke
npm run build
```

Не изменять `package.json`; aggregate scripts добавляет оркестратор.

Не запускать Chromium/Playwright без отдельного разрешения. Static contract smoke не считать визуальной проверкой.

## Коммиты

Не более трёх осмысленных коммитов:

```text
feat(combat-lab): add authored experiment draft and compact tracks
feat(combat-lab): add scene roles and experiment files
feat(combat-lab): add map scenario authoring
```

## Обязательный patch suggestion оркестратору

В финальном отчёте описать точное подключение:

- где создать `CombatLabScenarioEditorPanel`;
- где создать `CombatLabScenePanel`;
- как передать `GameApplicationContext` map controller;
- куда добавить scoped CSS imports;
- как переключать `Сцена | Программа`;
- как соединить runtime snapshot с cards;
- какие existing manual controls оставить под `Дополнительные действия`.

Не выполнять этот wiring самостоятельно.

## Стоп-условия

Вернуть `BLOCKED`, если:

- contract gate не принят;
- для input interception нужен глобальный rewrite ordinary game input;
- карта не предоставляет безопасный existing world-coordinate conversion;
- требуется второй canvas;
- требуется менять `.github/workflows/`.

Вернуть `FAIL`, если:

- обычный input regression воспроизводимо сломан;
- destroy оставляет listeners/nodes;
- editor mutates source experiment;
- typecheck/build падает из-за твоего diff.

Вернуть `READY FOR INTEGRATION`, когда components готовы и focused checks зелёные.

## Финальный отчёт

```text
status: READY FOR INTEGRATION | BLOCKED | FAIL
executor: 2
worker_branch: worker/20260729-combat-lab-stage10-editor
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