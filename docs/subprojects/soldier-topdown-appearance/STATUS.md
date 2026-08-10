<!-- GENERATED FILE. Edit docs/subprojects/soldier-topdown-appearance/subproject.json, then run npm run docs:generate. -->
# Отображение солдат видом сверху — Current Status

- **ID:** `soldier-topdown-appearance`
- **Status:** `active`
- **Updated:** 2026-08-10
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** not recorded

## Goal

Зафиксировать и развивать принятую систему читаемых тактических знаков пехоты для 2D-карты: поза, направление, оружие, действия, состояния, роли и уровни детализации по масштабу.

## Current focus

Принята система условных знаков: круг для стоящего, скруглённый треугольник для присевшего, вытянутый прямоугольник для лежащего, оружие закреплено внутри знака справа у условного плеча; определены состояния и три уровня детализации.

## Next step

Использовать UNIT_SYMBOL_SYSTEM.md как канонический визуальный контракт при переносе принятого HTML-прототипа в штатный рендер карты и редактора юнитов без отдельной демонстрационной сцены.

## Read first

- `AGENTS.md`
- `docs/subprojects/soldier-topdown-appearance/SUBPROJECT.md`
- `docs/subprojects/soldier-topdown-appearance/subproject.json`
- `docs/subprojects/soldier-topdown-appearance/UNIT_SYMBOL_SYSTEM.md`
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
- Не менять принятый базовый визуальный язык без отдельного явного решения пользователя.
- Рендерер не является источником игровой истины.
- Не затрагивать несвязанные изменения рабочего дерева.
