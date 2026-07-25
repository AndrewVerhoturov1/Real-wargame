# Stage 8 — отчёт исполнителя

## Статус

`PENDING VERIFICATION`

## Основа и ветка

- Репозиторий: `AndrewVerhoturov1/Real-wargame`
- Разрешённая основа: `f7eea38163be07c70d83314b5b6f3a1ae1cb5855`
- Рабочая ветка: `feature/20260725-shooting-stage-08-automatic-fire-suppression`
- Перенос в `real-wargame-preview`: не выполнялся

## Реализовано

- FireTask V2 для `single`, `short_burst`, `long_burst`, `suppress`.
- Миграция FireTask V1 как одиночного выстрела.
- Сохраняемый темп конкретного экземпляра оружия между задачами.
- ППШ из существующей опубликованной ревизии каталога.
- Отдельный атомарный `commitShot` для каждого патрона очереди.
- Сохраняемая частично выполненная очередь.
- Детерминированные опорные точки огня по области.
- Снимок непрерывности огня внутри физической пули.
- Физические события `near_miss`, `near_impact`, `direct_hit`.
- Окна подавления `0,2 с`, агрегация по источнику и затухание.
- Сохранение, загрузка и идемпотентный reconciliation.
- Расширенная диагностика автоматического огня и подавления.
- Нагрузочный сценарий на `4096` активных пуль.

## Не реализовано

- поведенческая реакция Graph v2;
- автоматический переход в лежачее положение;
- автоматический поиск укрытия или прекращение огня;
- готовая система пулемёта, установки и помощника;
- интерфейс;
- deployment;
- Playwright и Chromium;
- Stage 9.

## Performance impact

- hot path: фиксированный баллистический подшаг и атомарная фиксация каждого выстрела очереди;
- worst-case complexity: `O(projectile pool capacity + local spatial candidates + bounded suppression events)`;
- main-thread work: один принятый боевой конвейер, без второго таймера;
- full-map builds: отсутствуют;
- shared prepared data: существующие `CombatUnitSpatialIndex`, `MapObjectSpatialIndex`, крупная геометрия тела и пул пуль;
- worker and queue budget: workers не добавлены; события ограничены заранее выделенным буфером;
- cache owner/key/limit: новых кэшей источника истины нет; только восстанавливаемые scratch-буферы, привязанные к runtime;
- invalidation revisions: не применимо к синхронному фиксированному шагу; состояние сохраняется напрямую;
- memory estimate: дополнительный `Float64Array(4096)` — 32768 байт; буфер ссылок на 32768 событий — примерно 256 КиБ плюс фактически созданные ограниченные записи текущего подшага;
- teardown: scratch хранится в `WeakMap` и освобождается вместе с runtime; источники истины сериализуемы;
- before metrics: точная разрешённая база Stage 7;
- after metrics: ожидаются от обязательного Stage 8 smoke и независимого PR Risk CI;
- exact-head enforced workflow: ожидается;
- remaining risks: итоговые численные коэффициенты подавления требуют будущей калибровки на испытательном стенде, но не меняют архитектурный контракт.

## Verification selection

Обязательны:

- `npm run infantry-combat-stage8:smoke`
- `npm run infantry-combat-stage8:forbidden-scan`
- `npm run infantry-combat-stage8:verify`
- TypeScript и production build
- сохранённые проверки Stage 5–7
- проверки каталогов, действий, движения, восприятия и Graph v2

Тяжёлые браузерные проверки сознательно не запускаются: задание запрещает Playwright/Chromium и не меняет браузерный сценарий или интерфейс.

`TESTED_IMPLEMENTATION_HEAD: none`

## Результат проверки

Заполняется после независимого запуска точного HEAD.
