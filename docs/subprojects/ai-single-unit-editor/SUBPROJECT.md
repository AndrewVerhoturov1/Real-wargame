# AI Single-Unit Editor — Node-Based Constructor

## Goal

Создать node-based редактор ИИ одиночного юнита, привязанный к существующей RTS wrapper (Real-wargame), где поведение солдата собирается из нод, опирается на существующие `BehaviorModel`, `UnitModel`, `GameHudControls`, `SimulationState` и roadmap Soldier Behavior Lab.

## Current focus

Определить data contract между node editor и RTS симуляцией: какие ноды/связи/триггеры нужны для первой рабочей версии одиночного поведения (idle, patrol, react to contact, move to cover). Согласовать интеграцию с существующей RTS обёрткой без переписывания симуляции.

## Key decisions

- Node editor не является самостоятельным generic framework; он привязан к data contract с RTS wrapper.
- Первая версия — только одиночный юнит (single-unit); squad-level AI отложен.
- Не переписывать существующую RTS симуляцию; node editor работает через существующие `BehaviorModel`, `UnitModel`, `SimulationState`, `GameHudControls`.
- Поведение описывается графом нод (conditions + actions + transitions), а не императивным кодом.

## Read first

1. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
2. `docs/subprojects/ai-single-unit-editor/subproject.json`
3. `docs/subprojects/ai-single-unit-editor/JOURNAL.md` (если существует)
4. `python scripts/subproject_context.py ai-single-unit-editor --brief`
5. `docs/subprojects/real-wargame-start/ROADMAP_SOLDIER_BEHAVIOR_LAB.md`
6. `docs/subprojects/real-wargame-start/RTS_FOUNDATION_DECISIONS.md`

## Boundaries

- Не переписывать всю RTS-симуляцию: node editor только надстройка над существующим `SimulationState`, `BehaviorModel`, `UnitModel`.
- Не делать сразу squad-level AI: первая версия ограничена одним юнитом.
- Не делать отвязанный generic node framework без data contract: редактор осмыслен только в связке с RTS wrapper.
- Не изменять core/rendering/input разделение; `core` не должен импортировать PixiJS.
- Не ломать экспорт/загрузку JSON сцены и существующий редактор карт.

## Testing

Тесты появятся вместе с первой реализацией node editor. На данном этапе — только структурная проверка документации через `scripts/subproject_context.py`.
