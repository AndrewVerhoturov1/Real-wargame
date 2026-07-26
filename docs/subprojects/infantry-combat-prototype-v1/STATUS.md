<!-- GENERATED FILE. Edit docs/subprojects/infantry-combat-prototype-v1/subproject.json, then run npm run docs:generate. -->
# Первый прототип пехотного боя — Current Status

- **ID:** `infantry-combat-prototype-v1`
- **Status:** `active`
- **Updated:** 2026-07-26
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `27603b0e2e311e44680a1ca900837ed7adaf8859`

## Goal

Один пехотный отряд атакует другой; оружие — винтовки, ППШ и пулемёт; главная проверка — понятное поведение ИИ в атаке и обороне.

## Current focus

Стрелковый бой Stage 3–9 принят и перенесён в real-wargame-preview: одиночный и автоматический огонь, пули, прицеливание, попадания и ранения, кровопотеря, усталость, первая помощь, подавление, ДП-27, помощник, перезарядка и передача патронов. Текущий контрольный этап — Stage 9V: отдельное приложение испытательного полигона для первой полноценной живой проверки системы.

## Next step

Создать отдельное приложение /combat-lab.html с общими детерминированными сценариями для visual single-run и будущих headless batch-прогонов; провести ручную проверку Stage 3–9 и только после неё решать переход к Stage 10.

## Read first

- `AGENTS.md`
- `docs/subprojects/infantry-combat-prototype-v1/ROADMAP.md`
- `docs/subprojects/infantry-combat-prototype-v1/COMBAT_LAB_DIRECTION.md`
- `docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9_MACHINE_GUN_ASSISTANT.md`
- `docs/subprojects/infantry-combat-prototype-v1/ACCEPTANCE.md`
- `docs/subprojects/infantry-combat-prototype-v1/DECISIONS.md`
- `docs/subprojects/infantry-combat-prototype-v1/WORKLOG.md`
- `docs/performance/PERFORMANCE_PRINCIPLES.md`

## Main files

- `src/core/infantry-combat/runtime/index.ts`
- `src/core/infantry-combat/runtime/FireTaskRuntime.ts`
- `src/core/infantry-combat/runtime/AimRuntime.ts`
- `src/core/infantry-combat/runtime/ReloadWeaponAction.ts`
- `src/core/infantry-combat/runtime/WeaponDeploymentRuntime.ts`
- `src/core/infantry-combat/runtime/Stage9ActionReconciliation.ts`
- `src/core/simulation/SimulationTick.ts`
- `vite.config.ts`

## Suggested verification

- `npm run docs:sync`
- `npm run infantry-combat-stage9:verify`
- `npm run build`

## Safety rules

- Не начинать Stage 10 до создания и ручной проверки Stage 9V.
- Не путать автоматическую exact-head проверку, визуальную проверку инструмента и живую оценку владельцем.
- Отдельное приложение испытательного полигона использует производственную физику и не создаёт второй боевой runtime.
- Один испытательный сценарий должен иметь общий детерминированный источник состояния для headless- и visual-запуска.
- Код задаёт физику и факты; Graph v2 задаёт выбор поведения.
- Общий статус, roadmap, решения и журнал вех меняет оркестратор; исполнитель меняет только свою задачу и отчёт.
- Не переносить изменения в real-wargame-preview без явного разрешения пользователя.
