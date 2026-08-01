# Финальный запуск компилятора общих игровых редакторов — 2026-08-01

## Роль

Ты — финальный компилятор программы объединения игровых редакторов Real-Wargame.

Ты не создаёшь новую самостоятельную функциональность. Твоя задача — объединить два точных результата Wave 2 поверх проверенного Wave 2 Foundation, устранить только реальные интеграционные дефекты, провести полную проверку и вернуть один проверенный HEAD оркестратору.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

Ветка уже создана оркестратором:

```text
compiler/20260731-shared-game-editors-integration
```

Обязательный стартовый HEAD:

```text
dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
```

Не пересоздавай ветку. Не выполняй reset, rebase, squash или force-push.

## Точные входные результаты

### Исполнитель 3

```text
branch: worker/20260731-gameplay-tuning-editors
exact_head: a30ddc8ef86f07bd9bd35307ea64762086936c40
foundation: dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
```

### Исполнитель 4

```text
branch: worker/20260731-combat-lab-game-editors
exact_head: 13ce6f43987dfa92592c83bb5716cc6aceb03bc3
foundation: dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
```

Исполнитель 4 был случайно запущен в двух чатах на одной ветке. Это не две альтернативные реализации:

```text
intermediate_blocked_head: 77e50a67f43bb36d30c174f1e419d73ca83fae6d
final_head_after_second_continuation: 13ce6f43987dfa92592c83bb5716cc6aceb03bc3
```

Финальный HEAD на два коммита продолжает промежуточный и добавляет поддержку `sourceProfileLinks` бойца и соответствующий контракт. Интегрировать нужно только финальный HEAD `13ce6f...`.

## Разрешённое исключение для acceptance-ветки

Общий промт `SHARED_GAME_EDITORS_COMPILER_PROMPT.md` требует, чтобы acceptance-ветка точно указывала на Wave 2 Foundation. На этом запуске это условие намеренно заменено следующим:

- acceptance-ветка содержит отдельные документационные коммиты оркестратора;
- её merge-base с Wave 2 Foundation равен `233e14fb17cdfa3edcf76724042d4c35fd4ae5f1`;
- её уникальные изменения должны относиться только к `docs/**`;
- это расхождение не является причиной `BLOCKED`;
- acceptance-ветку не изменяй — окончательное объединение выполнит оркестратор после твоего отчёта.

Если в уникальной части acceptance-ветки обнаружится product-код вне `docs/**`, верни `BLOCKED`.

## Обязательное чтение

Полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `.agents/skills/real-wargame-ai-runtime/SKILL.md`;
7. `.agents/skills/real-wargame-local-preview/SKILL.md`;
8. `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
9. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
10. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
11. `SHARED_GAME_EDITORS_EXECUTOR_03_TUNING_PROMPT.md`;
12. `SHARED_GAME_EDITORS_EXECUTOR_04_COMBAT_LAB_PROMPT.md`;
13. `SHARED_GAME_EDITORS_COMPILER_PROMPT.md`;
14. полные Foundation-to-head diffs обоих исполнителей.

Используй `superpowers:systematic-debugging` при любом failure и `superpowers:verification-before-completion` перед итоговым статусом.

## Проверка входных данных

До изменений выполни:

```bash
git fetch origin --prune
git switch compiler/20260731-shared-game-editors-integration
git rev-parse HEAD
git status --short
git rev-parse origin/worker/20260731-gameplay-tuning-editors
git rev-parse origin/worker/20260731-combat-lab-game-editors
git merge-base HEAD origin/worker/20260731-gameplay-tuning-editors
git merge-base HEAD origin/worker/20260731-combat-lab-game-editors
git diff --name-only dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f...origin/worker/20260731-gameplay-tuning-editors
git diff --name-only dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f...origin/worker/20260731-combat-lab-game-editors
```

Ожидается:

```text
compiler HEAD = dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
worker 3 HEAD = a30ddc8ef86f07bd9bd35307ea64762086936c40
worker 4 HEAD = 13ce6f43987dfa92592c83bb5716cc6aceb03bc3
оба merge-base = dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
```

## Порядок интеграции

1. Интегрируй Исполнителя 3.
2. Запусти focused core/editor проверки его результата.
3. Интегрируй Исполнителя 4.
4. Разреши пересечения и запусти Combat Lab focused проверки.
5. Затем выполняй combined regression и полный canonical gate.

Сохраняй опубликованную историю. Предпочтителен cherry-pick осмысленных коммитов в исходном порядке. Merge commits допустимы, если это безопаснее для опубликованной истории.

## Ожидаемые пересечения

Оба исполнителя меняют:

```text
scripts/shared_game_editor_platform_smoke.mjs
src/combat-lab/main.ts
src/game-editors/createDefaultGameEditorRegistry.ts
```

Нельзя выбирать одну сторону целиком. Итог обязан содержать обе семантики:

- три новых tuning definitions Исполнителя 3;
- динамический Combat Lab catalogue Исполнителя 4;
- все прежние definitions Foundation;
- оба набора regression-проверок;
- единственную инициализацию storage/CSS/lifecycle в `src/combat-lab/main.ts`.

## Обязательные интеграционные исправления и проверки

### 1. Типизированные ссылки на профили бойца

После объединения `SoldierParameters` уже содержит:

```text
sourceProfileLinks
```

Поэтому в `CombatLabGameEditorLinks.ts`:

- используй типизированный `unit.soldier.sourceProfileLinks`;
- удали переходный cast `unit.soldier as unknown`;
- не оставляй `Record<string, any>`;
- сохраняй валидацию внешнего/импортированного значения только там, где она реально нужна.

### 2. Не оставлять глобальные ambient type hacks

Исполнитель 3 добавил:

```text
src/core/tuning/GameplayTuningNumericRecords.d.ts
```

Файл глобально расширяет `Array<T>` и дополняет доменные интерфейсы через `Record<string, number>`. В итоговом продукте такой обход типов запрещён.

Требуется:

- удалить глобальное объявление `Array.at`;
- не расширять `SoldierTraits`/`SoldierCondition` через ambient module augmentation;
- заменить это явными typed key arrays, mapped types или локальными generic helpers;
- сохранить строгий typecheck без `any` и без ослабления `tsconfig`.

### 3. Активные профили не должны быть декоративными

Редактор Исполнителя 3 показывает действие `Сделать активным` для perception и condition profiles.

Для каждого такого действия компилятор обязан:

- указать конкретный runtime consumer;
- добавить поведенческий тест изменения результата;
- доказать, что per-soldier frozen snapshot имеет приоритет и не меняется после глобального переключения;
- либо удалить/переименовать действие и связанное storage-состояние, если реального runtime consumer нет.

Не допускается кнопка, влияющая только на подпись `активный`.

### 4. Ровно 12 редакторов

Итоговый default registry обязан содержать ровно:

```text
behaviorGraph
tacticalPositions
routeProfiles
environmentProfiles
movementProfiles
weapons
attentionProfiles
perceptionProfiles
soldierData
soldierArchetypes
conditionProfiles
directionalTerrain
```

Каждый ID регистрируется один раз.

AI Editor и Combat Lab получают definitions из одного default source. Combat Lab не содержит собственного списка этих IDs.

### 5. Постоянные package scripts

Исполнитель 3 сообщил о запуске команд `npm run test:*`, но в его итоговом `package.json` таких script names нет. Не опирайся на этот журнал как на доказательство.

Добавь или сохрани постоянные понятные команды для новых проверок, например:

```text
gameplay-tuning-editors:smoke
combat-lab-game-editors:smoke
shared-game-editors:smoke
```

Точные названия могут соответствовать стилю репозитория, но новые `.mjs` smoke-файлы должны реально запускаться через `package.json` и canonical/combined gate.

### 6. Runtime и производительность

Докажи:

- localStorage читается только при инициализации browser storage adapter;
- SimulationTick и per-unit hot paths не читают storage и не ищут profile по ID;
- созданный боец хранит frozen snapshots;
- глобальное редактирование профиля не меняет уже созданных бойцов;
- новый боец получает новую опубликованную ревизию;
- нет polling, setInterval, второго simulation loop или frame observer;
- закрытый modal/editor освобождает listeners/subscriptions.

### 7. Quick parameters остаются локальными

Проверь в combined product:

- изменение глобального профиля не меняет experiment quick overrides;
- изменение quick override не меняет глобальный профиль;
- открытие редактора не стартует, не сбрасывает и не пересоздаёт эксперимент;
- run/batch ownership не изменён.

### 8. Graph v2

- один существующий Graph v2 root;
- Graph не монтируется в Combat Lab modal;
- безопасный переход переносит `returnTo` и `selectedUnitId`;
- прямое открытие AI Editor без return target остаётся корректным;
- обратная ссылка появляется только при безопасном внутреннем return target.

## Обязательные combined tests

Добавь или усили tests, которые доказывают:

1. Все 12 IDs доступны в AI Editor по surface activation.
2. Combat Lab catalogue динамически видит три definitions Исполнителя 3 без hard-coded IDs.
3. Выбранный боец показывает route, movement, attention и три tuning source links без дублей.
4. `beforeClose=false` оставляет editor modal открытым и не открывает game menu.
5. Успешный close восстанавливает фокус; следующий отдельный Escape открывает menu.
6. Повторное открытие каждого нового editor не увеличивает subscriptions/listeners.
7. Built-in профили воспроизводят прежние representative outputs.
8. Custom profile меняет существующий runtime consumer.
9. Frozen snapshot созданного бойца не изменяется после редактирования registry.
10. Новый боец получает новую profile revision.
11. Environment editor остаётся единственным.
12. Нет второго registry/workspace/CombatLab draft/visual controller/batch client/Graph root.
13. AI Editor и Combat Lab не имеют горизонтального overflow при 1100 px.
14. Browser console не содержит application errors.

## Обязательная матрица

Реально выполни на интегрированном product HEAD:

```bash
npm ci --no-audit --no-fund
git diff --check dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f...HEAD
git status --short
npm run typecheck
npm run app-shell-overlay:smoke
npm run shared-game-editors:smoke
npm run gameplay-tuning-editors:smoke
npm run combat-lab-game-editors:smoke
npm run editor:smoke
npm run graph-v2:smoke
npm run perception:smoke
npm run perception-performance:smoke
npm run attention-profiles:smoke
npm run movement-profiles:smoke
npm run environment-materials:smoke
npm run combat-catalog-editor:smoke
npm run directional-terrain:smoke
npm run combat-lab-ui-contract:smoke
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run combat-lab-scenario-system:verify
npm run infantry-combat-stage6:verify
npm run infantry-combat-stage7:verify
npm run infantry-combat-stage8:verify
npm run infantry-combat-stage9:verify
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run long-task-classification:smoke
npm run build
npm run verify:preview -- --report reports/shared-game-editors-final-preview.json
git status --short
```

Если exact script names отличаются после осмысленного объединения, создай постоянные canonical names и перечисли mapping в отчёте. Не пропускай содержимое проверки.

`git status --short` до и после должен быть пустым, кроме явно созданного report-файла; report либо закоммить как постоянный артефакт проверки, либо удали и снова докажи чистое дерево.

## Браузерная приёмка

После зелёной матрицы запусти локальный production preview и AI Engine. Проверь:

```text
/
/ai-node-editor.html
/combat-lab.html
```

Размеры:

```text
1440 × 900
1366 × 768
1100 × 760
1920 × 1080
```

Обязательно проверить:

- одна кнопка `Меню`, без постоянной верхней полосы;
- все переходы между тремя режимами;
- все 12 разделов AI Editor;
- новая вкладка `Настройка игры` в правильном порядке;
- четыре группы каталога;
- появление трёх новых tuning editors автоматически;
- открытие/переключение/закрытие modal;
- Escape и beforeClose;
- Tab/Shift+Tab и восстановление фокуса;
- source links выбранного бойца;
- Graph v2 route и возврат;
- один Graph root и один weapons catalogue;
- отсутствие горизонтального overflow;
- отсутствие ошибок console/page/request;
- открытие редакторов не меняет состояние run/batch.

Deployment не создавай.

## Запрещено

- изменять `main`;
- изменять `real-wargame-preview`;
- изменять acceptance-ветку;
- создавать PR;
- создавать deployment;
- force-push/rebase/squash;
- оставлять временные workflow, triggers или diagnostic reports;
- создавать второй registry/workspace/overlay coordinator/draft/Graph runtime;
- добавлять декоративные параметры без consumer;
- ослаблять проверки ради зелёного результата.

## Формат результата

Верни один статус:

```text
READY FOR ORCHESTRATOR
BLOCKED
FAIL
```

При `READY FOR ORCHESTRATOR` обязательно укажи:

```text
branch: compiler/20260731-shared-game-editors-integration
required_starting_head: dd89d31c4d4b874439e0860b6a2be0c5e6ecee1f
worker3_head: a30ddc8ef86f07bd9bd35307ea64762086936c40
worker4_head: 13ce6f43987dfa92592c83bb5716cc6aceb03bc3
final_product_head:
final_head_after_cleanup:
commits_added:
files_changed:
conflicts_resolved:
ambient_type_hacks_remaining:
active_profile_runtime_consumers:
registry_ids:
commands_run:
canonical_gate:
performance_review:
browser_qa:
console_errors:
temporary_files_remaining:
main_touched: false
preview_touched: false
acceptance_branch_touched: false
pr_created: false
deployment_created: false
```
