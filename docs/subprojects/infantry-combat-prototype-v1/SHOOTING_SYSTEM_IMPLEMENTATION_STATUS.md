# Статус внедрения новой системы стрелкового боя

## Состояние программы

- **Программа:** новая система стрелкового боя.
- **Статус:** код этапа 1A и корректирующий проход проверены оркестратором; технических замечаний больше нет, но формальная приёмка заблокирована отсутствием обязательных общепроектных проверок.
- **Оркестраторская ветка:** `planning/20260722-shooting-system-implementation`.
- **Базовая ветка:** `real-wargame-preview`.
- **Проверенный preview HEAD:** `fe0ba5f16d91bb765366c0ad56525684b3e47527`.
- **Архитектурная ветка:** `planning/20260722-shooting-system-architecture`.
- **Проверенный architecture HEAD:** `58309fd1d7c5f436d57fb1136f077afa29f53eb5`.
- **Источник истины:** `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md` из architecture-ветки.
- **Расхождение preview с архитектурным baseline:** отсутствует.
- **Рабочая ветка этапа 1A:** `feature/20260722-shooting-stage-01a-catalog-core`.
- **Проверенный HEAD реализации:** `2792b09378b16ce5efda95d441168465d8abab2b`.
- **Сравнение с базой:** семь commits впереди, ноль позади, 15 изменённых файлов.
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
| 1A. Ядро каталогов | ожидает verification-only приёмки | `feature/20260722-shooting-stage-01a-catalog-core` @ `2792b093...` |
| 1B. Редакторы каталогов | заблокирован | только после полного PASS этапа 1A |
| 2A–3B | не начаты | coordinator, rifle shot и reload |
| 4–15 | не начаты | последовательные независимые этапы |

## Проверка этапа 1A

### Подтверждено оркестратором

- обязательный preview SHA соблюдён;
- рабочая ветка точно находится на `2792b09378b16ce5efda95d441168465d8abab2b`;
- полный этап находится на семь commits впереди базы и не отстаёт;
- полный diff содержит ровно 15 файлов этапа 1A;
- корректирующий diff содержит шесть commits, шесть изменённых файлов и не содержит новых файлов;
- runtime, save/load, UI, Graph v2, preview и main не затронуты;
- основные обязательные типы и публичные имена присутствуют;
- default definitions, exact revision lookup, defensive clone, transactional mutation и canonical serialization реализованы;
- stable weapon/loadout больше не могут зависеть от mutable draft;
- публикация с unstable dependency отклоняется до mutation;
- archived exact targets остаются допустимыми;
- multiple drafts одного definition ID запрещены для всех трёх каталогов;
- validation issues для multiple drafts не зависят от порядка массивов;
- `Date.now()` удалён из smoke wrappers;
- по отчёту исполнителя узкие smoke, node syntax checks, детерминированный source scan и целевая TypeScript-проверка прошли.

### Оставшийся блокер

На полном рабочем дереве с установленными зависимостями ещё не выполнены:

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

Без полного PASS этой матрицы этап 1A формально не принимается и этап 1B не начинается.

### Verification-only промт

`docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-verification-only.md`

Верификатор не меняет код и проверяет точный HEAD `2792b093...` на полном checkout.

## Временные адаптеры

Пока отсутствуют. После появления каждый временный адаптер обязан быть перечислен здесь с:

- путём;
- причиной;
- направлением зависимости;
- этапом удаления.

Целевой этап удаления всех временных combat adapters: **15**.

## Gates программы

- Stage 1B не начинается до полного PASS и формальной приёмки 1A.
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

Передать verification-only промт отдельному верификатору. После отчёта `PASS` повторно подтвердить точный HEAD и чистый diff, формально принять 1A и только затем готовить исполнительский промт 1B. Оркестратор не выполняет 1B до этой приёмки.
