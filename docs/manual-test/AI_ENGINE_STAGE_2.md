# Manual test — Local AI Engine Stage 2

Дата: 2026-07-09  
Ветка: `real-wargame-preview`  
Назначение: проверить headless local AI engine без визуального редактора и без запуска боя.

## Что проверяется

Этот тест проверяет второй этап подпроекта `ai-single-unit-editor`:

```text
local engine запускается отдельным Node.js процессом;
браузер не выполняет тяжёлые AI-расчёты;
engine отвечает на health;
engine валидирует bundled JSON-граф одиночного солдата;
engine выполняет один расчёт evaluate-once и возвращает объяснение решения.
```

## Вариант A — автоматическая проверка через один батник

Запустить двойным кликом:

```text
Run-AI-Engine-Smoke.bat
```

Ожидаемый результат в окне:

```text
[OK] /engine/health отвечает, тяжёлый ИИ не заявлен как браузерный.
[OK] /ai/graph/validate проверил bundled soldier graph.
[OK] /ai/graph/evaluate-once выбрал уход к укрытию для опасной ситуации.
[GOTOVO] Local AI engine smoke passed.
```

После проверки батник открывает папку:

```text
artifacts/ai-engine/
```

В ней должны появиться:

```text
01-health.json
02-validation.json
03-evaluate-once.json
```

В `03-evaluate-once.json` руками проверить:

```text
selectedBranchNodeId = critical_survival
command.type = move_to
explanationRu объясняет, что солдат выбрал укрытие из-за высокой опасности/стресса
```

## Вариант B — ручной запуск движка

Запустить двойным кликом:

```text
Run-AI-Engine.bat
```

Батник откроет отдельное окно local AI engine и браузер со страницей:

```text
http://127.0.0.1:8787/engine/health
```

В браузере должен быть JSON:

```json
{
  "ok": true,
  "service": "real-wargame-local-ai-engine",
  "mode": "headless-local-engine",
  "browserDoesHeavyAi": false
}
```

Окно `Real-Wargame AI Engine` нужно оставить открытым, пока нужен local engine.

## Что этот этап ещё НЕ проверяет

```text
не проверяет визуальный AI Node Editor;
не открывает ai-node-editor.html;
не подключает AI-граф к живому SimulationTick;
не двигает настоящего солдата на карте;
не запускает бой;
не проверяет WebSocket;
не проверяет worker_threads.
```

Это нормальные ограничения второго этапа.

## Что прислать в чат, если проверка упала

1. Текст из окна `Run-AI-Engine-Smoke.bat`.
2. Содержимое папки `artifacts/ai-engine/`, если она успела создаться.
3. Уточнение: запускался ли батник из актуальной папки `Real-wargame-preview`.
