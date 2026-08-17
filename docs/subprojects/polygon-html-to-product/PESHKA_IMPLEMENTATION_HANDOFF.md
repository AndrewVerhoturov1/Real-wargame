# ПЕШКА — implementation handoff: отображение бойца на карте

Дата: 2026-08-17

Статус: **PAUSED BY USER / NOT INTEGRATED**

> Я — ПЕШКА. Отвечаю за визуальное отображение настоящего бойца на карте и уровни детализации знака.

## Идентичность работы

```text
REQUEST_ID: XROUTE-20260817-POLYGON-UNIT-MAP-TOKEN-001
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_sha: 8292bf25bf241712901090fcb565dded939e7a08
feature_branch: feature/20260817-polygon-unit-map-token-x
implementation_head_before_this_documentation: bdae5ea0a5e3d282370b1401429d194ec2787da7
pull_request: https://github.com/AndrewVerhoturov1/Real-wargame/pull/286
```

Этот handoff фиксирует состояние ветки после реализации ПЕШКИ и после отдельной попытки Vercel Preview по явной команде пользователя. Ветка не объединена в `real-wargame-preview` и не затрагивает `main`.

## Что реализовано

Развит существующий `src/rendering/PixiUnitRenderer.ts`. Второй renderer, отдельный map runtime, новый selection owner или отдельный gameplay state не создавались.

Перенесён принятый визуальный язык бойца из `UNIT_SYMBOL_SYSTEM.md` непосредственно в настоящий product renderer:

- стоя — круг;
- пригнувшись / crouched — скруглённый направленный треугольник;
- лёжа — вытянутый скруглённый прямоугольник;
- погибший — приглушённый лежащий знак с крестом, оружие скрывается;
- дальний LOD обычного бойца — круг;
- дальний LOD подтверждённого пулемётчика/support — квадрат.

Реализованы три LOD: `near`, `medium`, `far`. LOD зависит от реального масштаба world/camera и использует гистерезис, чтобы знак не переключался туда-сюда от небольшого изменения zoom.

## Какие реальные данные используются

Renderer остаётся только presentation-слоем и читает существующие product owners:

- положение и сторона — из `UnitModel`;
- поза — из `behaviorRuntime.posture`;
- направление корпуса — из `facingRadians`;
- направление оружия при валидном прицеливании — из `infantryCombatRuntime.activeFireTask.aimTracking.solution.currentDirection`;
- fallback направления оружия — `facingRadians`;
- класс оружия — из `primaryWeapon.resolved.weapon.weaponClass`;
- ранения — из `infantryCombatRuntime.wounds`;
- подавление — из `infantryCombatRuntime.suppression.suppressionLevel`;
- движение — из `movementRuntime`;
- aiming/fire — из `activeFireTask` и реального `committedShotId`;
- selection — только проекция переданных canonical selected ids.

Никакие из этих значений renderer не записывает обратно в gameplay truth.

## Состояния и сигналы

Поддержано там, где есть подтверждённые данные:

- selected/unselected;
- wound marker;
- suppression markers;
- движение одним/двумя компактными маркерами;
- aiming cue;
- muzzle flash только при появлении нового реального `committedShotId`;
- dead/inactive presentation;
- отдельное направление оружия от направления корпуса.

## Что сознательно не выдумано

Не реализовано без подтверждённого product owner:

- commander star — в исследованном `UnitModel` не найден канонический commander identity;
- текстовая role label отдельного бойца — подтверждённый runtime owner роли не найден;
- squad hull — отдельный надёжный squad identity/owner в зоне ПЕШКИ не подтверждён.

Эти элементы нельзя восстанавливать эвристикой по label/type только ради визуального сходства.

## Производительность и жизненный цикл

Сохранена существующая архитектура persistent views по `unit.id`.

Добавлено/сохранено:

- постоянное переиспользование Pixi `Graphics`;
- geometry rebuild только при изменении ограниченного presentation key;
- LOD transition без создания второго набора unit views;
- удаление и `destroy()` исчезнувших view;
- diagnostics для количества созданий, удалений, обновлений, перестроений и LOD transitions;
- проверка, что неизменный unit не перестраивает геометрию каждый кадр;
- проверка, что изменение posture одного бойца не перестраивает соседнего.

Отдельный известный риск базового renderer не исправлялся в этой задаче: существующий порядок детей использует `getChildIndex`/`setChildIndex`; если `getChildIndex` линейный, консервативная верхняя оценка этой старой части может быть `O(V²)`. Новая логика ПЕШКИ этого механизма не вводила.

## Изменённые файлы реализации

```text
src/rendering/PixiUnitRenderer.ts
scripts/unit_map_token_smoke.ts
scripts/unit_map_token_smoke.mjs
scripts/tactical_workspace_smoke.mjs
```

После попытки публикации также исправлен один устаревший общий тестовый контракт:

```text
scripts/combat_lab_workspace_layout_smoke.mjs
```

Причина: принятый ранее product-код уже содержит канонический список скоростей `[0.1, 0.25, 0.5, 1, 2, 5, 10]`, но smoke всё ещё ожидал старое значение `4`. Исправлена только проверка `4 → 5` и её текст; product behavior этим изменением не менялся.

## Проверки renderer-а

На exact implementation HEAD `9678ca624140c7e7caf3ceddaea8b8b77ce7b161` штатный `PR Risk CI` run #593 завершился успешно.

Фактически прошли:

- change-risk classifier;
- `npx tsc --noEmit`;
- focused UI/editor contracts;
- `unit_map_token_smoke`;
- `npm run editor:smoke`;
- production build;
- deployment-pages smoke;
- final risk/evidence decision.

`unit_map_token_smoke` проверяет:

- standing/crouched/prone/dead forms;
- near/medium/far LOD;
- реальное aim/facing направление оружия;
- одноразовую вспышку на новом committed shot id;
- selection как presentation без изменения gameplay state;
- reuse неизменных view;
- ограниченное перестроение при смене posture;
- удаление/teardown.

## Попытка Vercel Preview и её остановка

По отдельной явной команде пользователя была прочитана репозиторная политика:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

Нормальный путь через ручной GitHub Actions `workflow_dispatch` был недоступен через подключённый GitHub-инструмент, а exact local checkout в этой среде отсутствовал. Поэтому использован предусмотренный самим repository skill аварийный exact-source fallback в постоянный Vercel project `repo`.

Создан ровно один deployment:

```text
deployment_id: dpl_7gqX1zzGSGjuxmBAfWF3okrEikb5
project: repo
requested_source_branch: feature/20260817-polygon-unit-map-token-x
verified_source_sha: 9678ca624140c7e7caf3ceddaea8b8b77ce7b161
final_state: ERROR
published_ready_preview: no
```

В build log exact-source проверка успешно подтвердила нужную ветку и SHA до установки зависимостей.

Публикация остановилась внутри обязательного `verify:preview` на stale contract `Combat Lab 1440x900 workspace layout contract`: тест ожидал скорость `4`, тогда как настоящий `AiTestLabRuntime.ts` уже имел каноническую скорость `5` после ранее принятого изменения.

После этого stale test contract был исправлен в feature-ветке. Новый implementation HEAD стал:

```text
bdae5ea0a5e3d282370b1401429d194ec2787da7
```

**Повторный Vercel deployment после этого не запускался.**

Пользователь затем явно приказал остановить деплой. К этому моменту deployment `dpl_7gqX1zzGSGjuxmBAfWF3okrEikb5` уже находился в конечном состоянии `ERROR`, поэтому активного Vercel процесса для отмены не было. Новые deployment runs не создаются.

## Свежий CI после исправления stale contract

Для exact HEAD `bdae5ea0a5e3d282370b1401429d194ec2787da7` автоматически стартовал `PR Risk CI` run #594.

Успели пройти:

- change-risk classifier;
- checkout exact SHA;
- dependency install;
- TypeScript verification.

Далее focused combat/perception stage завершился ошибкой внутри старого `infantry-combat-stage8:verify`, потому что его широкая команда:

```text
git diff --check f7eea38163be07c70d83314b5b6f3a1ae1cb5855...HEAD
```

нашла исторические trailing whitespace в посторонних документах и прототипах, включая `docs/ai/AI_DEVELOPMENT_APPROACH.md`, research/docs и старые HTML-прототипы. Эти файлы ПЕШКА не меняла.

Поэтому результат run #594 нельзя считать зелёным, но его зафиксированная причина не указывает на дефект `PixiUnitRenderer` или нового unit-token smoke.

По команде пользователя эта проблема сейчас **не исправляется** и дальнейшие проверки/деплой не продолжаются.

## Визуальная проверка

Свежий screenshot/browser QA exact final SHA не выполнен.

Успешного Vercel Preview для ручной проверки не опубликовано. Pixel-perfect соответствие HTML-прототипу поэтому не заявляется.

## Текущее состояние для интегратора

```text
executor: ПЕШКА
status: paused_by_user
base_commit: 8292bf25bf241712901090fcb565dded939e7a08
feature_branch: feature/20260817-polygon-unit-map-token-x
implementation_head: bdae5ea0a5e3d282370b1401429d194ec2787da7
pr: 286
visual_contract_coverage: circle / rounded triangle / rounded rectangle / dead mark / near-medium-far LOD / real aim-facing / wound-suppression-movement-fire where authoritative signals exist
visual_qa: not completed
unsupported_product_signals: commander identity, canonical individual role label, reliable squad hull owner
blockers: no fresh browser/screenshot acceptance; PR Risk CI #594 currently red because legacy Stage 8 verification scans unrelated historical trailing whitespace
next_integration_point: КАРТА + ПЕШКА + ПУЛЬС
preview_touched: no
main_touched: no
deployment_touched: yes, one failed exact-source Preview attempt
ready_deployment_exists: no
```

## Навыки

Прочитаны в ходе работы:

- `real-wargame-orchestration`;
- `real-wargame-ai-runtime`;
- `real-wargame-performance`;
- `real-wargame-screenshots`;
- `real-wargame-local-preview`;
- `real-wargame-pixijs`;
- `real-wargame-manual-vercel-deploy`;
- Vercel deployment/CI guidance;
- GitHub repository/publish guidance.

`real-wargame-documentation` по заявленному ранее пути в текущей базе не найден; отдельный одноимённый skill не использовался.

## Стоп-точка

На момент этого handoff работа остановлена по прямой команде пользователя. Не выполнять новый deploy, transfer, merge, auto-merge или дополнительные исправления без новой команды.
