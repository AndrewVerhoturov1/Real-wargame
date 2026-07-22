# Этап 1A — финальная verification-only приёмка

## Роль

Ты — отдельный верификатор этапа **1A новой системы стрелкового боя**. Ты не являешься техническим исполнителем этапа и не должен менять код. Твоя задача — проверить уже подготовленный точный HEAD на полном рабочем дереве с установленными зависимостями.

## Репозиторий и refs

Репозиторий:

`AndrewVerhoturov1/Real-wargame`

Базовая ветка программы:

`real-wargame-preview`

Обязательный preview SHA:

`fe0ba5f16d91bb765366c0ad56525684b3e47527`

Рабочая ветка этапа:

`feature/20260722-shooting-stage-01a-catalog-core`

Обязательный проверяемый HEAD:

`2792b09378b16ce5efda95d441168465d8abab2b`

Перед проверками fetch удалённые refs и подтверди:

1. `real-wargame-preview` точно равен обязательному preview SHA;
2. рабочая ветка точно равна обязательному проверяемому HEAD;
3. ветка находится на семь commits впереди preview и не отстаёт;
4. полный diff относительно preview содержит ровно 15 файлов этапа 1A.

Если любой ref отличается, не запускай проверки на другом коде. Зафиксируй фактические SHA и верни оркестратору отчёт о расхождении.

## Источники истины

Прочитай:

1. архитектуру `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md` из `planning/20260722-shooting-system-architecture` @ `58309fd1d7c5f436d57fb1136f077afa29f53eb5`;
2. первоначальный промт `docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core.md`;
3. корректирующий промт `docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core-review-fixes.md`;
4. этот verification-only промт.

## Запрет на изменения

Проверка должна выполняться на чистом checkout точного HEAD.

Запрещено:

- редактировать исходники или тесты;
- создавать commits;
- переписывать или force-push рабочую ветку;
- изменять `real-wargame-preview` или `main`;
- запускать deployment;
- запускать GitHub Actions, Playwright или Chromium;
- начинать этап 1B.

Установка зависимостей допустима только локально и не должна менять tracked-файлы. Если после установки изменился lockfile или другой tracked-файл, восстанови checkout перед проверками и сообщи об инфраструктурной проблеме.

## Обязательная матрица

На полном рабочем дереве с зависимостями выполни последовательно:

```bash
npm run combat-catalogs:smoke
npm run typecheck
npm run build
node --check scripts/combat_catalog_core_smoke.mjs
node --check scripts/combat_catalog_serialization_smoke.mjs
grep -R -nE 'Date\.now|performance\.now|Math\.random|randomUUID' \
  src/core/infantry-combat/catalogs \
  scripts/combat_catalog_core_smoke.ts \
  scripts/combat_catalog_core_smoke.mjs \
  scripts/combat_catalog_serialization_smoke.ts \
  scripts/combat_catalog_serialization_smoke.mjs
git diff --check fe0ba5f16d91bb765366c0ad56525684b3e47527...HEAD
git status --short
```

Ожидания:

- первые пять команд завершаются с exit code 0;
- `grep` не возвращает совпадений; exit code 1 при отсутствии совпадений является ожидаемым результатом, а не ошибкой этапа;
- `git diff --check` завершается с exit code 0;
- `git status --short` не выводит tracked или untracked изменений после удаления временных build-артефактов.

Если `npm run build` создаёт обычные ignored-артефакты, удали их после фиксации результата и повтори `git status --short`.

## Дополнительная сверка diff

Подтверди, что относительно `a99419d5143e2814936fde3a1645a9266a4412ce` изменены только:

- `scripts/combat_catalog_core_smoke.ts`;
- `scripts/combat_catalog_core_smoke.mjs`;
- `scripts/combat_catalog_serialization_smoke.ts`;
- `scripts/combat_catalog_serialization_smoke.mjs`;
- `src/core/infantry-combat/catalogs/CombatCatalogValidationReferences.ts`;
- `src/core/infantry-combat/catalogs/CombatCatalogValidationSupport.ts`.

Относительно preview полный этап должен содержать только:

- `package.json`;
- четыре catalog smoke-файла;
- десять файлов `src/core/infantry-combat/catalogs/`.

## Решение верификатора

Верни один из двух статусов:

### `PASS`

Только если выполнены все обязательные команды на точном HEAD и checkout остался чистым.

### `FAIL`

Если хотя бы одна команда не прошла, ref не совпал, checkout загрязнён или полная среда снова недоступна.

Статус `PARTIAL` не является приёмкой и не разблокирует этап 1B.

## Итоговый отчёт

Укажи:

1. фактические preview SHA и branch HEAD;
2. ahead/behind и число файлов полного diff;
3. точную команду и exit code каждой проверки;
4. ключевой stdout/stderr при любом падении;
5. результат grep с пояснением exit code;
6. финальный `git status --short`;
7. подтверждение отсутствия изменений и commits;
8. итоговый статус `PASS` или `FAIL`;
9. подтверждение, что preview, main, runtime, deployment и этап 1B не затронуты.
