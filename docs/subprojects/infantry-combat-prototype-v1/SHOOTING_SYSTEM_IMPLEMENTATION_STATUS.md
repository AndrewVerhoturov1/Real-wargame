# Статус внедрения новой системы стрелкового боя

## Состояние программы

- **Программа:** новая система стрелкового боя.
- **Статус:** технический план подготовлен; реализация runtime не начиналась.
- **Оркестраторская ветка:** `planning/20260722-shooting-system-implementation`.
- **Базовая ветка:** `real-wargame-preview`.
- **Проверенный preview HEAD:** `fe0ba5f16d91bb765366c0ad56525684b3e47527`.
- **Архитектурная ветка:** `planning/20260722-shooting-system-architecture`.
- **Проверенный architecture HEAD:** `58309fd1d7c5f436d57fb1136f077afa29f53eb5`.
- **Источник истины:** `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_SYSTEM_ARCHITECTURE.md` из architecture-ветки.
- **Расхождение preview с архитектурным baseline:** отсутствует.
- **Runtime-код новой системы:** не написан.
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

## Этапы

| Этап | Статус | Ветка / результат |
|---|---|---|
| 0. Архитектура | выполнен | `planning/20260722-shooting-system-architecture` @ `58309fd1...` |
| План внедрения | подготовлен | `plans/2026-07-22-shooting-system-rebuild.md` |
| 1A. Ядро каталогов | ожидает разрешения | `feature/20260722-shooting-stage-01a-catalog-core` пока не создана |
| 1B. Редакторы каталогов | заблокирован зависимостью | после принятия 1A |
| 2A–3B | не начаты | coordinator, rifle shot и reload |
| 4–15 | не начаты | последовательные независимые этапы |

## Первый предлагаемый этап

**1A — чистые каталоги, ревизии, проверка данных и JSON round-trip.**

Разрешённый scope:

- `src/core/infantry-combat/catalogs/**`;
- четыре узких smoke-файла;
- три команды в `package.json`.

Запрещённый scope:

- runtime стрельбы;
- `SimulationState`;
- `UnitModel`;
- `SceneExport`;
- UI/editor;
- movement/posture;
- Graph v2;
- старый combat runtime;
- deployment и browser checks.

Промт исполнителю:

`docs/subprojects/infantry-combat-prototype-v1/prompts/stage-01a-catalog-core.md`

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

Представить пользователю baseline, карту этапов, scope 1A и имя ветки. После явного разрешения создать техническую ветку 1A и передать сохранённый промт отдельному исполнителю. Оркестратор не реализует этап вместо исполнителя.
