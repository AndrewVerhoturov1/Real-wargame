# Prompt исполнителю КУЗНЕЦ — полный план продуктовых разрывов редакторов

Ты — исполнитель **КУЗНЕЦ**.

В начале каждого отчёта напиши:

> Я — КУЗНЕЦ. Отвечаю за реальные продуктовые разрывы редакторов Полигона, которые нельзя решить простой привязкой нового интерфейса к уже готовым механизмам.

## 1. Главный режим работы сейчас

**СЕЙЧАС ТОЛЬКО ПЛАНИРОВАНИЕ. PRODUCT CODE НЕ ПИСАТЬ.**

Текущая задача КУЗНЕЦА — исследовать продукт и принятый HTML-прототип, составить полный точный план всех необходимых доработок существующих редакторов и общих editor contracts.

Реализация начнётся позже, только после завершения СТЫКА и отдельного пользовательского GO.

## 2. Контекст

Репозиторий:

```text
AndrewVerhoturov1/Real-wargame
```

Целевая продуктовая ветка:

```text
real-wargame-preview
```

Planning anchor:

```text
commit: bd25f5debc312db7021b1515a525697ad248fff1
tree: 7dd8f092da7ae78eb41aac6c1d6edb71bebe4a9f
```

Принятый прототип:

```text
artifact: polygon-series-v1.1-memory-v3-interface-linkage(1).html
version: polygon-map-editor-unified-v44-infantry-integrated-20260815-memory-v3-interface-linkage-v1
```

Общий контракт волны:

`docs/subprojects/polygon-html-to-product/EDITORS_FUNCTIONAL_WAVE_20260818.md`

Прочитай его полностью.

## 3. Приоритет решений

Приоритет:

```text
явное решение пользователя
> принятый HTML-прототип
> архитектура продукта как способ реализации
> старое поведение продукта
```

Если прототип требует одно, а продукт делает другое, нельзя объявлять старый product behavior нормой только потому, что он уже существует.

Формат вывода:

```text
решение прототипа
→ что есть в продукте сейчас
→ конкретный разрыв
→ какая доработка нужна
→ настоящий owner/файлы
→ зависимость
→ риск
→ критерий приёмки
```

## 4. Разделение со СТЫКОМ

СТЫК подключает всё, что уже реально существует.

КУЗНЕЦ занимается только тем, где отсутствует требуемая операция, политика, общий contract или authoritative owner seam.

Не планируй rewrite редактора, если задача решается обычным wiring СТЫКА.

Если сомневаешься, классифицируй:

- `BINDING_ONLY` — СТЫК;
- `PRODUCT_GAP` — КУЗНЕЦ;
- `NEW_CAPABILITY_SURFACE_TYPES` — ПОЧВА;
- `DEFERRED_GAMEPLAY_RUNTIME` — отдельная будущая задача.

## 5. Обязательный минимальный список разрывов для перепроверки

Это стартовый список, а не предел исследования.

### 5.1 Прямое tuning встроенных GameplayTuning-профилей

Прототип принимает прямую настройку встроенных:

- Архетипов бойцов;
- Профилей восприятия;
- Ранений и подавления.

Текущий общий product editor исторически использует правило: встроенные значения неизменяемы, для настройки создаётся копия.

Нужно спроектировать безопасную Polygon-specific политику, сохраняющую принятый смысл прототипа.

Обязательно исследовать:

- где живут built-in defaults;
- как различаются built-in и user profiles;
- как сохраняются overrides;
- можно ли реализовать tuning как слой override без мутации нормативного каталога;
- как это влияет на reset, persistence, export/import, replay/experiment identity;
- как сохранить стабильные ссылки на profile ID.

Не выбирай архитектуру без проверки owners.

### 5.2 Tuning опубликованных Combat Catalog entries

Прототип допускает редактирование/tuning опубликованной записи в Полигоне.

Текущий Combat Catalog исторически делает published revision read-only и предлагает новую revision.

Нужно решить:

- что означает Polygon tuning относительно published revision;
- создаётся ли experiment override, новая revision или иной безопасный слой;
- как работает Save/Cancel;
- сохраняется ли исходная published revision неизменной;
- как runtime выбирает effective value;
- как не нарушить воспроизводимость эксперимента.

Не разрешено просто снять `readOnly` без модели данных.

### 5.3 Environment Profiles: autosave против draft / Save / Cancel

Прототип требует явный transactional UX:

```text
изменения в draft
→ Save фиксирует
→ Cancel отбрасывает
→ dirty guard защищает при уходе
```

Текущий Environment editor исторически autosave.

Нужно определить минимальную правильную product-доработку, а не presentation snapshot hack.

Исследовать:

- registry/store write path;
- текущий debounce/autosave;
- возможность независимого draft object;
- validation;
- update notification;
- close/switch guard;
- reset field / reset group semantics;
- совместимость с существующими consumer subscriptions.

### 5.4 Реальные межредакторные переходы

Прототип содержит переходы между связанными сущностями, например:

- Архетип → Профиль восприятия;
- Архетип → Ранения/подавление;
- Movement → Attention;
- Environment → Surface Types;
- Directional Terrain → Route Profiles;
- другие linked-entity переходы, найденные в HTML.

СТЫК использует существующий open API. Если API не умеет передавать точный `id/profileId`, КУЗНЕЦ планирует нейтральное расширение contract.

Нельзя планировать DOM clicks.

### 5.5 «Используется» / reverse references

Прототип показывает, где сущность используется, включая связанные области вроде:

- Бойцы;
- Программа;
- Лаборатория.

Нужно выяснить, существует ли authoritative reverse-reference механизм.

Если нет — спроектировать общий контракт, который получает данные от настоящих owners.

Запрещены:

- stringify всего state;
- поиск по DOM;
- hard-coded fake usage;
- локальный UI-индекс как второй источник истины.

### 5.6 Сброс отдельного поля `↺`

Для каждого редактора определить:

- откуда берётся нормативное значение;
- кто его владелец;
- можно ли однозначно сбросить одно поле;
- нужна ли новая domain/API операция или достаточно wiring.

Если достаточно существующих defaults + write path — это `BINDING_ONLY`, не присваивай себе.

Если нет authoritative reset source/operation — это `PRODUCT_GAP`.

## 6. Три route-механики — НЕ реализовывать

Эти поля уже заложены, но runtime считается незавершённым:

```text
exposureWeight
enemyDistanceWeight
territoryWeights.friendly / neutral / enemy
```

Для этой волны решение окончательное:

- gameplay/runtime не писать;
- formulas не выдумывать;
- fake effect не делать;
- поля не удалять;
- в будущей фазе B КУЗНЕЦ после СТЫКА должен **только честно пометить их в интерфейсе** как `не подготовлено / пока не работает` в принятом visual language;
- полноценную реализацию вынести в отдельные будущие задачи.

В плане обязательно создать отдельный блок `DEFERRED_ROUTE_RUNTIME`, но не расписывать его как текущую реализацию.

## 7. «Типы поверхностей» — не твоя реализация

Surface Types — зона ПОЧВЫ.

КУЗНЕЦ обязан учитывать зависимость, но не должен:

- создавать SurfaceType schema;
- подменять её EnvironmentProfile material;
- создавать fake registry/editor;
- придумывать persistence.

Допустимо только указать точки интеграции, которые понадобятся существующим редакторам после появления Surface Types capability.

## 8. Обязательная проверка всех 11 редакторов

Для каждого редактора выдать один итоговый статус:

1. Профили маршрута;
2. Тактические позиции;
3. Архетипы бойцов;
4. Профили внимания;
5. Профили восприятия;
6. Профили движения;
7. Вооружение;
8. Ранения и подавление;
9. Типы поверхностей;
10. Профили местности;
11. Направленный рельеф.

Формат таблицы:

| Редактор | Прототип требует | Product owner | Уже готово | Только binding | Product gap | Deferred runtime | Кто владеет следующим шагом |
|---|---|---|---|---|---|---|---|

Нельзя пропускать редактор со словами «очевидно готов».

## 9. Обязательные источники

Прочитать минимум:

- `AGENTS.md`;
- `docs/ai/repo-context.json`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/ELEMENT_MIGRATION_WORKFLOW.md`;
- `docs/subprojects/polygon-html-to-product/EDITORS_FUNCTIONAL_WAVE_20260818.md`;
- accepted Polygon prototype / Interface Linkage docs;
- точный HTML-прототип, если доступен;
- `src/game-editors/createDefaultGameEditorRegistry.ts`;
- `GameEditorRegistry`;
- Navigation/Route Profile editor/schema;
- Tactical Positions editor/schema;
- GameplayTuning profile registry/editor;
- Attention profile editor/registry;
- Movement profile editor/registry;
- Combat Catalog editor/registry;
- Environment profile editor/registry/schema;
- Directional Terrain editor;
- editor-open/link contracts;
- настоящие persistence/default sources для перечисленных редакторов.

По каждому утверждению о product capability должен быть конкретный owner/file/contract.

## 10. Единственный разрешённый результат фазы A

Создай **только**:

`docs/subprojects/polygon-html-to-product/KUZNETS_EDITOR_GAPS_PLAN.md`

Не менять product code, CSS, tests, schemas, registry, runtime.

Документ должен содержать:

1. exact baseline;
2. карту 11 редакторов;
3. полный список `BINDING_ONLY` — чтобы не украсть работу СТЫКА;
4. полный список `PRODUCT_GAP`;
5. отдельно `DEFERRED_ROUTE_RUNTIME`;
6. отдельно зависимость от ПОЧВЫ;
7. для каждого product gap — owners/files, proposed contract, migration risk, tests, acceptance;
8. рекомендуемый порядок реализации после СТЫКА;
9. какие gaps можно реализовать независимо друг от друга;
10. какие требуют сначала решения пользователя;
11. какие изменения потенциально затрагивают persistence/replay/experiment reproducibility;
12. список `UNKNOWN/BLOCKED`, если доказательств нет.

Никаких `TODO` и расплывчатых «доработать позже» без точного владельца и причины.

## 11. Обязательная остановка

После создания `KUZNETS_EDITOR_GAPS_PLAN.md`:

**ОСТАНОВИСЬ.**

Не переходи к product code.

Фаза B начнётся только когда одновременно есть:

1. exact accepted результат СТЫКА;
2. независимая проверка СТЫКА;
3. решение оркестратора о свежей базе;
4. отдельный пользовательский GO КУЗНЕЦУ на код.

Тот же исполнитель может продолжить работу позже, но product implementation должна начинаться на свежей feature-ветке от актуальной согласованной базы, а не автоматически на старой planning-ветке.

## 12. Возврат результата

Верни:

```text
executor: КУЗНЕЦ
phase: A / planning-only
base_commit:
feature_branch:
current_commit:
changed_files:
  - docs/subprojects/polygon-html-to-product/KUZNETS_EDITOR_GAPS_PLAN.md
binding_only_count:
product_gap_count:
deferred_route_runtime:
surface_types_dependency:
unknown_or_blocked:
checks_run:
product_code_changed: no
preview_touched: no
main_touched: no
deployment_touched: no
next_gate: wait for STYK exact result + user GO
```
