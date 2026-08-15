# Шаблон карты состояния проекта «Перенос Полигона»

## Цель

Карта должна за несколько секунд показывать: где проект, что готово, что в работе, кто отвечает, какие есть зависимости и какая следующая интеграция.

## Дорога проекта

```text
[Анализ и план ✓]
        ↓
[UI Shell + LIVE Unit]
        ↓
[Info / Attention / Memory LIVE]
        ↓
[Program ↔ Journal LIVE]
        ↓
        ├──────────────► [ИСТОРИК: History / viewTime / timeline]
        │
        └──────────────► [ХРОНИСТ: Metrics / Laboratory / Series / Save]
                              ↓
                    [Сквозная интеграция]
                              ↓
                    [Полный planned-scope acceptance]
                              ↓
                    [GO → real-wargame-preview]
                              ↓
                    [отдельный запрос → deployment]
```

History больше не должен рисоваться как последовательный обязательный блокер Metrics/Lab/Series. После стабильных Run/Event IDs две длинные дорожки могут идти параллельно.

## Пять дорожек исполнителей

```text
АРКА      | shell / layout / visual integration
ПУЛЬС     | selection / UnitModel / LIVE commands
ЛИНЗА     | Info / Attention / Memory LIVE
ХРОНИСТ   | Journal LIVE / Metrics / Lab / Series / rerun / Save
ИСТОРИК   | HistoryProvider / viewTime / timeline / historical projections
```

## Статусы

```text
○ НЕ НАЧАТО
● В РАБОТЕ
✓ ПРИНЯТО
◇ ЖДЁТ ЗАВИСИМОСТЬ
! БЛОКЕР / НУЖНО РЕШЕНИЕ
↺ НА ДОРАБОТКЕ
```

У принятого узла обязательно указывается exact accepted SHA.

## Один маркер «МЫ ЗДЕСЬ»

На карте всегда ровно один основной маркер `★ МЫ ЗДЕСЬ`. Параллельные задачи отмечаются `В РАБОТЕ`, но не создают несколько главных маркеров.

## Минимальная карточка задачи

```text
Название
Статус
Исполнитель
Результат
Зависимость / следующий переход
SHA — только если принят
```

## Текущий сложный блок ХРОНИСТА

Отображать вертикали C1–C10 из `CHRONIST_IMPLEMENTATION_PLAN.md` как drill-down, а не разворачивать все на главной карте.

На главной карте достаточно:

```text
ХРОНИСТ
C1 Run/Event identity
→ Journal LIVE
→ Metrics
→ Laboratory
→ Series/persistence
→ deterministic rerun
→ Full Save/Open
```

## Отдельный блок ИСТОРИКА

```text
ИСТОРИК
HistoryProvider
→ viewTime/LIVE-HISTORY
→ global timeline
→ historical map/right panel
→ future leakage acceptance
→ recorded replay, если выбран
```

## Точки интеграции

1. АРКА + ПУЛЬС → первый LIVE Unit.
2. АРКА + ЛИНЗА → Right Panel LIVE.
3. АРКА + ХРОНИСТ → Program ↔ Journal LIVE.
4. ХРОНИСТ C1 + ИСТОРИК → stable Run/Event refs для History.
5. АРКА + ХРОНИСТ → Metrics/Lab/Series UI поверх product owners.
6. АРКА + ИСТОРИК + ЛИНЗА/ПУЛЬС → HISTORY view.
7. Все дорожки → full planned-scope acceptance.

## Ворота решений пользователя

Отдельными `◆ РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ` остаются:

- Unit Editor authoring/LIVE;
- persistence policy;
- Metrics first-version scope, если нужен этапный ввод;
- классы Laboratory `Apply Globally`;
- replay promise: frozen rerun или recorded historical replay;
- GO на transfer;
- отдельное разрешение deployment.

## Обновление карты

После каждого проверенного handoff оркестратор:

1. сверяет exact SHA;
2. меняет статус узла;
3. записывает accepted SHA;
4. фиксирует blocker/dependency;
5. обновляет ближайшую интеграцию;
6. при необходимости перемещает единственный `★ МЫ ЗДЕСЬ`.

Главная карта должна оставаться читаемой на одном экране; технические детали уходят в план/контракт соответствующего исполнителя.
