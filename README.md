# Real-wargame

Real-wargame — прототип 2D tactical command game / Soldier Behavior Lab на **Vite + TypeScript + PixiJS**.

Активная работа идёт в ветке:

```text
real-wargame-preview
```

`main` остаётся стабильной базой. Содержательные изменения сначала попадают в `real-wargame-preview`; перенос в `main` делается только после явного GO человека.

## Текущее состояние preview

Этап RTS-заготовки в целом готов. Дальше он считается рабочей основой, которую можно править по ходу разработки поведения солдат.

В preview сейчас есть:

- большая тактическая карта `64×40`, `1 клетка = 10 м`;
- PixiJS-отрисовка карты, объектов, зон, юнитов и приказов;
- зум колесом мыши и перетаскивание карты средней кнопкой или `Space + drag`;
- игровой режим с верхним меню, правыми вкладками и нижней карточкой юнита;
- режим редактора с вкладками, без длинной правой “простыни”;
- кисти высот `-2..+4` и леса `0/1/2`;
- физическая карта высот с кривыми цветными зонами вместо текстовых `+1` на каждой клетке;
- отдельный слой `Реальный рельеф`, который показывает сглаженную высоту для расчёта видимости;
- Alt-линия видимости: зелёная часть видна, красная часть закрыта, расстояния в метрах;
- объекты с физической высотой `losHeightMeters` для линии видимости;
- знания выбранного юнита: ближние укрытия, дальние укрытия для плана, опасность;
- экспорт и загрузка JSON сцены;
- отчёт производительности из браузера;
- GitHub Actions screenshot smoke через Playwright/Chromium;
- data contract AI-графа одиночного солдата;
- headless local AI engine для проверки bundled AI-графа через localhost API.

Главный смысл проекта на этом этапе — не “красивая RTS”, а удобная лаборатория карты, видимости, укрытий и будущего поведения солдат.

## Пользовательский запуск preview

Для ручной проверки тактической карты использовать:

```text
Run-Real-Wargame.bat
```

Для ручной проверки local AI engine stage 2 использовать:

```text
Run-AI-Engine-Smoke.bat
```

Если нужен просто запущенный engine и health JSON в браузере:

```text
Run-AI-Engine.bat
```

Не требовать от пользователя Git-команд, терминала, checkout, merge или ручного переключения веток.

## Local AI Engine stage 2

Текущий local AI engine — headless-проверка для подпроекта `ai-single-unit-editor`.

Он проверяет:

```text
GET  /engine/health
POST /ai/graph/validate
POST /ai/graph/evaluate-once
```

Подробная ручная проверка:

```text
docs/manual-test/AI_ENGINE_STAGE_2.md
```

Ограничение: этот этап ещё не открывает визуальный AI Node Editor и не подключает граф к живому `SimulationTick`.

## Agent startup

Start here:

```text
docs/ai/AGENT_START_HERE.md
```

Then read:

```text
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/SKILLS_INDEX.md
```

If the task asks to run the game locally, open the preview build, capture screenshots, show the game in chat, inspect a GitHub Actions screenshot artifact, or prepare terminal-free launch instructions, read this skill first:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

## Subprojects

Current active subprojects:

```text
docs/subprojects/real-wargame-start/
docs/subprojects/ai-single-unit-editor/
```

Important subproject files:

```text
docs/subprojects/real-wargame-start/SUBPROJECT.md
docs/subprojects/real-wargame-start/subproject.json
docs/subprojects/real-wargame-start/JOURNAL.md
docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md
docs/subprojects/real-wargame-start/test-program.md
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/JOURNAL.md
docs/subprojects/ai-single-unit-editor/LOCAL_ENGINE_NODE_EDITOR_IMPLEMENTATION_PLAN.md
```

See `docs/subprojects/README.md` for the subproject system documentation.

## Commands for agents

```text
python scripts/subproject_context.py --list
python scripts/subproject_context.py real-wargame-start --brief
python scripts/subproject_context.py real-wargame-start --opencode
python scripts/subproject_context.py real-wargame-start --files
python scripts/subproject_context.py ai-single-unit-editor --brief
python scripts/subproject_context.py ai-single-unit-editor --opencode
python scripts/subproject_context.py ai-single-unit-editor --files
```
