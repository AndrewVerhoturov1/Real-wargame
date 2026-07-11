# AI Single-Unit Editor — Tactical Awareness and Front Context Lab

## Goal

Создать понятную лабораторию поведения отдельного бойца в существующей RTS-основе Real-wargame.

Пользователь должен иметь возможность:

- собирать поведение из универсальных AI-нод;
- проверять граф через local engine и GraphRunner;
- запускать граф для выбранного бойца на реальной карте;
- настраивать бойца, угрозы, укрытия, лес и рельеф;
- видеть субъективную память и карту опасности бойца;
- передавать тактические и территориальные параметры в Utility AI;
- понимать причину решения.

Служебный data contract использует английские ключи. Русский интерфейс хранится в overlay-полях `*Ru`.

## Current focus

Текущий этап:

```text
single-unit tactical awareness
+ Tactical Workspace
+ minimal front context v1
```

Вертикальный срез:

```text
AI Node Editor
→ graph v6
→ AiGameBridge
→ blackboard выбранного бойца
→ субъективная awareness map
→ территориальный контекст
→ AiGraphRunner + UtilitySelector
→ effects / score / trace / explanation.
```

## Current state

Работает:

- Tactical Workspace с режимами `Симуляция` и `Редактирование`;
- единый GameEditorWorkbench;
- AI Node Editor;
- local engine;
- GraphRunner + UtilitySelector v1;
- runtime trace;
- индивидуальная память угроз;
- awareness grid;
- опасность, скрытность и известные укрытия;
- один общий запуск `Run-Real-Wargame-Lab.bat`;
- минимальная линия фронта из трёх вертикальных зон;
- управление двумя X-границами во вкладке `Сцена`;
- переключатель видимости в меню `Вид`;
- передача территориальных runtime-параметров в blackboard.

## Key decisions

- Первая версия ограничена одним выбранным бойцом.
- Node Editor не является отвязанным generic framework.
- Tactical Workspace имеет ровно два режима.
- Редактор всегда ставит симуляцию на паузу.
- `AiGraphRunner.ts` не импортирует PixiJS, DOM, localStorage или `SimulationState`.
- `AiGameBridge.ts` является адаптером.
- Awareness субъективна и не раскрывает объективный мир.
- Маскировка, защита и надёжность укрытия различаются.
- Awareness grid не пересчитывается каждый кадр.
- Линия фронта является стратегическим контекстом, а не датчиком противника.
- Территория влияет на Utility AI как модификатор, но не должна жёстко отменять приказ.
- Визуализация фронта не использует поклеточный Pixi-рендер.
- `main` не менять без прямого GO пользователя.

## Read first

1. `docs/subprojects/ai-single-unit-editor/HANDOFF.md`
2. `docs/subprojects/ai-single-unit-editor/SUBPROJECT.md`
3. `docs/subprojects/ai-single-unit-editor/subproject.json`
4. `docs/subprojects/ai-single-unit-editor/JOURNAL.md`
5. `ideas/FRONT_LINE_INFLUENCE_ON_SINGLE_SOLDIER_AI.md`
6. `docs/ai/AGENT_START_HERE.md`
7. `AGENTS.md`
8. `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
9. `.agents/skills/real-wargame-local-preview/SKILL.md`
10. `docs/manual-test/TACTICAL_WORKSPACE_STAGE_7.md`
11. `docs/manual-test/AI_NODE_EDITOR_STAGE_4.md`
12. `docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md`

## Architecture

### AI

```text
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGameBridge.ts
src/data/ai/soldier_default_survival_graph.json
```

### Tactical awareness

```text
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/SoldierAwarenessGrid.ts
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/pressure/PressureZone.ts
src/core/pressure/ThreatEvaluation.ts
```

### Tactical Workspace and editor

```text
src/ui/TacticalWorkspace.ts
src/ui/GameEditorWorkbench.ts
src/core/editor/GameEditorDrafts.ts
src/core/editor/GameEditorPlacement.ts
src/input/BoardInputController.ts
```

### Front context

```text
src/core/front/FrontZoneState.ts
src/ui/FrontZoneControls.ts
src/front-zones.css
tests/front-zones.spec.ts
ideas/FRONT_LINE_INFLUENCE_ON_SINGLE_SOLDIER_AI.md
```

### Local launch

```text
Run-Real-Wargame-Lab.bat
lab-launch.html
scripts/real_wargame_lab_manager.mjs
src/shared/AppShellMenu.ts
```

## Current awareness blackboard

Основные тактические входы:

```text
danger
stress
suppression
fatigue
morale
health
ammo
distanceToCover
enemyVisible
enemyKnown
underFire
hasOrder
isInCover
weaponReady
directionToThreat
threatDistance
threatAngle
coverProtection
bestCoverQuality
currentPositionDanger
currentExpectedProtection
bestSafePositionScore
distanceToBestSafePosition
routeDanger
threatConfidence
current_action
self_position
order_target_position
retreat_position
best_cover_position
current_target
remembered_enemy_position
```

Территориальные runtime-входы:

```text
territorySafety
territoryKind
territoryFriendly
territoryNeutral
territoryEnemy
```

Значения безопасности первой версии:

```text
friendly  80
neutral   50
enemy     20
```

Эти ключи попадают в исполняемый blackboard через `aiGraphMemory`.

Ограничение: человеко-понятный каталог/селекторы AI Node Editor ещё не полностью синхронизированы с новыми территориальными ключами.

## Front context v1

Схема:

```text
своя территория | серая зона | вражеская территория
```

- две вертикальные X-границы;
- редактирование во вкладке `Сцена`;
- переключение слоя через `Вид`;
- линии следуют за камерой и масштабом;
- используется пять HTML-элементов;
- нет автоматического движения фронта.

Runtime-состояние хранится в `WeakMap`, поэтому пока не входит в `scene-export-v3`.

## Storage

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
real-wargame.ai-node-editor.debug.v1
```

Старые версии storage не возвращать.

## Scene format

```text
scene-export-v3
```

Фронтовые границы пока не сохраняются в JSON сцены.

## Important runtime rules

- GraphRunner автоматически работает только для выбранного бойца.
- Во время паузы и редактора bridge не выполняет обычный tick.
- Awareness map кэшируется.
- Территориальная безопасность не заменяет реальную опасность.
- Своя территория не раскрывает врагов.
- Вражеская территория не означает автоматический контакт.
- Постоянные UI-элементы не должны пересоздаваться из-за каждого изменения состояния.
- Не использовать `.editor-scene-tools-slot` для постоянной панели фронта.
- `MutationObserver` не должен менять наблюдаемый DOM в бесконечном цикле.

## Boundaries

- Не переписывать RTS-симуляцию.
- Не делать squad-level AI до стабилизации одного бойца.
- Не запускать graph для всей армии.
- Не возвращать legacy-ноды.
- Не пересчитывать awareness каждый кадр.
- Не считать объективный мир известным.
- Не смешивать core AI с PixiJS.
- Не ломать scene export/import.
- Не превращать фронт в постоянно пересчитываемую карту влияния.
- Не рисовать фронт тысячами клеток.
- Не менять `main` без GO.

## Known limitations

- Нет полноценного enemy AI.
- Нет баллистики и повреждений.
- Нет обмена знаниями.
- Нет истории N решений.
- Нет вместимости укрытий.
- Нет масштабирования awareness на сотни бойцов.
- Готовое поведение зависит от graph.
- Территория не сохраняется в scene JSON.
- Линия не движется автоматически.
- Нет расчёта направления и расстояния до своей территории.
- Территориальные ключи ещё не полностью представлены в удобных селекторах редактора нод.
- Нет готового проверенного графа, который реально меняет поведение от территории.

## Testing

Основной запуск:

```text
Run-Real-Wargame-Lab.bat
```

Машинные проверки:

```text
npm run workspace:smoke
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Последний полностью проверенный app commit:

```text
627a77ca4f98241ec863809d7e83f26bc1ba5b0c
```

Проверка:

```text
core run 29152364956 — success;
screenshot run 29152364936 — success;
Playwright 7/7;
14 PNG;
ключевой front-zone PNG просмотрен.
```

## Next suggested work

1. Добавить территориальные ключи в каталог и русские селекторы AI Node Editor.
2. Добавить:
   - `distanceToFriendlyTerritory`;
   - `directionToFriendlyTerritory`;
   - `movingDeeperIntoEnemyTerritory`.
3. Собрать один тестовый Utility AI граф:
   - осторожность в серой/вражеской зоне;
   - повышенный приоритет укрытия;
   - отход к своим при подавлении.
4. Проверить поведение в браузере и runtime trace.
5. После стабилизации добавить границы в scene export/import.
6. Только затем рассматривать автоматическое редкое движение фронта.
