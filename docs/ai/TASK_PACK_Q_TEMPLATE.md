# Шаблон Q-задачи

Этот шаблон нужен для короткой постановки внешнему исполнителю с GitHub-доступом.

Q-задача не требует ZIP. Результат Q — отдельная ветка, Pull Request и короткий отчёт для Codex.

```md
# Q-mode GitHub task

Project: <название проекта>
Repository: <owner/repo>
Subproject: <id подпроекта или none>
Expected size: <small | medium | large | planning-only>

## Read first

- AGENTS.md
- docs/ai/WORKFLOW_OVERVIEW.md
- docs/ai/ZWORKER_MODES.md
- docs/ai/TASK_PACK_Q_TEMPLATE.md
- docs/subprojects/<id>/SUBPROJECT.md
- docs/subprojects/<id>/subproject.json
- docs/subprojects/<id>/JOURNAL.md

Если задача связана с PixiJS/canvas/2D-графикой/assets/SVG/events/performance/migration-v8 — дополнительно:

- docs/ai/PIXIJS_SKILLS_INDEX.md
- .agents/skills/pixijs/SKILL.md
- <релевантные PixiJS skills по таблице из PIXIJS_SKILLS_INDEX.md>

## Goal

<Коротко: что нужно сделать.>

## Allowed changes

<Файлы/каталоги, которые можно менять.>

## Forbidden changes

<Файлы/каталоги/типы изменений, которые нельзя делать.>

## Requirements

- <Требование 1>
- <Требование 2>
- <Требование 3>

## Acceptance criteria

- <Как понять, что задача выполнена.>
- <Что должно быть видно в PR.>

## Output for Codex

Create a separate branch and Pull Request. Then reply with:

- repository;
- branch;
- PR number/link;
- changed files;
- checks run;
- not checked;
- risks;
- human verification steps;
- questions, if any.

Do not merge. Do not enable auto-merge. Do not push directly to main. Do not claim local checks were run unless they were actually run.
```

## Когда использовать

Использовать только если внешний исполнитель реально имеет GitHub-доступ и может открыть PR.

Если PR создать нельзя, это не Q-результат. Тогда нужно прямо написать причину и вернуться к R-режиму или ручному применению через Codex.
