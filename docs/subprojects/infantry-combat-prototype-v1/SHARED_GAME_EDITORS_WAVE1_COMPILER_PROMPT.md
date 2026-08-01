# Компилятор Wave 1 — общее меню и общая платформа игровых редакторов

## Роль

Ты — отдельный технический компилятор первой волны программы объединения игровых редакторов Real Wargame.

Твоя задача не состоит в расширении функциональности. Ты получаешь уже объединённый результат Исполнителя 1 и Исполнителя 2, устраняешь два точно воспроизведённых интеграционных дефекта, запускаешь полную матрицу и выдаёшь проверенный Foundation SHA для второй волны.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

Продолжай существующую ветку:

```text
compiler/20260801-shared-game-editors-wave1
```

Обязательный стартовый HEAD:

```text
cd802d92613b64df76552c429a664bb4cbcd909c
```

Ветка уже содержит:

- точный результат Исполнителя 2 `af9e54036658e95a8df680658be73e589efae4b4`;
- точные продуктовые файлы Исполнителя 1 `26e7cc7fe9c6fc7855d2781fc2c0a539cbb1a049`;
- объединённый `package.json`;
- структурный shell smoke;
- новый исполняемый shell/modal behavior smoke;
- удалённый временный integration workflow.

Перед изменениями выполни:

```bash
git fetch origin --prune
git switch compiler/20260801-shared-game-editors-wave1
git rev-parse HEAD
git status --short
git merge-base HEAD af9e54036658e95a8df680658be73e589efae4b4
git merge-base HEAD 26e7cc7fe9c6fc7855d2781fc2c0a539cbb1a049
```

Требования:

- `HEAD` равен `cd802d92613b64df76552c429a664bb4cbcd909c`;
- рабочее дерево чистое;
- обе исходные истории доступны;
- не выполнять reset, rebase, squash или force-push;
- не создавать новую ветку.

При несовпадении верни `BLOCKED`.

## Обязательное чтение

Полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
7. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
8. `SHARED_GAME_EDITORS_EXECUTOR_01_SHELL_PROMPT.md`;
9. `SHARED_GAME_EDITORS_EXECUTOR_02_PLATFORM_PROMPT.md`;
10. текущие:
   - `scripts/app_shell_overlay_behavior_smoke.ts`;
   - `src/shared/app-overlay/AppModalLayer.ts`;
   - `scripts/posture_transition_smoke.ts`;
   - `src/core/units/UnitModel.ts`;
   - `src/core/testing/combat-lab/experiment/CombatLabParticipantInitialRuntime.ts`.

Используй `superpowers:systematic-debugging`, `superpowers:test-driven-development` и `superpowers:verification-before-completion`.

## Зафиксированные результаты предыдущей матрицы

На объединённом product-коммите прошли:

```text
git diff --check
npm run shared-game-editors:smoke
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run editor:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run graph-v2:smoke
npm run movement-profiles:smoke
npm run combat-catalog-editor:smoke
npm run attention-profiles:smoke
npm run directional-terrain:smoke
npm run environment-materials:smoke
npm run combat-lab-scenario-system:verify
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run build
```

Остались ровно два воспроизведённых дефекта.

---

## Дефект 1 — fake DOM ошибочно считает контейнеры фокусируемыми

### Симптом

`npm run app-shell-overlay:smoke` запускает структурную проверку, затем исполняемый behavior smoke. Behavior smoke ожидает перевод фокуса на первую кнопку modal, но получает `.app-modal-host`.

Причина находится в тестовой модели DOM, а не в production modal:

```ts
class FakeElement {
  tabIndex = 0;
}
```

Из-за этого каждый `DIV` и `SECTION` ошибочно попадает в выборку фокусируемых элементов.

### Требуемое исправление

В `scripts/app_shell_overlay_behavior_smoke.ts`:

- значение `tabIndex` по умолчанию должно быть `-1`;
- нативно фокусируемые тестовые элементы `A`, `BUTTON`, `INPUT`, `SELECT`, `TEXTAREA` получают `tabIndex = 0` в конструкторе;
- явная установка `dialog.tabIndex = -1` production-кодом должна сохраняться;
- не меняй `AppModalLayer.ts` ради подгонки теста.

Regression test должен реально доказать:

1. открытие переносит фокус на первую кнопку;
2. `Tab` с последней кнопки возвращает на первую;
3. `Shift+Tab` с первой возвращает на последнюю;
4. отказ `beforeClose` сохраняет modal и `inert`;
5. успешное закрытие восстанавливает фокус вызвавшей кнопке;
6. повторный `destroy()` безопасен.

---

## Дефект 2 — Combat Lab напрямую пишет live posture

### Симптом

`npm run infantry-combat-stage9:verify` падает внутри `posture-transition:smoke`:

```text
instant live posture writes:
src/core/testing/combat-lab/experiment/CombatLabParticipantInitialRuntime.ts
```

В Foundation уже существовал код:

```ts
export function applyPosture(unit, posture): void {
  unit.initialState.posture = posture;
  unit.behaviorRuntime.previousPosture = posture;
  unit.behaviorRuntime.posture = posture;
}
```

Канонический контракт запрещает прямые записи `behaviorRuntime.posture` вне владельцев, перечисленных в `posture_transition_smoke.ts`. Тест не ослаблять и allowlist не расширять.

### Требуемое исправление

Перенеси атомарное применение начальной позы в канонического владельца модели бойца.

Предпочтительный контракт в `src/core/units/UnitModel.ts`:

```ts
export function applyInitialPostureToRuntime(
  unit: UnitModel,
  posture: UnitInitialState['posture'],
): void {
  unit.initialState.posture = posture;
  unit.behaviorRuntime.previousPosture = posture;
  unit.behaviorRuntime.posture = posture;
}
```

Затем `CombatLabParticipantInitialRuntime.applyPosture` обязан вызывать этот helper и не содержать собственных live posture writes.

Допустимо уточнить имя helper, но обязательно:

- один канонический владелец записи;
- без запуска временного физического перехода позы;
- без очистки ранений, вооружения, подавления, физиологии или прочего стабильного runtime;
- без вызова полного `applyInitialStateToRuntime`, если он сбрасывает несвязанные данные;
- без изменения игровой семантики обычной смены позы;
- без добавления Combat Lab в allowlist прямых записей.

Добавь regression-проверку начального редактирования участника:

1. начальная поза изменяется немедленно;
2. `initialState.posture`, `previousPosture` и effective `posture` согласованы;
3. активного posture-transition action не создаётся;
4. стабильные ранения, физиология, подавление и вооружение не сбрасываются;
5. `posture-transition:smoke` больше не находит прямую запись в Combat Lab.

---

## Запрещено

- менять `main`;
- менять `real-wargame-preview`;
- менять acceptance-ветку;
- создавать PR;
- создавать deployment;
- добавлять временный workflow в итоговое дерево;
- ослаблять проверки;
- расширять posture allowlist для Combat Lab;
- переделывать Graph v2;
- создавать второй реестр редакторов;
- менять игровые параметры восприятия, архетипов или ранений;
- начинать задачи Исполнителей 3 и 4;
- переписывать опубликованную историю.

## Обязательная матрица

Все команды должны быть реально выполнены на финальном HEAD:

```bash
npm ci --no-audit --no-fund
git diff --check af9e54036658e95a8df680658be73e589efae4b4...HEAD
git status --short
npm run app-shell-overlay:smoke
npm run shared-game-editors:smoke
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run editor:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run graph-v2:smoke
npm run movement-profiles:smoke
npm run combat-catalog-editor:smoke
npm run attention-profiles:smoke
npm run directional-terrain:smoke
npm run environment-materials:smoke
npm run posture-transition:smoke
npm run combat-lab-scenario-system:verify
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run infantry-combat-stage9:verify
npm run build
git status --short
```

`git status --short` до и после матрицы должен быть пустым.

Если для проверки используешь одноразовый workflow:

- разрешено создать его только в compiler-ветке;
- после проверки удалить workflow и отчёт;
- после удаления не менять product-код;
- в отчёте указать точный проверенный product SHA и точный финальный SHA после удаления служебных файлов;
- доказать, что между ними различаются только удалённые служебные файлы.

## Браузерная проверка

После зелёной командной матрицы проверь через браузер минимум:

```text
/
/ai-node-editor.html
/combat-lab.html
```

Размеры:

```text
1440 × 900
1100 × 760
```

Обязательно проверить:

- одна компактная кнопка `Меню`;
- отсутствие старой постоянной полосы и пустого верхнего отступа;
- открытие меню мышью;
- отметку текущего режима;
- переходы между режимами;
- `Escape`: верхний слой → меню → закрытие меню;
- удержание и восстановление фокуса;
- редактор ИИ показывает девять разделов общего реестра;
- Graph v2 использует прежний холст;
- переключение `Вооружение` → другой раздел → `Вооружение` не создаёт второй каталог;
- отсутствие ошибок консоли.

Если защищённый deployment недоступен, разрешена локальная browser-проверка собранного приложения. Deployment не создавать.

## Формат результата

Верни один статус:

```text
READY FOR ORCHESTRATOR
BLOCKED
FAIL
```

При готовности обязательно укажи:

```text
status: READY FOR ORCHESTRATOR
branch: compiler/20260801-shared-game-editors-wave1
required_starting_head: cd802d92613b64df76552c429a664bb4cbcd909c
final_head:
commits_added:
source_shell_head: 26e7cc7fe9c6fc7855d2781fc2c0a539cbb1a049
source_platform_head: af9e54036658e95a8df680658be73e589efae4b4
fake_dom_root_cause:
posture_root_cause:
files_changed:
regression_tests:
full_matrix:
browser_verification:
performance_impact:
known_remaining_issues:
temporary_workflow_present: false
temporary_report_present: false
pr_created: false
deployment_created: false
preview_touched: false
main_touched: false
acceptance_branch_touched: false
```

Не объявляй `READY FOR ORCHESTRATOR`, если хотя бы одна обязательная команда не запускалась или завершилась ненулевым кодом.
