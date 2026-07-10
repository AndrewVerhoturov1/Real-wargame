# Handoff — Real-wargame / AI Single-Unit Editor / Soldier Tactical Awareness Lab

Дата передачи: 2026-07-10  
Репозиторий: `AndrewVerhoturov1/Real-wargame`  
Рабочая ветка: `real-wargame-preview`  
Ветка до подготовки handoff: `bff9c98b5b0e09efa9fc8a3f89f6299bb85b74b9`  
Последний полностью проверенный commit с изменениями приложения: `665a6a14d45fbce758daf86303155b4d538bff6b`  
Главное правило: **`main` не трогать без явного GO пользователя.**

---

# 1. Зачем нужен этот handoff

Этот документ должен позволить новому чату сразу продолжить работу без восстановления контекста по переписке.

Он описывает:

```text
репозиторий и архитектуру;
правила совместной работы;
как общаться с пользователем;
подпроект AI одиночного бойца;
AI Node Editor;
AI Test Lab;
единый игровой редактор сцены;
личную память угроз и тактическую карту бойца;
текущие проверки;
известные ограничения;
следующие задачи;
запреты и опасные места.
```

Для текущего состояния подпроекта этот `HANDOFF.md` является главным коротким источником правды.

---

# 2. Как новый чат должен начать работу

Сначала прочитать:

```text
docs/ai/AGENT_START_HERE.md
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/SKILLS_INDEX.md
docs/subprojects/ai-single-unit-editor/HANDOFF.md
docs/subprojects/ai-single-unit-editor/SUBPROJECT.md
docs/subprojects/ai-single-unit-editor/subproject.json
docs/subprojects/ai-single-unit-editor/JOURNAL.md
```

Если задача касается запуска, браузерной проверки или скриншотов, обязательно прочитать:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

Если задача касается PixiJS, canvas, рендера, событий карты или производительности, прочитать:

```text
docs/ai/PIXIJS_SKILLS_INDEX.md
.agents/skills/pixijs/SKILL.md
```

Если нужна общая концепция игры, не читать весь мастер-документ подряд. Использовать маршруты чтения внутри:

```text
Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md
```

Для этого подпроекта особенно важны главы про:

```text
Utility AI;
Behavior Tree / FSM;
солдат и человеческий фактор;
карты влияния и опасности;
субъективность знаний;
производительность;
разделение отображения и simulation core.
```

---

# 3. Как работать с пользователем

Пользователь не программист. Он задаёт цель обычными словами и не должен управлять Git, терминалом, ветками, merge или конфликтами.

Обязательный стиль совместной работы:

```text
писать простым русским;
не злоупотреблять англицизмами;
для большой задачи сначала коротко сообщить план;
затем выполнять работу самостоятельно;
не просить пользователя вводить команды в терминале;
готовить .bat, кнопки, ссылки, артефакты и понятный чеклист;
не повторять вопрос, если ответ уже дан;
не выдавать предположение за факт;
не утверждать, что проверки прошли, если они не запускались;
не утверждать, что интерфейс проверен глазами, если PNG не открывались;
при UI-задачах проверять настоящий Vite-браузер и скриншоты;
в конце сообщать ветку, commit, проверки, ручную проверку и риски.
```

Пользователь иногда печатает русский текст в английской раскладке. Перед действием расшифровать сообщение, а не считать его бессмысленным.

Пользователь ожидает не частичный эксперимент, а достижение согласованной цели. Если задача крупная, можно делать её этапами, но каждый этап должен быть законченным, проверяемым и не разрушать уже работающую основу.

---

# 4. Правила GitHub и совместной работы

## 4.1 Рабочая ветка

Все изменения по умолчанию идут в:

```text
real-wargame-preview
```

`main` — стабильная база.

Запрещено без явного разрешения пользователя:

```text
писать прямо в main;
открывать PR в main;
мержить preview в main;
включать auto-merge;
считать молчание пользователя разрешением на merge.
```

## 4.2 Предпочтительный путь доставки

Для GitHub-aware чата:

```text
изменить файлы
→ сделать прямой commit/push в real-wargame-preview
→ запустить проверки
→ дать отчёт пользователю
```

Если прямой push невозможен:

```text
отдельная временная ветка
→ PR только в real-wargame-preview
→ проверки
→ после переноса результата удалить/закрыть временную ветку
```

## 4.3 Пользовательский GO

Только человек решает:

```text
GO — можно переносить в main;
NO-GO — остановка, дальнейшая доработка в preview.
```

Самостоятельно мержить в `main` нельзя.

## 4.4 Обязательный итоговый отчёт

Каждый отчёт должен содержать:

```text
branch;
commit или PR;
transfer_path;
checks_run;
manual_checks_needed;
branch_cleanup_status, если была временная ветка;
risks;
remote_preview_commit.
```

Важно: GitHub push не обновляет локальную папку пользователя автоматически. Для проверки на его ПК локальный preview должен быть синхронизирован с `origin/real-wargame-preview`.

---

# 5. Что это за репозиторий

`Real-wargame` — прототип 2D tactical command game и одновременно Soldier Behavior Lab.

Технологии:

```text
Vite;
TypeScript;
PixiJS 7;
HTML/CSS для интерфейсов;
JSON/data-first сцены;
Node.js для локального AI engine и служебных скриптов;
Playwright + GitHub Actions для реальной браузерной проверки.
```

Это **не Godot**.

Главная цель текущего прототипа — не финальная красивая RTS, а удобная лаборатория:

```text
карты;
рельефа;
лесов;
линии видимости;
укрытий;
опасности;
личных знаний бойца;
редактора AI-графа;
объяснимого поведения одиночного солдата.
```

---

# 6. Текущее состояние RTS-основы

В `real-wargame-preview` уже есть:

```text
карта 64×40;
1 клетка = 10 метров;
PixiJS-отрисовка карты, предметов, бойцов, зон и приказов;
зум колесом;
перетаскивание карты средней кнопкой или Space + drag;
режим игры;
единый режим редактора сцены;
высоты -2..+4;
лес 0/1/2;
визуальные линии высот;
сглаженный слой «Реальный рельеф»;
Alt-линия видимости с зелёной/красной частью и метрами;
физическая высота предметов losHeightMeters;
экспорт и импорт JSON сцены;
отчёт производительности;
слои знаний и опасности;
AI Node Editor;
local AI engine;
общий тихий запуск;
AI Test Lab;
личная тактическая карта выбранного бойца.
```

Архитектурное правило:

```text
core считает мир;
rendering только отображает;
input переводит действия пользователя в команды;
UI редактирует данные и показывает диагностику;
core не должен импортировать PixiJS или DOM.
```

Не смешивать simulation logic с PixiJS-рендерерами.

---

# 7. Основной локальный запуск

Главный запуск для пользователя:

```text
Run-Real-Wargame-Lab.bat
```

Он поднимает:

```text
Vite на 127.0.0.1:5173;
local AI engine на 127.0.0.1:8787;
lab manager на 127.0.0.1:8799;
служебную страницу lab-launch.html;
игру;
AI Node Editor.
```

Основные маршруты:

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/ai-node-editor.html
http://127.0.0.1:5173/lab-launch.html
```

Отдельные запускатели оставлены для диагностики:

```text
Run-Real-Wargame.bat
Run-AI-Node-Editor.bat
Run-AI-Engine.bat
Run-AI-Engine-Smoke.bat
```

Общее меню:

```text
в игре: Редактор ИИ солдат / Новая игра / Выход;
в редакторе нод: Обновить / Открыть игру / Выход.
```

Кнопка `Выход` best-effort закрывает вкладки и вызывает local shutdown. Браузер может запретить `window.close()` для вручную открытой вкладки, но процессы должны останавливаться через lab manager.

---

# 8. Подпроект

Идентификатор:

```text
ai-single-unit-editor
```

Полное текущее название по смыслу:

```text
AI Single-Unit Editor
+ AI Test Lab
+ Soldier Tactical Awareness
```

Главная цель:

> Создать понятную лабораторию поведения одиночного бойца, где пользователь собирает поведение из универсальных нод, задаёт бойца, угрозы, укрытия и рельеф, видит субъективную карту опасности конкретного солдата и проверяет, как эти данные влияют на решения GraphRunner.

Ограничение текущего этапа:

```text
только одиночный выбранный боец;
не squad AI;
не полная армия;
не финальная боевая симуляция;
не настоящая баллистика.
```

---

# 9. Главная цепочка AI

```text
AI Node Editor
  → graph в localStorage v6
  → AiGameBridge получает выбранного бойца
  → строит blackboard из реального SimulationState
  → добавляет данные угроз, укрытий и личной карты бойца
  → вызывает чистый AiGraphRunner
  → UtilitySelector оценивает ветки
  → GraphRunner возвращает effects / scores / trace / explanation / cooldowns
  → AiGameBridge применяет effects к выбранному бойцу
  → runtime debug сохраняется в localStorage
  → AI Node Editor подсвечивает последний trace
```

Важное разделение:

```text
AiGraphRunner.ts — чистый core executor;
AiGameBridge.ts — адаптер между игрой и executor;
PixiJS не должен попадать в GraphRunner;
localStorage не должен читаться из GraphRunner;
SimulationState не должен импортироваться в GraphRunner.
```

---

# 10. AI Node Editor

Текущий AI Node Editor открывается отдельно:

```text
/ai-node-editor.html
```

Он умеет:

```text
стартовать с чистым canvas: только root/Старт;
добавлять универсальные ноды;
перетаскивать ноды;
перетаскивать и масштабировать canvas;
Fit;
соединять ноды через порты;
открывать контекстное меню;
редактировать параметры через человеческие панели;
использовать select вместо псевдокода там, где набор конечный;
сохранять graph и позиции в localStorage v6;
экспортировать и импортировать JSON;
проверять graph через local engine;
делать evaluate-once;
показывать последний runtime trace;
подсвечивать passed / failed / score / winner / veto.
```

## 10.1 Универсальные ноды

Не возвращать старые точечные legacy-ноды, если смысл выражается универсальной нодой.

Текущий каталог:

```text
Числовой порог / BlackboardValueAbove
Проверка флага / FlagCheck
Порог расстояния / DistanceCheck
Тактическая проверка / TacticalCheck
Оценка параметра / ParameterScore
Оценка расстояния / DistanceScore
Поиск объекта / FindBestObject
Выбор цели / SelectTarget
Запись памяти / WriteMemory
Копия памяти / CopyMemory
Действие / SetAction
Режим движения / SetMovementMode
Поза / SetPosture
Реплика бойца / SayMessage
Стабильный порог / StableThreshold
Запрет действия / ForbidAction
Объяснение / WriteReason
DecisionInertia
RandomChance
```

У каждой ноды может быть:

```text
cooldownSeconds;
cooldownTiming: before / after.
```

## 10.2 Storage

Используются:

```text
real-wargame.ai-node-editor.graph.v6
real-wargame.ai-node-editor.positions.v6
real-wargame.ai-node-editor.ui.v6
real-wargame.ai-node-editor.debug.v1
```

Старые storage-версии не возвращать.

## 10.3 Известный UI-баг select

Ранее `select` мгновенно сбрасывался из-за document-level click rerender.

Исправление:

```text
src/ai-node-editor/editor-click-guard.ts
```

Он должен загружаться до `main.ts` и защищать поля внутри человеческой панели.

Если баг вернётся, смотреть:

```text
ai-node-editor.html — порядок scripts;
src/ai-node-editor/editor-click-guard.ts;
installEventHandlers() и closeContextMenuIfNeeded() в main.ts;
MutationObserver и renderHumanInspectorForSelectedNode() в human-node-ui.ts.
```

Не удалять click guard без полноценной замены обработки событий.

---

# 11. GraphRunner и AI Game Bridge

Главные файлы:

```text
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/data/ai/soldier_default_survival_graph.json
```

GraphRunner поддерживает:

```text
Root;
Sequence;
Selector;
UtilitySelector;
ActionBranch;
FlagCheck;
BlackboardValueAbove;
DistanceCheck;
TacticalCheck;
FindBestObject;
SelectTarget;
WriteMemory;
CopyMemory;
SetPosture;
SetAction;
SetMovementMode;
SayMessage;
WriteReason;
ParameterScore;
DistanceScore;
DecisionInertia;
RandomChance;
StableThreshold;
ForbidAction;
cooldowns.
```

`AiGameBridge` сейчас работает только для `state.selectedUnitId`.

Он умеет применять простые effects:

```text
move_to;
retreat;
wait;
reload;
fire;
suppress;
set_posture;
set_movement_mode;
say_message;
write_memory;
write_reason.
```

Это не полноценный squad executor.

---

# 12. AI Test Lab — текущий интерфейс

Полигон встроен в реальную тактическую карту, а не открыт отдельным HTML-макетом.

Текущая компоновка:

```text
кнопка «Полигон ИИ» в существующей верхней панели;
верхняя панель инструментов при открытом полигоне;
правый dock со вкладками;
нижняя полоса управления испытанием;
карта физически освобождает место для dock и не перекрывается им.
```

Вкладки dock:

```text
Боец;
Угроза;
Укрытие;
Карта бойца.
```

Верхние инструменты:

```text
Выбрать;
Разместить бойца;
Разместить угрозу;
Разместить укрытие;
Удалить;
Карта бойца.
```

Нижняя полоса:

```text
Пауза / Продолжить;
Один шаг;
Один расчёт ИИ;
Рассчитать и выполнить;
Сбросить бойца;
Сбросить сцену;
скорость ×0.25 / ×0.5 / ×1 / ×2 / ×4 / ×10.
```

`Один расчёт ИИ` обновляет trace, но не применяет effects.

`Рассчитать и выполнить` применяет effects.

---

# 13. Разделение параметров бойца

Теперь данные бойца разделены на три уровня.

## 13.1 Постоянные характеристики

Примеры:

```text
профиль;
базовая скорость;
дальность и угол обзора;
стойкость;
осторожность;
решительность;
дисциплина;
инициатива;
тактика;
владение оружием;
внимание;
зрение;
интуиция;
физическая подготовка;
скрытность.
```

## 13.2 Начальное состояние

Это значения, применяемые при сбросе:

```text
поза;
стресс;
подавление;
усталость;
мораль;
здоровье;
патроны;
готовность оружия.
```

Редактор задаёт исходные значения, а не постоянно переписывает runtime.

Есть действия:

```text
Применить начальное сейчас;
Скопировать текущее в начальное.
```

## 13.3 Текущее состояние

Меняется симуляцией:

```text
поза;
стресс;
подавление;
усталость;
мораль;
здоровье;
патроны;
готовность оружия;
текущее действие;
последняя причина AI;
известные угрозы.
```

Текущая таблица обновляется внутри существующих DOM-элементов. Нельзя снова полностью пересоздавать кнопки и панели каждые 250 мс из-за изменения стресса или морали.

---

# 14. Выбор и размещение объектов

При открытом полигоне активная вкладка определяет приоритет выбора:

```text
вкладка Боец → сначала выбирается боец;
вкладка Угроза → сначала выбирается угроза и её ручки;
вкладка Укрытие → сначала выбирается предмет укрытия.
```

Это важно, потому что боец может находиться под ручкой или сектором выбранной угрозы.

Основные файлы:

```text
src/core/testing/AiLabRuntime.ts
src/core/testing/AiLabInteraction.ts
src/input/BoardInputController.ts
src/ui/AiTestLabControls.ts
```

Курсор меняется по активному инструменту. `Esc` должен возвращать безопасный режим выбора.

---

# 15. Интерактивные угрозы

Поддерживаются:

```text
area — круглая или прямоугольная зона;
directional_fire — направленный источник огня.
```

Для выбранной направленной угрозы на карте отображаются ручки:

```text
центр — перемещение;
направление — поворот;
дальность — растянуть/укоротить;
левая и правая граница — изменить сектор;
ближняя граница — мёртвая зона;
радиус — для круговой зоны;
ширина, длина и поворот — для прямоугольной зоны.
```

Главные файлы:

```text
src/core/testing/AiLabInteraction.ts
src/rendering/PixiThreatEditorRenderer.ts
src/core/pressure/PressureZone.ts
src/core/pressure/ThreatEvaluation.ts
```

После drag должны одновременно меняться:

```text
видимая геометрия на карте;
числовые поля в правой панели.
```

Не принимать изменение только числа или только изображения за завершённую работу.

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
sourceKnown;
knowledgeConfidence;
uncertaintyCells.
```

Это модель известной/предполагаемой зоны огня, а не настоящая баллистика.

---

# 16. Укрытия против стрелкового оружия

Новая система различает:

```text
coverProtection — физическая сила защиты;
coverReliability — вероятность/надёжность, что геометрия закрывает бойца;
concealment — маскировка;
penetrable — простреливаемость;
coverPosture — какую позу закрывает;
losHeightMeters — физическая высота.
```

Ожидаемая защита для выбора позиции учитывает силу и надёжность.

Источники укрытия:

```text
предметы карты;
лес;
складки местности;
обратные скаты;
локальные перепады высоты;
поза бойца;
направление огня.
```

Главные файлы:

```text
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/cover/CoverEvaluation.ts
src/core/map/MapModel.ts
```

Система пока рассчитана только на стрелковое оружие.

Не включены:

```text
артиллерия;
навесные осколки;
разрушение предметов;
настоящая трассировка каждой пули;
вместимость укрытия для нескольких солдат.
```

---

# 17. Личная память угроз бойца

Каждый `UnitModel` имеет отдельное `tacticalKnowledge`.

Память угроз хранит:

```text
id и название;
тип зоны;
предполагаемое положение;
геометрию;
силу и подавление;
направление и сектор;
confidence;
uncertaintyCells;
источник знания;
visibleNow;
время последнего наблюдения и обновления.
```

Источники знания:

```text
seen — увидел сам;
reported — получил сообщение/исходно известная угроза;
heard — предусмотрено контрактом;
fire_pressure — почувствовал воздействие огня.
```

Главный файл:

```text
src/core/knowledge/SoldierThreatMemory.ts
```

Система:

```text
создаёт точную память при прямом наблюдении;
создаёт более неточную память для известного источника или воздействия;
постепенно снижает confidence;
увеличивает uncertainty;
удаляет почти забытые угрозы;
увеличивает revision только при заметном изменении знания.
```

Критичный исправленный баг:

Раньше `revision` менялся каждый кадр из-за служебного времени обновления. Это полностью сбрасывало кэш тепловой карты и заставляло пересчитывать 2560 клеток десятки раз в секунду.

Не возвращать такую логику. Версия знания должна меняться только при содержательном изменении.

---

# 18. Личная тактическая карта бойца

Главный файл:

```text
src/core/knowledge/SoldierAwarenessGrid.ts
```

Для каждой клетки рассчитываются:

```text
danger;
suppression;
expectedProtection;
coverReliability;
concealment;
uncertainty;
safety;
confidence;
sourceRu.
```

Отчёт содержит:

```text
все клетки;
лучшие безопасные позиции;
оценку текущей позиции;
опасность маршрута;
максимальную уверенность в угрозах.
```

Текущие режимы:

```text
off;
all;
danger;
cover;
safe;
uncertainty;
objective.
```

Рендерер:

```text
src/rendering/PixiAwarenessHeatmapRenderer.ts
```

Цветовой смысл:

```text
красный/оранжевый/жёлтый — опасность;
зелёный — действительно хорошие безопасные позиции;
голубой — маскировка/объективные свойства;
жёлтый — неточность знания.
```

Критичный визуальный принцип:

> Обычное открытое поле не должно быть окрашено как хорошее укрытие.

Тепловая карта кэшируется. Пересчёт должен происходить по содержательному ключу:

```text
изменение положения бойца;
позы;
приказа;
revision знаний;
геометрии предметов;
рельефа/леса;
свойств укрытий.
```

Не пересчитывать всю карту каждый кадр.

---

# 19. Связь личной карты с GraphRunner

`AiGameBridge.buildBlackboardForUnit()` уже передаёт в graph:

```text
currentPositionDanger;
currentExpectedProtection;
bestSafePositionScore;
distanceToBestSafePosition;
routeDanger;
threatConfidence;
best_cover_position.
```

Также остаются:

```text
danger;
stress;
suppression;
fatigue;
morale;
health;
ammo;
distanceToCover;
enemyVisible;
enemyKnown;
underFire;
hasOrder;
isInCover;
weaponReady;
directionToThreat;
threatDistance;
threatAngle;
coverProtection;
bestCoverQuality;
self_position;
order_target_position;
retreat_position;
current_target;
remembered_enemy_position.
```

Это означает:

```text
карта уже является источником данных для AI;
лучшее безопасное место уже попадает в best_cover_position;
нода SetAction(move_to) может создать приказ на эту позицию;
но готовое разумное поведение зависит от graph пользователя;
система ещё не является автономным финальным солдатом.
```

Не утверждать, что AI уже всегда сам выбирает оптимальный маршрут. Сейчас инфраструктура и входы готовы, а поведение задаётся графом.

---

# 20. Единый игровой редактор сцены Stage 6

Старые разрозненные панели редактора больше не устанавливаются параллельно.

Текущий вход:

```text
src/main.ts
  → installGameEditorWorkbench(...)
```

Вкладки:

```text
Предмет;
Боец;
Угроза;
Рельеф;
Сцена.
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

Рабочий цикл:

```text
настроить шаблон
→ включить инструмент размещения
→ поставить объект на карте
→ перейти к выбору
→ выбрать экземпляр
→ взять параметры выбранного
→ изменить
→ применить к выбранному.
```

Шаблоны поддерживают:

```text
предметы с защитой, маскировкой, высотой и поворотом;
бойца с профилем, чертами, состоянием и боезапасом;
обычную или направленную угрозу;
круглую/квадратную кисть рельефа и леса.
```

Не возвращать установку старых `EditorControls` и `TerrainBrushControls` параллельно новому workbench.

---

# 21. Сохранение сцены

Текущий формат:

```text
scene-export-v3
```

Сохраняет:

```text
карту;
рельеф;
лес;
предметы;
свойства укрытий;
бойцов;
характеристики;
начальное и текущее состояние;
обычные и направленные угрозы;
новые поля знания/геометрии с нормализацией по умолчанию.
```

Старые сцены без новых полей должны загружаться с безопасными значениями по умолчанию.

Не ломать обратную совместимость JSON.

---

# 22. Главные файлы текущего этапа

## AI core

```text
src/core/ai/AiGraphRunner.ts
src/core/ai/AiGameBridge.ts
src/core/ai/AiGraph.ts
src/core/ai/AiNodeTypes.ts
src/core/ai/AiBlackboard.ts
src/core/ai/AiGraphValidation.ts
src/data/ai/soldier_default_survival_graph.json
```

## Боец и состояние

```text
src/core/units/UnitModel.ts
src/core/behavior/BehaviorModel.ts
src/core/simulation/SimulationState.ts
src/core/simulation/SimulationTick.ts
```

## Угрозы и знания

```text
src/core/pressure/PressureZone.ts
src/core/pressure/ThreatEvaluation.ts
src/core/knowledge/SoldierThreatMemory.ts
src/core/knowledge/SoldierAwarenessGrid.ts
```

## Укрытия

```text
src/core/cover/SmallArmsCoverEvaluation.ts
src/core/cover/CoverEvaluation.ts
src/core/map/MapModel.ts
```

## Полигон и взаимодействие

```text
src/core/testing/AiLabRuntime.ts
src/core/testing/AiLabInteraction.ts
src/input/BoardInputController.ts
src/ui/AiTestLabControls.ts
src/ai-test-lab.css
```

## Рендеринг

```text
src/rendering/PixiApp.ts
src/rendering/PixiThreatEditorRenderer.ts
src/rendering/PixiAwarenessHeatmapRenderer.ts
```

## Единый редактор сцены

```text
src/core/editor/GameEditorDrafts.ts
src/core/editor/GameEditorPlacement.ts
src/ui/GameEditorWorkbench.ts
src/game-editor.css
```

## AI Node Editor и local engine

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/human-node-ui.ts
src/ai-node-editor/editor-click-guard.ts
scripts/ai_engine_core.mjs
scripts/local_ai_engine.mjs
scripts/local_ai_engine_smoke.mjs
scripts/ai_node_editor_smoke.mjs
```

## Запуск и shell

```text
Run-Real-Wargame-Lab.bat
lab-launch.html
scripts/real_wargame_lab_manager.mjs
src/shared/AppShellMenu.ts
src/shared/app-shell-menu.css
```

---

# 23. Проверки

Основные команды:

```text
npm run lab:smoke
npm run game-editor:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
```

Подпроектный контекст:

```text
python scripts/subproject_context.py ai-single-unit-editor --brief
python scripts/subproject_context.py ai-single-unit-editor --opencode
python scripts/subproject_context.py ai-single-unit-editor --files
```

Ручные инструкции:

```text
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
docs/manual-test/AI_ENGINE_STAGE_2.md
docs/manual-test/AI_TEST_LAB_STAGE_5.md
docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md
```

GitHub Actions:

```text
.github/workflows/preview-core-checks.yml
.github/workflows/preview-screenshots.yml
```

Основные статусы:

```text
preview-core/install
preview-core/lab
preview-core/game_editor
preview-core/editor
preview-core/engine
preview-core/graph
preview-core/build
preview-core-checks
preview-screenshots
```

---

# 24. Последняя настоящая браузерная проверка

Последний commit с изменениями приложения, проверенный полностью:

```text
665a6a14d45fbce758daf86303155b4d538bff6b
```

Core workflow:

```text
run 29086211637
```

Screenshot workflow:

```text
run 29086211662
```

Результат:

```text
все core checks зелёные;
Playwright 3/3 passed;
20 PNG созданы;
PNG-архив скачан;
ключевые кадры 15–20 открыты и просмотрены;
суррогат не использовался.
```

После этого в ветку попали только документы:

```text
ideas/LLM_COMMANDERS_AND_TACTICAL_PLANNING.md
.agents/skills/real-wargame-local-preview/SKILL.md
```

Приложение после `665a6a1` не менялось до подготовки этого handoff.

При любой новой UI-правке нужна свежая браузерная проверка, а не ссылка на старый архив.

---

# 25. Что показали последние скриншоты

Проверено:

```text
полигон встроен и не перекрывает старое меню;
верхние инструменты видимы;
правый dock не закрывает карту;
нижняя панель управления видима;
угроза выбирается;
ручки угрозы видимы;
дальность меняется drag;
числовое поле синхронизируется;
боец выбирается даже под графикой угрозы;
постоянные, начальные и текущие значения разделены;
режим карты опасности работает;
режим безопасных мест работает;
нейтральное поле не окрашено как сильное укрытие;
редактор нод открывает палитру;
Порог расстояния имеет корректные select-поля;
drag-link и Auto 4 работают.
```

---

# 26. Исправленные опасные баги

## 26.1 Лишний ряд панели

Кнопка полигона раньше создавала отдельный ряд и закрывала существующее меню. Теперь launcher встроен в `.top-command-controls`.

Не возвращать отдельную плавающую шапку поверх игры.

## 26.2 Неправильный приоритет выбора

Ручка угрозы могла перехватывать клик по бойцу. Теперь приоритет зависит от активной вкладки.

## 26.3 Несинхронные числа

Геометрия угрозы менялась, но поле справа обновлялось только после повторного выбора. Теперь UI перерисовывается после drag.

## 26.4 Нестабильный DOM

Полная перестройка dock каждые 250 мс уничтожала кнопки прямо во время клика Playwright.

Правильное решение:

```text
не пересоздавать постоянные controls из-за live-показателей;
обновлять текущие числа внутри существующих элементов;
полный render только при выборе, смене вкладки или редактируемой геометрии.
```

## 26.5 Кэш awareness

`tacticalKnowledge.revision` не должен изменяться каждый кадр.

## 26.6 Координаты Playwright

Нельзя считать, что верхнее смещение карты всегда равно старому числу. После открытия полигона canvas сместился.

Для будущих тестов вычислять координаты от реального `canvas.boundingBox()`, а не от вручную записанного offset.

## 26.7 Браузер CI

Используется системный Google Chrome через Playwright `channel: chrome`. Не устанавливать Chromium на каждом прогоне без необходимости.

---

# 27. Что пока не завершено

Это важно для честного продолжения.

```text
нет полноценного squad AI;
GraphRunner исполняется только для выбранного бойца;
нет реальной баллистики, пуль, попаданий и ранений;
нет полноценного вражеского AI;
нет обмена знаниями между несколькими бойцами;
heard-сенсор и сложная акустика не реализованы полностью;
нет истории последних N решений и пошагового повтора trace;
нет точной вместимости укрытия;
нет распределения нескольких солдат по разным точкам укрытия;
нет разрушения укрытий;
нет артиллерийской модели защиты;
нет масштабирования awareness grid на сотни бойцов;
нет готового набора стандартных JSON-сценариев для всех случаев;
нет гарантии, что текущий bundled graph использует все новые awareness-поля;
Undo/Redo, дублирование и привязка к сетке не являются законченной частью верхнего инструментария полигона.
```

Личная карта уже передаёт данные в blackboard, но качество поведения определяется графом. Не путать готовую инфраструктуру восприятия с готовым финальным AI.

---

# 28. Следующий рекомендуемый этап

## Приоритет 1 — живая пользовательская проверка

Запустить на ПК пользователя:

```text
Run-Real-Wargame-Lab.bat
```

Попросить проверить без терминала:

```text
открытие/закрытие полигона;
размещение бойца;
размещение угрозы;
перетаскивание всех ручек;
выбор бойца под сектором;
разделение начального и текущего состояния;
сброс бойца;
режимы опасности и безопасных мест;
лес и складку рельефа как укрытие;
закрытие всех процессов кнопкой Выход.
```

Если пользователь находит UI-баг — сначала исправить его и сделать свежие скриншоты.

## Приоритет 2 — стандартные испытательные сцены

Добавить готовые JSON-сценарии:

```text
один пулемёт и одна стена;
два перекрёстных сектора;
неточный неизвестный источник;
лес против открытого поля;
складка рельефа;
два укрытия разного качества;
прямой опасный путь и длинный безопасный обход;
новобранец против ветерана;
низкая мораль и сильное подавление.
```

## Приоритет 3 — объяснимое поведение

Добавить:

```text
историю последних N решений;
пошаговый просмотр trace;
сравнение нескольких вариантов UtilitySelector;
причины отбраковки маршрута;
отображение конкретных факторов оценки клетки.
```

## Приоритет 4 — точное занятие укрытия

```text
точки позиций за предметом;
вместимость;
занятость;
выбор позы;
распределение нескольких бойцов;
переоценка при изменении направления огня.
```

## Приоритет 5 — масштабирование

Только после стабилизации одного бойца:

```text
ограниченный controlled subset бойцов;
обмен знаниями;
общие/личные карты;
кэширование по группам похожих знаний;
Web Workers после профилирования.
```

---

# 29. Чего нельзя делать дальше

```text
не трогать main без GO;
не возвращать legacy-ноды;
не превращать полигон сразу в полную боевую игру;
не запускать AI для всей армии до стабилизации одного бойца;
не смешивать PixiJS с core AI;
не считать всю awareness map каждый кадр;
не считать объективную информацию автоматически известной солдату;
не приравнивать маскировку к физической защите;
не приравнивать обычное поле к безопасному укрытию;
не возвращать разрозненные панели старого редактора;
не ломать scene-export-v3;
не менять storage v6 без миграционного решения;
не удалять editor-click-guard без замены;
не исправлять Playwright по догадке без журнала и последнего PNG;
не выдавать GitHub Actions запуск за локальный запуск на ПК пользователя.
```

---

# 30. Отдельная идея с LLM

В репозитории есть отдельный концептуальный документ:

```text
ideas/LLM_COMMANDERS_AND_TACTICAL_PLANNING.md
```

Он описывает будущую возможность использовать локальную/внешнюю LLM для планирования командиров и человеческих описаний планов.

Это **не текущая реализация AI Single-Unit Editor** и не должно смешиваться с GraphRunner без отдельной задачи пользователя.

---

# 31. Формат начала следующей сессии

Новый чат после чтения handoff должен коротко подтвердить:

```text
работаю в real-wargame-preview;
main не трогаю;
понимаю, что проект Vite + TypeScript + PixiJS;
понимаю разделение AI Node Editor / AiGameBridge / AiGraphRunner / AI Test Lab;
понимаю, что awareness субъективна для каждого бойца;
понимаю, что UI-правки требуют настоящей браузерной проверки;
понимаю, что пользователь не должен работать с терминалом;
готов продолжать с текущего выбранного приоритета.
```

Не нужно снова просить пользователя объяснять весь проект.

---

# 32. Формат завершения следующей задачи

```text
branch: real-wargame-preview
commit/pr: ...
transfer_path: direct push / PR into preview
checks_run: ...
manual_checks_needed: ...
remote_preview_commit: ...
branch_cleanup_status: ...
risks: ...
visual_check: GitHub Actions / local agent / user PC / not required
screenshots_inspected: yes / no / not required
```

Если менялся интерфейс, обязательны:

```text
реальный Vite-запуск;
реальный Chrome/Chromium;
свежий artifact от того же SHA;
просмотр ключевых PNG;
честное указание, где выполнялся запуск.
```
