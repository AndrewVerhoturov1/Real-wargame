# Manual test — AI Node Editor Stage 4 Authoring

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Назначение: проверить чистый canvas редактора, универсальные ноды без старых точечных legacy-нод и первый мост с выбранным бойцом на карте.

## Запуск

Запустить двойным кликом:

```text
Run-AI-Node-Editor.bat
```

Откроется:

```text
http://127.0.0.1:5173/ai-node-editor.html
```

Для проверки связи с игрой открыть вторую вкладку:

```text
http://127.0.0.1:5173/
```

## Ожидание после открытия

```text
на canvas только одна нода: Старт;
старое дерево survival/continue/observe не появляется;
если раньше был старый localStorage, он не должен вернуться, потому что редактор использует storage v6.
```

## Быстрая проверка

Нажать сверху:

```text
Auto 4–5
```

Ожидание:

```text
Point 4 OK / Пункт 4 OK
Point 5 OK / Пункт 5 OK
```

Важно: evaluate-once на чистом canvas не обязан выдавать живую боевую команду. Он должен честно сказать, что граф валиден, но нода действия ещё не добавлена.

## Проверка чистой палитры

Открыть:

```text
+ Add node
```

В палитре должны быть универсальные ноды:

```text
Числовой порог
Проверка флага
Порог расстояния
Тактическая проверка
Оценка параметра
Оценка расстояния
Поиск объекта
Выбор цели
Запись памяти
Копия памяти
Действие
Режим движения
Поза
Реплика бойца
Стабильный порог
Запрет действия
Объяснение
```

В палитре НЕ должно быть старых точечных нод:

```text
Есть приказ
Враг виден
Враг известен
Под огнём
Рядом есть укрытие
Оценка опасности
Оценка стресса
Найти укрытие
Движение к укрытию
Продолжать приказ
Наблюдать
```

Их замены:

```text
Есть приказ        → Проверка флага: hasOrder = true
Враг виден         → Проверка флага: enemyVisible = true
Враг известен      → Проверка флага: enemyKnown = true
Под огнём          → Проверка флага: underFire = true
Рядом есть укрытие → Тактическая проверка: cover_exists = true
                   → или Поиск объекта: objectKind = cover
Продолжать приказ  → Действие: continue_order
Наблюдать          → Действие: wait или отдельная будущая настройка observe в Действие
```

## Проверка цепочки goal

Собрать цепочку:

```text
Старт
  → Проверка флага
  → Реплика бойца
  → Поза
```

Настроить:

```text
Проверка флага:
  flagKey = underFire
  expected = true

Реплика бойца:
  messageRu = Под огнём!
  message = Under fire!
  durationSeconds = 2

Поза:
  posture = prone
```

Ожидание:

```text
Validate проходит;
local engine больше не ругается, что condition/action ноды имеют children;
вкладка игры читает этот же граф из localStorage v6;
если выбранный боец находится под давлением/огнём, над ним появляется фраза;
положение бойца в инспекторе поведения становится prone.
```

## Проверка ноды «Числовой порог»

Добавить:

```text
Числовой порог
```

Ожидание:

```text
справа человеческая панель без JSON на первом уровне;
есть выбор параметра из списка;
есть кнопки Параметр выше порога / Параметр ниже порога;
есть ползунок порога;
есть тестовое значение и PASS/FAIL;
есть блок Задержка ноды.
```

Проверить режим ниже:

```text
sourceKey = morale
comparison = below
threshold = 30
preview value = 25
```

Ожидание:

```text
формула показывает 25 < 30;
результат PASS;
Save parameters сохраняет sourceKey + comparison + threshold + cooldownSeconds + cooldownTiming.
```

## Проверка селекторов вместо ручного псевдокода

### Порог расстояния

Добавить:

```text
Порог расстояния
```

Ожидание:

```text
from / Откуда — selector, а не свободный текст;
self / Сам боец — пункт списка;
to / Куда — selector;
comparison / Режим — selector: Ближе чем / Дальше чем;
thresholdMeters — число.
```

### Оценка параметра

Добавить:

```text
Оценка параметра
```

Ожидание:

```text
sourceKey / Параметр — selector: danger, stress, suppression, fatigue, morale, health, ammo, distanceToCover;
direction / Направление — selector: Добавить / Вычесть;
weight — число.
```

### Оценка расстояния

Добавить:

```text
Оценка расстояния
```

Ожидание:

```text
targetKind / Объект — selector;
preference / Лучше когда — selector: Ближе / Дальше;
idealMeters и weight — числа.
```

### Запрет действия / Действие / Инерция решения

Ожидание:

```text
action выбирается из списка, а не вводится как псевдокод;
доступны move_to, fire, reload, retreat, wait, suppress, continue_order.
```

## Проверка задержки ноды

Выбрать любую ноду.

Ожидание в правой панели:

```text
Задержка, секунд
Когда работает задержка
До ноды
После ноды
```

Смысл:

```text
До ноды — сначала ждёт, потом нода может сработать;
После ноды — нода срабатывает, потом уходит в задержку.
```

## Проверка через local engine

Нажать:

```text
Validate
```

Ожидание:

```text
validation.valid = true
```

Проверяются:

```text
известные типы нод;
сломанные child-связи;
sourceKey / comparison / threshold;
from/to как значения из selector;
cooldownSeconds >= 0;
cooldownTiming = before или after;
message/messageRu у Реплики бойца.
```

## Что этот этап уже связывает с игрой

```text
выбранный боец на карте;
graph из localStorage v6;
blackboard из текущей игры: danger, stress, underFire, hasOrder, distanceToCover;
FlagCheck / Числовой порог / Порог расстояния / TacticalCheck;
FindBestObject для ближайшего укрытия;
SetAction для простого move_to/wait/continue_order и других action-меток;
SetPosture для stand/crouch/prone;
SetMovementMode как запись режима поведения;
SayMessage как фраза над бойцом;
cooldownSeconds/cooldownTiming в живом bridge.
```

## Что этот этап ещё НЕ делает

```text
не делает полноценный умный ИИ;
не исполняет все scoring-ноды как настоящий utility selector;
не двигает всех бойцов сразу — мост работает с выбранным бойцом;
не делает WebSocket;
не делает worker_threads.
```

## Что прислать в чат при ошибке

1. Текст из окна `Run-AI-Node-Editor.bat`.
2. Что написано внизу в `Validation / Engine result`.
3. Что именно делал: add / drag / pan / zoom / port-link / context-menu / save / export / import.
4. Если ошибка после `Validate`, прислать JSON ошибки из нижнего окна.
