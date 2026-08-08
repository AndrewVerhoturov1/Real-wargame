<!-- GENERATED FILE. Edit docs/subprojects/soldier-topdown-appearance/subproject.json, then run npm run docs:generate. -->
# Отображение солдат видом сверху — Current Status

- **ID:** `soldier-topdown-appearance`
- **Status:** `active`
- **Updated:** 2026-08-08
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Исследовать и зафиксировать требования к читаемому отображению солдат видом сверху для тактической игры без утверждения конкретного внешнего стиля до отдельного решения пользователя.

## Current focus

Составить проверяемые критерии силуэта, различения сторон, типов бойцов, оружия и состояний.

## Next step

Изучить текущий рендер юнитов и данные солдат, затем подготовить сравнение вариантов по читаемости.

## Read first

- `AGENTS.md`
- `docs/subprojects/soldier-topdown-appearance/SUBPROJECT.md`
- `docs/subprojects/soldier-topdown-appearance/subproject.json`
- `docs/subprojects/soldier-topdown-appearance/JOURNAL.md`

## Main files

- `src/ui/SceneExport.ts`
- `src/ui/UnitBarPresentation.ts`

## Suggested verification

- `npm run docs:sync`
- `python scripts/subproject_context.py soldier-topdown-appearance --brief`

## Safety rules

- Не менять main.
- Не переносить изменения в real-wargame-preview без отдельного GO.
- Не добавлять код или графику без отдельной постановки.
- Внешний стиль не считать утверждённым до отдельного решения пользователя.
- Рендерер не является источником игровой истины.
- Не затрагивать несвязанные изменения рабочего дерева.
