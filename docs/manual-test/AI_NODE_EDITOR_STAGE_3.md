# Manual test — Visible AI Node Editor Stage 3

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Назначение: проверить видимый редактор нод одиночного солдата в отдельной вкладке.

## Что проверяется

Этот тест проверяет третий этап подпроекта `ai-single-unit-editor`:

```text
AI Node Editor открывается как отдельная HTML-страница;
в игре есть кнопка открытия редактора;
редактор показывает палитру нод;
редактор показывает граф нод и связи;
редактор показывает инспектор выбранной ноды;
редактор показывает статус local engine;
валидация и evaluate-once уходят в local engine через localhost API.
```

## Главный запуск через один батник

Запустить двойным кликом:

```text
Run-AI-Node-Editor.bat
```

Батник делает:

```text
1. проверяет npm;
2. ставит npm install, если node_modules нет;
3. запускает static smoke редактора;
4. запускает local AI engine на 127.0.0.1:8787;
5. запускает Vite dev-server на 127.0.0.1:5173;
6. открывает http://127.0.0.1:5173/ai-node-editor.html
```

## Что должно быть видно в браузере

На странице редактора:

```text
слева — палитра нод: FLOW / CONDITIONS / SCORES / QUERIES / ACTIONS / DEBUG;
в центре — видимый граф с карточками нод и линиями связей;
справа — инспектор выбранной ноды;
снизу — окно Validation / Engine result и Graph JSON preview;
сверху — статус local engine и кнопки проверки.
```

## Проверка кликами

1. Кликнуть по любой ноде в центре.

Ожидание:

```text
справа меняется инспектор;
показываются id, type, category, children, parameters.
```

2. Нажать:

```text
Проверить engine
```

Ожидание:

```text
engine status становится online;
в строке видно browserDoesHeavyAi=false.
```

3. Нажать:

```text
Проверить граф через engine
```

Ожидание:

```text
внизу появляется JSON с ok=true и validation.valid=true.
```

4. Нажать:

```text
Evaluate once
```

Ожидание:

```text
справа появляется JSON;
selectedBranchNodeId = critical_survival;
command.type = move_to;
explanationRu объясняет выбор укрытия.
```

5. Из тактической карты открыть редактор кнопкой:

```text
Редактор ИИ
```

Ожидание:

```text
открывается новая вкладка /ai-node-editor.html.
```

## Что этот этап ещё НЕ делает

```text
не даёт создавать новые ноды с сохранением в JSON;
не даёт перетаскивать ноды;
не даёт соединять ноды мышью;
не подключает AI-граф к живому SimulationTick;
не двигает настоящего солдата на карте;
не запускает WebSocket;
не запускает worker_threads.
```

Это нормальные ограничения третьего этапа: сейчас важны видимость редактора, отдельная вкладка и связь с local engine.

## Если проверка упала

Прислать в чат:

1. Текст из окна `Run-AI-Node-Editor.bat`.
2. Что видно в браузере.
3. Открылись ли окна `Real-Wargame AI Engine` и `Real-Wargame Dev`.
4. Если открылась страница, текст из блока `Validation / Engine result`.
