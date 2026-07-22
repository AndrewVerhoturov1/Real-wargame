<!-- GENERATED FILE. Edit docs/subprojects/infantry-combat-prototype-v1/subproject.json, then run npm run docs:generate. -->
# Первый прототип пехотного боя — Current Status

- **ID:** `infantry-combat-prototype-v1`
- **Status:** `active`
- **Updated:** 2026-07-22
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `86071bb3d0c4ebd95adf4e87ee4d575fa7108da3`

## Goal

Один пехотный отряд атакует другой; оружие — винтовки, ППШ и пулемёт; главная проверка — понятное поведение ИИ в атаке и обороне.

## Current focus

Этап 1: сохраняемый статический предрасчёт и чистый решатель локальных рабочих точек проверены и перенесены в real-wargame-preview. Текущая работа — физическое выполнение временного действия от защищённого якоря.

## Next step

Реализовать общий runtime anchor → action port → требуемая поза → observation/fire → return с отменой, сохранением и диагностикой.

## Read first

- `AGENTS.md`
- `docs/subprojects/infantry-combat-prototype-v1/ROADMAP.md`
- `plans/2026-07-22-action-port-physical-runtime.md`
- `docs/subprojects/infantry-combat-prototype-v1/STATIC_TACTICAL_BASIS_ARTIFACT_AND_ACTION_PORTS.md`
- `docs/subprojects/infantry-combat-prototype-v1/MAP_OBJECT_GEOMETRY_AND_BALLISTIC_LINE_PROBE.md`
- `docs/subprojects/infantry-combat-prototype-v1/ACCEPTANCE.md`
- `docs/subprojects/infantry-combat-prototype-v1/DECISIONS.md`
- `docs/subprojects/infantry-combat-prototype-v1/WORKLOG.md`

## Main files

- `src/core/tactical/action-ports/TacticalActionPortSolver.ts`
- `src/core/movement/MovementRuntime.ts`
- `src/core/actions/PostureTransition.ts`
- `src/core/combat/FireAction.ts`
- `src/core/simulation/SimulationTick.ts`
- `src/ui/SceneExport.ts`

## Suggested verification

- `npm run docs:sync`

## Safety rules

- Не расширять текущий этап после выполнения его стоп-критерия.
- Не создавать вторую систему восприятия, опасности или поведения.
- Код задаёт физику и факты; Graph v2 задаёт выбор поведения.
- Общий статус меняет оркестратор; исполнитель меняет только свою задачу и отчёт.
- Документальные предупреждения не блокируют работу над игрой.
- Не переносить изменения в real-wargame-preview без явного разрешения пользователя.
