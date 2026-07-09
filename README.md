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
- GitHub Actions screenshot smoke через Playwright/Chromium.

Главный смысл проекта на этом этапе — не “красивая RTS”, а удобная лаборатория карты, видимости, укрытий и будущего поведения солдат.

## Пользовательский запуск preview

Для ручной проверки использовать:

```text
scripts/windows/run-preview.bat
```

Не требовать от пользователя Git-команд, терминала, checkout, merge или ручного переключения веток.

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

Current active subproject:

```text
docs/subprojects/real-wargame-start/
```

Important subproject files:

```text
docs/subprojects/real-wargame-start/SUBPROJECT.md
docs/subprojects/real-wargame-start/subproject.json
docs/subprojects/real-wargame-start/JOURNAL.md
docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md
docs/subprojects/real-wargame-start/test-program.md
```

See `docs/subprojects/README.md` for the subproject system documentation.

## Commands for agents

```text
python scripts/subproject_context.py --list
python scripts/subproject_context.py real-wargame-start --brief
python scripts/subproject_context.py real-wargame-start --opencode
python scripts/subproject_context.py real-wargame-start --files
```
