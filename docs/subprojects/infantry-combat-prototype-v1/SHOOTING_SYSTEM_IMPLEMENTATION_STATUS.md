# Статус внедрения новой системы стрелкового боя

## Состояние программы

- **Программа:** новая система стрелкового боя.
- **Статус:** этап 1A реализован исполнителем, проверен оркестратором и возвращён на корректирующий проход; приёмка не выполнена.
- **Оркестраторская ветка:** `planning/20260722-shooting-system-implementation`.
- **Базовая ветка:** `real-wargame-preview`.
- **Проверенный preview HEAD:** `fe0ba5f16d91bb765366c0ad56525684b3e47527`.
- **Архитектурная ветка:** `planning/20260722-shooting-system-architecture`.
- **Проверенный architecture HEAD:** `58309fd1d7c5f436d57fb1136f077afa29f53eb5`.
- **Источник истины:** `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md` из architecture-ветки.
- **Расхождение preview с архитектурным baseline:** отсутствует.
- **Рабочая ветка этапа 1A:** `feature/20260722-shooting-stage-01a-catalog-core`.
- **Проверенный HEAD реализации:** `a99419d5143e2814936fde3a1645a9266a4412ce`.
- **Сравнение с базой:** один commit впереди, ноль позади, 15 изменённых файлов.
- **Preview изменён:** нет.
- **Main изменён:** нет.
- **Deployment:** не запускался.
- **GitHub Actions / Playwright / Chromium:** не запускались.

## Текущий baseline

1. Старый combat runtime активен в `SimulationTickLegacy.ts`.
2. `FireAction` и `WeaponModel` используют runtime-only `WeakMap`.
3. `SceneExport.ts` сохраняет старые `runtime.weapon` и `runtime.combat`.
4. Длительная posture transition сериализуема и имеет `ownerToken`.
5. `MapObjectGeometry`, `MapObjectSpatialIndex`, `BallisticLineProbe`, movement, perception contacts и общий scene save/load пригодны для расширения.
6. Текущий `BallisticTrace` использует spatial index объектов, но перебирает все units; это отмечено как performance risk этапа 4.
7. Action-port physical runtime является отдельной текущей работой подпроекта. Новая shooting system не должна продолжать firing-часть action ports через старый `requestFireAction`.

## Пояснение нумерации плана

В основном плане использовались два числа одновременно:

- первое число перед заголовком — номер раздела документа;
- число после слова «Этап» — номер технического этапа.

Поэтому заголовок `12. Этап 4` не означал переход от этапа 3 к этапу 12. Фактическая последовательность остаётся: `3A → 3B → 4 → 5 → ... → 15`. В дальнейших отчётах оркестратор использует только номера технических этапов.

## Этапы

| Этап | Статус | Ветка / результат |
|---|---|---|
| 0. Архитектура | выполнен | `planning/20260722-shooting-system-architecture` @ `58309fd1...` |
| План внедрения | подготовлен | `plans/2026-07-22-shooting-system-rebuild.md` |
| 1A. Ядро каталогов | изменения запрошены | `feature/20260722-shooting-stage-01a-catalog-core` @ `a99419d...` |
| 1B. Редакторы каталогов | заблокирован | только после формальной приёмки 1A |
| 2A–3B | не начаты | coordinator, rifle shot и reload |
| 4–15 | не начаты | последовательные независимые этапы |

## Проверка этапа 1A

### Подтверждено

- обязательный base SHA соблюдён;
- ветка находится ровно на один commit впереди базы и не отстаёт;
- изменены только catalog-core, четыре smoke-файла и три package commands;
- runtime, save/load, UI, Graph v2, preview и main не затронуты;
- основные обязательные типы и публичные имена присутствуют;
- default definitions, exact revision lookup, defensive clone, transactional mutation и canonical serialization реализованы;
- локальные целевые smoke по отчёту исполнителя прошли.

### Блокирующие замечания

1. **Stable revision может зависеть от mutable draft.** Текущая reference validation принимает target любой status. Published/archived weapon может ссылаться на draft ammo, а published/archived loadout — на draft weapon. Последующее сохранение draft меняет фактический смысл опубликованной записи.
2. **Validator допускает несколько draft одного ID.** Проверяется только уникальность `ID + revision`, хотя registry APIs предполагают единственный draft для definition ID.
3. **В smoke wrappers используется wall-clock.** Оба `.mjs` применяют `Date.now()` для query suffix, несмотря на прямой запрет этапа.
4. **Scope-процесс нарушен.** Помимо закрытого исходного списка без согласования созданы четыре дополнительных validation helper-файла. Оркестратор ретроспективно разрешил их сохранить как узкий внутренний scope amendment, но нарушение зафиксировано.
5. **Общепроектные проверки отсутствуют.** `npm run typecheck` и `npm run build` не выполнялись. Они обязательны перед формальной приёмкой корректирующего HEAD.

### Корректирующий промт

`docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core-review-fixes.md`

Исправления выполняются на той же рабочей ветке поверх `a99419d...`. Этап 1B не начинается.

## Временные адаптеры

Пока отсутствуют. После появления каждый временный адаптер обязан быть перечислен здесь с:

- путём;
- причиной;
- направлением зависимости;
- этапом удаления.

Целевой этап удаления всех временных combat adapters: **15**.

## Gates программы

- Stage 1B не начинается до принятия 1A.
- Stage 2B не начинается до принятия 2A.
- Stage 3A не начинается до принятия 1B и 2B.
- Stage 3B не начинается до принятия 3A.
- Stage 5 не начинается до принятого benchmark stage 4.
- Graph v2 не меняется до stage 13.
- Action-port firing не переводится на новую систему до stage 14.
- Старый runtime не отключается и не удаляется до stage 15.
- Любой перенос в preview требует отдельного разрешения пользователя.
- Deployment требует отдельного разрешения, даже после переноса.

## Следующее действие оркестратора

Передать корректирующий промт отдельному исполнителю. После нового отчёта повторно проверить branch HEAD, diff от `a99419d...` и от base, semantic invariants, full typecheck/build и catalog smoke. Оркестратор не реализует исправления вместо исполнителя.
