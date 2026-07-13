# HANDOFF — иерархические состояния и планы ИИ v1

## Рабочая точка

- Репозиторий: `AndrewVerhoturov1/Real-wargame`
- База: `real-wargame-preview`
- Точный SHA базы: `cc907ca0f48caed418cd76b0f878c8b18fbe71c7`
- Временная ветка: `feat/ai-state-plan-v1-temp-2026-07-14`
- Validation-only PR: `#94` в отдельную ветку `validation/ai-state-plan-v1-base-2026-07-14`
- PR №94 не предназначен для слияния.
- `real-wargame-preview` и `main` не изменялись.

Параллельно разрабатывается система стрельбы. Этот этап не добавляет стрельбу, оружие, боеприпасы или результат попадания. Он создаёт общий контракт, через который будущая стрельба сможет добавлять события, Utility-ветви и планы без второго независимого runtime.

## Цель этапа

Первый законченный вертикальный срез:

```text
Общее состояние бойца
→ ограничивает допустимые Utility-ветви

Utility AI
→ выбирает лучший допустимый план

AiPlan
→ удерживает цель и последовательность шагов

Graph v2 / подграф
→ исполняет текущий шаг

Action Runtime
→ владеет реальным движением и cleanup
```

## Реализовано

### Состояния

```text
Normal / Обычное состояние
├─ Idle / Ожидание
└─ FollowingOrder / Выполнение приказа

Combat / Бой
├─ Contact / Контакт
└─ Suppressed / Подавлен
```

Основные файлы:

```text
src/core/ai/state/AiStateMachine.ts
src/core/ai/state/AiStateRuntime.ts
```

Есть:

- детерминированные приоритеты переходов;
- wildcard-переход `* → Suppressed`;
- минимальное время состояния;
- устойчивый порог выхода из подавления;
- сохранение общего родителя при переходе между дочерними состояниями;
- trace с причиной, trigger и временем симуляции;
- normalize/clone для старых и новых сцен.

### Планы

Основные файлы:

```text
src/core/ai/state/AiPlan.ts
src/core/ai/state/AiPlanRuntime.ts
src/core/ai/state/AiStatePlanPipeline.ts
```

Реализованы:

- `FollowMoveOrder`;
- `TakeCover`;
- один запуск шага;
- последовательное прохождение шагов;
- `retry`, `fail_plan`, `replan`;
- корректная отмена;
- новый `plan.id` и `replacesPlanId` при замене;
- восстановление шага со статусом `running` без повторного `start`.

### Связка с Graph v2 и движением

Изменены:

```text
src/core/ai/AiGameBridge.ts
src/core/ai/AiStatefulMoveGameBridge.ts
src/core/ai/runtime/AiRuntimeSession.ts
src/core/ai/runtime/AiRuntimeSnapshot.ts
```

Важное:

- активный план хранится внутри сериализуемого runtime-сеанса;
- состояние ограничивает допустимые планы;
- валидный план не пересоздаётся каждый тик;
- недопустимый план отменяется до выбора следующего;
- шаг плана вызывается через существующий зарегистрированный подграф;
- вложенное движение видят контроль маршрута и snapshot;
- старый cleanup выполняется до запуска нового движения;
- второй независимый runtime движения не добавлен.

### Интерфейс

Добавлены:

```text
src/ui/AiStatePlanPanel.ts
src/ai-state-plan-panel.css
src/ai-node-editor/state-machine-ui.ts
src/ai-node-editor/state-machine-ui.css
```

Изменены:

```text
src/ui/TacticalWorkspace.ts
src/ai-node-editor/runtime-debug-overlay.ts
src/ai-node-editor/main.ts
```

Пользователь видит по-русски:

- текущее, родительское и предыдущее состояние;
- причину перехода;
- активный и предыдущий план;
- статус и текущий шаг;
- причины выбора;
- условия отмены и перестроения;
- технические id только в раскрываемой диагностике;
- кнопку «Показать активный подграф» в редакторе.

Панели создаются один раз и обновляют только значения, а не весь DOM на каждом тике.

## Новые автоматические проверки

```text
npm run state-machine:smoke
npm run plan-runtime:smoke
npm run state-plan-scenario:smoke
```

Сквозной сценарий проверяет:

1. `Idle → FollowingOrder`;
2. создание `FollowMoveOrder`;
3. запуск `move_and_observe`;
4. `enemy_spotted` и переход в `Contact`;
5. один cancel и один cleanup старого движения;
6. создание `TakeCover`;
7. `Contact → Suppressed` без второго движения;
8. сохранение во время движения;
9. восстановление того же plan/step без повторного start;
10. достижение укрытия и завершение плана;
11. устойчивый `Suppressed → Contact`.

На первой CI-проверке уже подтверждены:

- новые три smoke-сценария;
- `graph-v2:smoke`;
- `runtime:smoke`;
- `runtime-session:smoke`;
- `workspace:smoke`;
- `editor:smoke`;
- `runtime-debug-v2:smoke`;
- политика веток и Agent Docs Integrity.

Найденные CI-ошибки были совместимыми: `Array.at` при старом target, неиспользуемый параметр и устаревшее ожидание версии экспорта v8 вместо текущей v9. Исправления внесены; полный повторный прогон ещё должен закончиться перед финальным отчётом.

## Визуальная проверка

Подготовлены:

```text
src/testing/AiStatePlanVisualQaHarness.ts
tests/ai-state-plan-visual.spec.ts
```

Тестовый режим активируется только URL-параметром:

```text
?visualQa=ai-state-plan
```

Обычная игра его не использует.

Запланированные PNG:

```text
state-following-order.png
state-contact-take-cover.png
state-suppressed.png
plan-restored-after-load.png
state-plan-node-editor.png
```

Chromium пока не запускался. Для запуска требуется отдельное разрешение пользователя согласно `.agents/skills/real-wargame-local-preview/SKILL.md`.

## Документация

Главное объяснение:

```text
docs/subprojects/ai-single-unit-editor/HIERARCHICAL_STATES_AND_PLANS_V1.md
```

План реализации:

```text
docs/superpowers/plans/2026-07-14-ai-state-plan-v1.md
```

## Следующие действия

1. Завершить полный validation-прогон всех обязательных smoke-команд и production build.
2. Исправлять только подтверждённые ошибки.
3. Запустить `npm run docs:sync` и `npm run docs:check`.
4. Удалить временные patch-скрипты и validation workflow из итогового diff.
5. Закрыть validation PR №94 без слияния.
6. Спросить пользователя, проводить ли подготовленную браузерную визуальную проверку.
7. Не переносить изменения в `real-wargame-preview` без отдельной прямой команды.

## Запрещено при продолжении

- не переносить эту ветку в preview автоматически;
- не трогать `main`;
- не смешивать сюда реализацию стрельбы;
- не создавать второй активный план или второй runtime движения;
- не запускать повторный `start` восстановленного шага;
- не выполнять cleanup нового приказа старым ownerToken;
- не утверждать, что PNG проверены, пока Chromium реально не запущен и изображения лично не осмотрены.
