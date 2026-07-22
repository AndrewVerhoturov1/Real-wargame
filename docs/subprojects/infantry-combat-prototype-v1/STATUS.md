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

Этап 1: оптимизация выбора тактических позиций. Физическая длительная смена позы принята и находится в real-wargame-preview.

## Next step

Закончить оптимизацию поиска и диагностику выбора; затем закрыть этап 1 и перейти к стрелковому бою.

## Read first

- `AGENTS.md`
- `docs/subprojects/infantry-combat-prototype-v1/ROADMAP.md`
- `plans/2026-07-22-tactical-position-basis.md`
- `docs/subprojects/infantry-combat-prototype-v1/ACCEPTANCE.md`
- `docs/subprojects/infantry-combat-prototype-v1/DECISIONS.md`
- `docs/subprojects/infantry-combat-prototype-v1/WORKLOG.md`

## Main files

- `src/core/tactical/TacticalPositionSearchService.ts`
- `src/core/units/UnitModel.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/core/ai/AiGraphRuntime.ts`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Не расширять текущий этап после выполнения его стоп-критерия.
- Не создавать вторую систему восприятия, опасности или поведения.
- Код задаёт физику и факты; Graph v2 задаёт выбор поведения.
- Общий статус меняет оркестратор; исполнитель меняет только свою задачу и отчёт.
- Документальные предупреждения не блокируют работу над игрой.
- Не переносить изменения в real-wargame-preview без явного разрешения пользователя.
