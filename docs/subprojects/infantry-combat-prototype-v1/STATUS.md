<!-- GENERATED FILE. Edit docs/subprojects/infantry-combat-prototype-v1/subproject.json, then run npm run docs:generate. -->
# Первый прототип пехотного боя — Current Status

- **ID:** `infantry-combat-prototype-v1`
- **Status:** `active`
- **Updated:** 2026-07-22
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `8a2b3b5bb344eaafa41871315c51b07e98eb9eb3`

## Goal

Один пехотный отряд атакует другой; оружие — винтовки, ППШ и пулемёт; главная проверка — понятное поведение ИИ в атаке и обороне.

## Current focus

Этап 1: каноническая геометрия объектов и чистая баллистическая проба перенесены в real-wargame-preview. Следующая работа — сохраняемый статический предрасчёт карты и локальные рабочие точки позиции.

## Next step

Реализовать версионированный предрасчёт статической тактической основы и чистый ограниченный решатель рабочих точек наблюдения и огня.

## Read first

- `AGENTS.md`
- `docs/subprojects/infantry-combat-prototype-v1/ROADMAP.md`
- `plans/2026-07-22-tactical-position-basis.md`
- `docs/subprojects/infantry-combat-prototype-v1/MAP_OBJECT_GEOMETRY_AND_BALLISTIC_LINE_PROBE.md`
- `docs/subprojects/infantry-combat-prototype-v1/ACCEPTANCE.md`
- `docs/subprojects/infantry-combat-prototype-v1/DECISIONS.md`
- `docs/subprojects/infantry-combat-prototype-v1/WORKLOG.md`

## Main files

- `src/core/tactical/static/StaticTacticalPositionBasis.ts`
- `src/core/tactical/static/StaticTacticalPositionService.ts`
- `src/core/tactical/static/StaticTacticalCandidateIndex.ts`
- `src/core/tactical/TacticalPositionSearchService.ts`
- `src/core/map/MapObjectGeometry.ts`
- `src/core/combat/BallisticLineProbe.ts`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Не расширять текущий этап после выполнения его стоп-критерия.
- Не создавать вторую систему восприятия, опасности или поведения.
- Код задаёт физику и факты; Graph v2 задаёт выбор поведения.
- Общий статус меняет оркестратор; исполнитель меняет только свою задачу и отчёт.
- Документальные предупреждения не блокируют работу над игрой.
- Не переносить изменения в real-wargame-preview без явного разрешения пользователя.
