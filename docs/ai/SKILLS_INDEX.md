# Skills Index

Общий индекс skills проекта `Real-wargame`.

Цель файла — дать внешнему чату и Codex быстрый маршрут: какой skill читать под конкретную задачу. Не нужно читать все skills подряд.

## Главное правило

Если задача явно подходит под skill, сначала прочитать соответствующий `SKILL.md`, потом уже менять код/документы.

## Проектные skills

| Skill | Путь | Когда читать |
|---|---|---|
| Real-Wargame local preview | `.agents/skills/real-wargame-local-preview/SKILL.md` | Локальный запуск, preview, скриншоты, GitHub Actions artifact, Playwright, “покажи игру”, терминал-фри запуск для пользователя. |
| PixiJS router | `.agents/skills/pixijs/SKILL.md` | Любая задача по PixiJS, canvas, 2D-графике, сцене, объектам, интерактивности, рендеру. |

## PixiJS skills

Для PixiJS не выбирать skill наугад. Сначала открыть навигационный индекс:

```text
docs/ai/PIXIJS_SKILLS_INDEX.md
```

Затем читать:

```text
.agents/skills/pixijs/SKILL.md
```

и только после этого релевантные узкие PixiJS skills.

Частые маршруты:

| Ситуация | Читать |
|---|---|
| Новая PixiJS-логика приложения | `pixijs`, `pixijs-application`, при необходимости `pixijs-core-concepts` |
| Карта, заливки, линии, зоны, формы | `pixijs`, `pixijs-scene-graphics` |
| Юниты, спрайты, маркеры | `pixijs`, `pixijs-scene-sprite` или `pixijs-scene-graphics` |
| Клики, drag, колесо мыши, выбор юнита | `pixijs`, `pixijs-events` |
| Производительность/FPS/много объектов | `pixijs`, `pixijs-performance` |
| Миграция v7/v8 или ошибка API PixiJS | `pixijs`, `pixijs-migration-v8` |

## Local preview / screenshots

Если задача звучит так:

```text
запусти локально
покажи игру
сделай скриншоты
проверь preview
скачай artifact
проверь GitHub Actions screenshots
```

читать:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

Этот skill описывает два маршрута:

1. локальный запуск на ПК пользователя через `.bat`;
2. удалённая браузерная проверка через GitHub Actions + Playwright + artifact.

## Обязательные правила вокруг skills

- Не читать все `.agents/skills/` подряд.
- Не использовать Godot-команды: проект Vite + TypeScript + PixiJS.
- Не утверждать, что был локальный запуск, если был только GitHub Actions run.
- Не утверждать, что screenshots корректные, пока PNG не скачаны и не осмотрены.
- Все изменения сначала доставлять в `real-wargame-preview`, не в `main`.

## Если skill не найден поиском

GitHub code search может не сразу находить новые файлы в preview-ветке. Если `search` ничего не нашёл, читать файл прямым путём через branch/ref:

```text
ref: real-wargame-preview
path: .agents/skills/real-wargame-local-preview/SKILL.md
```

То же правило относится к этому индексу и новым документам в `docs/ai/`.
