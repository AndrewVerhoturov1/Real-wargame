# Journal — Reactive Abort + Route Status v1

Дата: 2026-07-12  
Рабочая ветка: `feature/ai-reactive-route-status-v1`  
Целевая ветка для возможной будущей интеграции: `real-wargame-preview`  
Текущий статус: оставлено только во временной ветке

## Задача

Продолжить `Stateful AI Movement v1` и добавить реакцию на изменения во время длительного движения:

```text
новый приказ игрока
исчезновение цели
исчезновение собственного MoveOrder
отсутствие измеряемого прогресса
```

## Выбранное решение

Полный pathfinder не добавлялся.

Причина: текущий `SimulationTick` двигает бойца по прямой и ещё не имеет единого контракта препятствий движения. Добавление A* без такой основы создало бы ложное ощущение готовой навигации.

Вместо этого создан чистый трекер фактического прогресса:

```text
AiRouteStatus.ts
```

Он измеряет уменьшение расстояния до замороженной цели и формирует route status.

## TDD — pure tracker

### RED

Добавлен `route-status:smoke`, который потребовал:

- moving на старте;
- сброс таймера при прогрессе;
- stalled до тайм-аута;
- blocked после тайм-аута;
- player_override;
- target_lost;
- order_missing;
- arrived;
- корректную паузу.

Старые проверки и build оставались зелёными, новый route-status outcome был красным.

### GREEN

Добавлен `src/core/ai/AiRouteStatus.ts`.

Первый GREEN выявил ошибку первого кадра: начальный снимок немедленно становился `stalled`. Исправлено отдельной веткой начального состояния: первый корректный снимок остаётся `moving`.

## TDD — bridge

### RED

Bridge smoke потребовал экспортированную функцию:

```text
updateSelectedRouteStatus(state, nowMs)
```

Красным был только новый bridge contract.

### GREEN

`AiStatefulMoveGameBridge` теперь:

- читает активное movement execution state;
- измеряет прогресс выбранного бойца;
- публикует route memory;
- запускает runtime немедленно только при значимом событии;
- не удаляет приказ напрямую.

## Исправления после ревью

### Реальная пауза

Первоначально bridge проверял вымышленное поле `state.paused` напрямую. В игре пауза управляется через:

```text
AiTestLabRuntime.getAiTestPaused(state)
```

Bridge переведён на настоящий источник состояния.

Затем обнаружена вторая проблема: простая остановка обновлений на паузе приводила бы к мгновенной блокировке сразу после продолжения, потому что wall-clock время всё равно прошло.

Исправление:

```text
на каждом paused update
→ вычислить paused delta
→ сдвинуть startedAtMs
→ сдвинуть lastProgressAtMs
→ обновить lastCheckedAtMs
```

Теперь пауза полностью исключается из активного времени маршрута.

### Mapping реактивного события

Добавлена отдельная функция:

```text
buildReactiveRouteTickOptions(routeResult)
```

Проверено:

```text
blocked       → force + explicit cancel
target_lost   → force + explicit cancel
player_override → force без explicit cancel
order_missing → force без explicit cancel
```

Это важно, потому что `player_override` и `order_missing` уже имеют собственные правильные исходы внутри runtime.

### Изоляция debug по бойцу

Route-only debug update теперь сравнивает `payload.unitId` с выбранным бойцом. Статус маршрута одного юнита не должен попадать в карточку другого.

## TDD — русский интерфейс

Browser RED потребовал три новых поля:

```text
Считать маршрут заблокированным через, секунд
Минимальный заметный прогресс, клеток
Отменять, если цель исчезла
```

После GREEN:

- значения `2.5 / 0.05 / true` сохраняются автоматически;
- существующая нода без полей получает безопасные значения;
- пользователь может сохранить `3.5 / 0.1 / false`;
- JSON вручную редактировать не требуется.

## TDD — диагностика

Browser RED подтвердил, что старые сценарии проходят, а два новых падают только на отсутствующих строках маршрута.

После GREEN `След ИИ` показывает:

```text
Маршрут
Без прогресса
Причина прерывания
```

Созданы кадры:

```text
27-ai-running-move-node.png
28-ai-route-blocked.png
```

Кадры открыты после успешного browser run. Длинная русская причина читается и не перекрывает соседние строки.

## Производительность

Bridge poll остаётся лёгким. На каждом проходе не запускается полный граф.

Обычный проход:

```text
одно расстояние
несколько сравнений
несколько memory-полей
```

Полный runtime форсируется только при значимом событии.

## Безопасность

Сохранены правила:

- никакой прямой очистки приказа route tracker-ом;
- только `clear_move` через runtime;
- обязательное совпадение `ownerToken` в bridge;
- приказ игрока имеет приоритет;
- graph version остаётся `1`;
- `main` не изменяется;
- preview не изменяется в этом этапе.

## Что сознательно отложено

- obstacle-aware movement;
- grid pathfinding;
- waypoint following;
- route replanning;
- cover reservation;
- массовый запуск ИИ;
- scene persistence route state.

## Следующая работа

```text
Grid Pathfinding v1
```

Он должен использовать уже созданный route-status контракт вместо создания второй параллельной системы состояния.

## Правило передачи

Любой следующий агент обязан начинать с:

```text
docs/subprojects/ai-single-unit-editor/REACTIVE_ROUTE_STATUS_V1.md
docs/superpowers/specs/2026-07-12-ai-reactive-route-status-v1-design.md
docs/superpowers/plans/2026-07-12-ai-reactive-route-status-v1.md
```

Не переносить ветку в `real-wargame-preview` без новой прямой команды пользователя.
