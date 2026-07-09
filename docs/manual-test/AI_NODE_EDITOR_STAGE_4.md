# Manual test — AI Node Editor Stage 4 Authoring + GraphRunner

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Назначение: проверить чистый canvas редактора, универсальные ноды без старых точечных legacy-нод, GraphRunner/UtilitySelector v1, первый мост с выбранным бойцом на карте, общий запуск, паузу и подсветку последнего решения ИИ.

## Основной запуск

Запустить двойным кликом:

```text
Run-Real-Wargame-Lab.bat
```

Ожидание:

```text
открывается lab-launch.html;
открывается вкладка игры http://127.0.0.1:5173/;
открывается вкладка редактора http://127.0.0.1:5173/ai-node-editor.html;
окна Vite/local engine/lab manager не торчат отдельными видимыми консолями;
в игре есть верхнее меню: Редактор ИИ солдат / Новая игра / Выход;
в редакторе есть верхнее меню: Обновить / Открыть игру / Выход;
в игре есть HUD-кнопка Пауза: выкл/вкл.
```

## Проверка выхода

В игре или редакторе нажать:

```text
Выход
```

Ожидание:

```text
вкладки игры/редактора получают сигнал закрытия;
local lab manager вызывает http://127.0.0.1:8799/lab/shutdown;
процессы Vite и local AI engine гасятся.
```

Ограничение: браузер может запретить `window.close()` для вкладок, открытых вручную. Тогда вкладка может остаться, но серверные процессы должны быть остановлены.

## Ожидание после открытия редактора

```text
на canvas только одна нода: Старт;
старое дерево survival/continue/observe не появляется;
если раньше был старый localStorage, он не должен вернуться, потому что редактор использует storage v6;
в правой верхней части canvas может быть маленькая панель “След ИИ”; если живого расчёта ещё не было, она пишет что решения пока нет.
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

## Проверка select-полей: баг мгновенного сброса

Выбрать любую ноду с человеческой панелью и поменять несколько select-полей:

```text
Проверка флага:
  flagKey: underFire → hasOrder → enemyVisible
  expected: true → false → true

Порог расстояния:
  from: self → cover → self
  to: cover → enemy → cover
  comparison: closer → farther → closer

Действие:
  action: move_to → wait → continue_order
```

Ожидание:

```text
select не сбрасывается мгновенно;
панель не исчезает;
выбранный пункт остаётся до следующего осознанного действия пользователя;
после Save parameters выбранные значения попадают в parameters JSON.
```

Если select снова мгновенно сбрасывается, смотреть:

```text
src/ai-node-editor/editor-click-guard.ts
ai-node-editor.html — guard должен грузиться до main.ts
src/ai-node-editor/main.ts — closeContextMenuIfNeeded / document click handling
src/ai-node-editor/human-node-ui.ts — MutationObserver и renderHumanInspectorForSelectedNode
```

## Проверка обычной цепочки goal

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
вкладка игры читает этот же граф из localStorage v6;
если выбранный боец находится под давлением/огнём, над ним появляется фраза;
положение бойца в инспекторе поведения становится prone.
```

## Проверка GraphRunner + UtilitySelector v1

Собрать граф:

```text
Старт
  → Лучший выбор / UtilitySelector
      → Вариант действия: Лечь под огнём
          → Проверка флага: underFire = true
          → Оценка параметра: danger, Добавить, weight = 1
          → Реплика бойца: Под огнём!
          → Поза: prone
      → Вариант действия: Продолжать приказ
          → Проверка флага: hasOrder = true
          → Оценка параметра: morale, Добавить, weight = 1
          → Действие: continue_order
```

Ожидание:

```text
Validate проходит;
local engine evaluate-once возвращает scores/breakdown для веток;
если выбранный боец под огнём и danger выше morale — побеждает ветка “Лечь под огнём”;
над бойцом появляется реплика, поза становится prone;
если изменить score/условия так, что вторая ветка сильнее — должна победить ветка continue_order.
```

## Проверка подсветки последнего решения ИИ

1. В редакторе оставить открытым граф из предыдущего пункта.
2. В игре выбрать бойца.
3. Дождаться хотя бы одного тика ИИ.
4. В игре нажать `Пауза: выкл`, чтобы стало `Пауза: вкл`, или нажать клавишу `P`.
5. Вернуться в редактор.

Ожидание:

```text
в редакторе появляется панель “След ИИ”;
панель показывает выбранного бойца, победившую ветку, итоговое объяснение и очки веток;
прошедшие ноды подсвечены;
проваленные ноды подсвечены иначе;
score-ноды имеют badge с +очками или -очками;
победившая ветка выделена сильнее остальных;
если ветка запрещена через ForbidAction — она получает veto/запрет;
на паузе подсветка остаётся на последнем расчёте и не “убегает”.
```

Смысл: это не пошаговая анимация реального времени, а визуальный след последнего быстрого просчёта GraphRunner.

## Проверка pause

В игре нажать:

```text
Пауза: выкл → Пауза: вкл
```

или клавишу:

```text
P
```

Ожидание:

```text
в HUD кнопка меняет текст на Пауза: вкл;
в debug panel написано, что пауза включена;
симуляционный tick остановлен;
карта/HUD продолжают отрисовываться;
последний AI trace остаётся видимым в редакторе.
```

## Проверка score-ноды «Оценка параметра»

Добавить:

```text
Оценка параметра
```

Ожидание:

```text
sourceKey / Параметр — selector: danger, stress, suppression, fatigue, morale, health, ammo, distanceToCover;
direction / Направление — selector: Добавить / Вычесть;
weight — число;
в UtilitySelector эта нода влияет на score ветки.
```

## Проверка score-ноды «Оценка расстояния»

Добавить:

```text
Оценка расстояния
```

Ожидание:

```text
targetKind / Объект — selector;
preference / Лучше когда — selector: Ближе / Дальше;
idealMeters и weight — числа;
в UtilitySelector эта нода влияет на score ветки.
```

## Проверка запрета действия

Внутрь ветки с `Действие: continue_order` добавить:

```text
Запрет действия:
  action = continue_order
  durationSeconds = 3
```

Ожидание:

```text
ветка с continue_order получает veto;
UtilitySelector выбирает другую проходящую ветку, если она есть;
в local engine JSON у score ветки виден vetoed=true / vetoReason;
в runtime-подсветке такая ветка помечается как запрещённая.
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
message/messageRu у Реплики бойца;
UtilitySelector graph возвращает scores/breakdown/effects в evaluate-once.
```

## Что этот этап уже связывает с игрой

```text
выбранный боец на карте;
graph из localStorage v6;
blackboard из текущей игры: danger, stress, underFire, hasOrder, distanceToCover;
GraphRunner v1;
UtilitySelector v1;
ParameterScore / DistanceScore / DecisionInertia / RandomChance;
StableThreshold / ForbidAction;
FindBestObject для ближайшего укрытия;
SetAction для простого move_to/wait/continue_order и других action-меток;
SetPosture для stand/crouch/prone;
SetMovementMode как запись режима поведения;
SayMessage как фраза над бойцом;
cooldownSeconds/cooldownTiming в живом bridge;
runtime debug trace через real-wargame.ai-node-editor.debug.v1;
подсветка последнего решения ИИ в редакторе;
пауза через HUD-кнопку и клавишу P.
```

## Что этот этап ещё НЕ делает

```text
не делает полноценный умный ИИ всей игры;
не двигает всех бойцов сразу — мост работает с выбранным бойцом;
не делает squad AI;
не делает WebSocket;
не делает worker_threads;
не делает настоящую пошаговую анимацию расчёта — пока это подсветка последнего уже выполненного trace.
```

## Что прислать в чат при ошибке

1. Текст из окна `Run-Real-Wargame-Lab.bat` или `Run-AI-Node-Editor.bat`.
2. Что написано внизу в `Validation / Engine result`.
3. Что показывает панель `След ИИ` в редакторе.
4. Что именно делал: add / drag / pan / zoom / port-link / context-menu / save / export / import / select / UtilitySelector / pause.
5. Если ошибка после `Validate`, прислать JSON ошибки из нижнего окна.
