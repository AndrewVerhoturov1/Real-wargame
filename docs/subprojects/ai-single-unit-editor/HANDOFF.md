# Handoff — AI Single-Unit Editor + AI Test Lab

Дата: 2026-07-10  
Ветка: `real-wargame-preview`  
Главное правило: `main` не трогать без явного GO пользователя.

## Что это за подпроект

Подпроект соединяет два инструмента:

```text
AI Node Editor — где собирается поведение бойца из универсальных нод;
AI Test Lab — игровая испытательная сцена, где вручную задаются боец, угрозы и укрытия.
```

Главная схема:

```text
AI Node Editor
  → graph в localStorage v6
  → AiGameBridge строит blackboard из реальной сцены
  → AiGraphRunner выбирает ветку и возвращает effects / scores / trace
  → AiGameBridge применяет effects к выбранному бойцу
  → редактор нод показывает последний trace
```

## Основной запуск

Запускать двойным кликом:

```text
Run-Real-Wargame-Lab.bat
```

Ожидаемые вкладки:

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/ai-node-editor.html
```

Служебные порты:

```text
5173 — Vite;
8787 — local AI engine;
8799 — lab manager.
```

## Что готово сейчас

```text
редактор универсальных AI-нод;
GraphRunner + UtilitySelector v1;
подсветка последнего решения;
пауза;
общий тихий запуск;
редактор карты;
редактор выбранного бойца;
направленные источники огня;
настраиваемая защита укрытий;
предварительный расчёт AI без применения;
ручное применение одного решения;
сброс бойца и сцены;
скорость времени до ×10;
экспорт/импорт испытательной сцены v3.
```

## Главные новые файлы Stage 5

```text
src/core/cover/CoverEvaluation.ts
src/core/pressure/ThreatEvaluation.ts
src/core/testing/AiTestLabRuntime.ts
src/ui/AiTestLabControls.ts
src/ai-test-lab.css
src/ai-node-editor/ai-test-lab-node-options.ts
scripts/ai_test_lab_smoke.mjs
docs/manual-test/AI_TEST_LAB_STAGE_5.md
docs/subprojects/ai-single-unit-editor/AI_TEST_LAB_DESIGN.md
docs/subprojects/ai-single-unit-editor/AI_TEST_LAB_IMPLEMENTATION_PLAN.md
.github/workflows/preview-core-checks.yml
```

## Скорость бойца

Старая скорость около 2.2–2.3 клетки/с означала примерно 22–23 м/с при масштабе 10 м/клетка.

Теперь:

```text
скорость по умолчанию: 0.5 клетки/с;
при 10 м/клетка: около 5 м/с;
поза и физическое состояние дополнительно меняют фактическую скорость.
```

Файлы:

```text
src/core/units/UnitModel.ts
src/data/units/test_units.json
src/core/simulation/SimulationTick.ts
```

## Панель «Полигон ИИ»

В игре слева сверху находится сворачиваемая панель:

```text
Полигон ИИ
```

Вкладки:

```text
Боец
Угроза
Укрытие
Испытание
```

### Боец

Можно менять:

```text
имя;
профиль: green / regular / veteran / cautious / reckless;
скорость;
дальность и угол обзора;
позу;
стресс;
подавление;
патроны;
готовность оружия;
стойкость;
осторожность;
решительность;
дисциплину;
инициативу;
тактику;
владение оружием;
усталость;
мораль;
замешательство;
здоровье;
внимание;
зрение;
интуицию;
физическую скорость;
скрытность.
```

Runtime-поля бойца:

```text
danger
rawDanger
stress
suppression
ammo
weaponReady
posture
currentAction
aiNodeCooldowns
```

## Угрозы

Старые зоны не удалены. Есть два режима:

```text
area — обычная круглая/прямоугольная область;
directional_fire — источник направленного огня.
```

Параметры направленного огня:

```text
strength;
suppression;
stressPerSecond;
directionDegrees;
arcDegrees;
rangeCells;
minRangeCells;
falloffPercent;
enabled;
sourceVisible;
sourceKnown.
```

Расчёт учитывает:

```text
попал ли боец в сектор;
расстояние до источника;
падение силы к краю дальности;
позу бойца;
укрытие между источником и бойцом;
несколько угроз одновременно.
```

Несколько вкладов складываются с ограничением 100 для danger и suppression.

Ключевые файлы:

```text
src/core/pressure/PressureZone.ts
src/core/pressure/ThreatEvaluation.ts
```

Начальная тестовая зона:

```text
src/data/pressure_zones/test_pressure_zones.json
```

Она настроена как сектор пулемётного огня.

## Укрытия

У предметов карты есть свойства:

```text
coverProtection 0–100;
concealment 0–100;
penetrable;
coverPosture: standing / crouched / prone;
losHeightMeters.
```

Если поля отсутствуют в старом JSON, используются значения по типу предмета.

Важно:

```text
предмет защищает только тогда, когда находится между угрозой и бойцом;
простреливаемость уменьшает фактическую защиту;
поза бойца должна подходить высоте укрытия;
точка для движения выбирается за предметом относительно источника огня.
```

Ключевые файлы:

```text
src/core/map/MapModel.ts
src/core/cover/CoverEvaluation.ts
```

## Управление испытанием

Кнопки:

```text
Пауза / Продолжить
Один расчёт ИИ
Рассчитать и выполнить
Один шаг симуляции
Сбросить бойца
Сбросить всю сцену
Запомнить сцену как исходную
```

Режимы времени:

```text
×0.25
×0.5
×1
×2
×4
×10
```

Скорость времени влияет на:

```text
движение;
накопление/восстановление стресса;
частоту решений GraphRunner;
внутреннее время cooldown нод.
```

`Один расчёт ИИ`:

```text
обновляет trace;
показывает победившую ветку;
не применяет effects;
не меняет cooldowns;
не двигает бойца.
```

`Рассчитать и выполнить` применяет effects.

## Blackboard игры

`AiGameBridge` больше не подставляет постоянные `ammo=30` и `weaponReady=true`.

Текущие реальные значения:

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
current_action
self_position
order_target_position
retreat_position
best_cover_position
current_target
remembered_enemy_position
```

Новые числовые входы добавлены в человеческие списки редактора нод:

```text
threatDistance
directionToThreat
threatAngle
coverProtection
bestCoverQuality
```

## GraphRunner

Ключевой файл:

```text
src/core/ai/AiGraphRunner.ts
```

Он остаётся чистым core-модулем и не должен импортировать:

```text
PixiJS
DOM
window
document
localStorage
SimulationState
```

`AiGameBridge`:

```text
строит blackboard;
передаёт tacticalHost;
вызывает runner;
применяет effects;
публикует debug trace.
```

## Storage

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
real-wargame.ai-node-editor.debug.v1
```

Старые версии storage не возвращать.

## Сохранение сцены

Текущий формат:

```text
scene-export-v3
```

Сохраняет:

```text
карту и рельеф;
предметы и свойства укрытий;
бойцов и индивидуальные характеристики;
стресс, подавление, патроны, готовность оружия и позу;
обычные и направленные угрозы.
```

Старые сцены без новых полей должны загружаться со значениями по умолчанию.

## Проверки

Машинные команды:

```text
npm run lab:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Workflow без скриншотов:

```text
.github/workflows/preview-core-checks.yml
```

Он публикует статусы:

```text
preview-core/install
preview-core/lab
preview-core/editor
preview-core/engine
preview-core/graph
preview-core/build
preview-core-checks
```

Ручная проверка:

```text
docs/manual-test/AI_TEST_LAB_STAGE_5.md
```

Не говорить, что визуально всё проверено, пока настоящий Vite-браузер не был открыт и интерфейс не проверен вручную. В этой работе скриншоты не требовались.

## Ограничения текущего этапа

```text
GraphRunner по-прежнему исполняется только для выбранного бойца;
направленный огонь — управляемая модель угрозы, а не настоящая баллистика;
нет пуль, урона, ранений и полноценного вражеского AI;
проверка укрытия использует приближённую геометрию отрезка;
нет расчёта вместимости укрытия;
нет истории нескольких AI-решений, хранится последний trace;
local engine и TypeScript runner всё ещё имеют частично дублированный смысл.
```

## Что делать дальше

Приоритет после ручной проверки Stage 5:

```text
1. Исправить найденные в браузере ошибки интерфейса полигона.
2. Добавить готовые JSON-сценарии: слабый огонь, два укрытия, два источника, приказ против опасности.
3. Сделать историю последних N решений и пошаговый повтор trace.
4. Добавить точное занятие позиции за укрытием и вместимость.
5. Подключить controlled subset бойцов только после стабилизации одиночного теста.
6. Позже сблизить headless JS runner и TypeScript GraphRunner в один источник логики.
```

## Чего не делать

```text
не трогать main без явного GO;
не возвращать legacy-ноды;
не превращать тестовый источник огня сразу в полную баллистику;
не запускать AI для всей армии до проверки одного бойца;
не смешивать Pixi rendering с core AI contract;
не удалять editor-click-guard без замены обработки кликов;
не утверждать, что build/smoke/browser прошли, если они реально не прошли.
```


## Единый игровой редактор сцены Stage 6

Встроенный редактор карты больше не устанавливает старые разрозненные панели `EditorControls` и `TerrainBrushControls`. Текущий вход:

```text
src/main.ts
  → installGameEditorWorkbench(...)
  → вкладки Предмет / Боец / Угроза / Рельеф / Сцена
```

Главные файлы:

```text
src/core/editor/GameEditorDrafts.ts
src/core/editor/GameEditorPlacement.ts
src/ui/GameEditorWorkbench.ts
src/game-editor.css
scripts/game_editor_smoke.mjs
docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md
```

Рабочий цикл редактора:

```text
настроить шаблон будущего экземпляра
→ включить «Ставить предмет / бойца / угрозу» или кисть
→ кликнуть по карте
→ перейти к выбору
→ выбрать экземпляр
→ «Взять параметры выбранного»
→ изменить значения
→ «Применить к выбранному»
```

Шаблон предмета хранит размеры, поворот, физическую высоту, защиту, маскировку, простреливаемость и допустимую позу. Шаблон бойца хранит профиль, скорость, обзор, позу, боезапас, стресс/подавление, черты и состояние. Шаблон угрозы хранит обычную область или направленный огонь со всеми параметрами сектора. Рельеф поддерживает круглую и квадратную кисть для высоты и леса.

Слой сохранения/загрузки и отчёт производительности используют постоянный `.editor-scene-tools-slot`, который показывается только во вкладке `Сцена`.

Старые исходные файлы редактора пока остаются в репозитории для истории и совместимости, но из `main.ts` не устанавливаются. Не возвращать их параллельную установку.

Проверки:

```text
npm run game-editor:smoke
npm run lab:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Визуальная проверка остаётся ручной: запустить `Run-Real-Wargame-Lab.bat`, открыть режим редактора и пройти `docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md`.
