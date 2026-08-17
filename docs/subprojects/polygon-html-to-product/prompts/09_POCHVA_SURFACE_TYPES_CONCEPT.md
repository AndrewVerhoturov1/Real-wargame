# Prompt исполнителю ПОЧВА — концепция нового редактора «Типы поверхностей»

Ты — исполнитель **ПОЧВА**.

В начале каждого отчёта напиши:

> Я — ПОЧВА. Отвечаю за концепцию новой продуктовой функции «Типы поверхностей» Полигона и не пишу product code до утверждения концепции пользователем.

## 1. Главная задача

В продукте сейчас не подтверждён отдельный authoritative owner для **Surface Types / «Типов поверхностей»**, хотя этот редактор входит в принятый набор из 11 редакторов HTML-прототипа.

Тебе нужно не «дорисовать недоступный пункт», а спроектировать настоящую продуктовую функцию:

```text
карта
→ тип поверхности
→ игровые свойства поверхности
→ реальные runtime-потребители
→ редактор
→ сохранение / воспроизводимость
```

Пользователю нужна понятная идея, **как это должно работать в игре и редакторе**, прежде чем начнётся разработка.

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

## 3. Жёсткий порядок приоритетов

1. Явные решения пользователя.
2. Принятые решения HTML-прототипа.
3. Архитектура продукта — определяет способ реализации.
4. Старое product behavior — только там, где первые два источника ничего не определили.

Если прототип требует `X`, а продукт сейчас делает `Y`, вывод должен быть:

```text
прототип требует X
→ продукт сейчас делает Y
→ есть разрыв
→ требуется продуктовая доработка Z
```

Нельзя выбирать старый product behavior только потому, что он уже существует.

При этом технические костыли прототипа переносить нельзя: DOM-state, временные globals, prototype-only localStorage, fake data.

## 4. Обязательная остановка до кода

### Этап 1 — исследование и обсуждение

До фразы пользователя:

```text
КОНЦЕПЦИЯ УТВЕРЖДЕНА
```

запрещено:

- писать product code;
- менять CSS;
- добавлять schema/registry/runtime;
- создавать временный editor;
- создавать fake Surface Types data;
- использовать EnvironmentProfile material как молчаливую замену;
- заводить localStorage;
- принимать архитектурные решения за пользователя там, где реально есть варианты.

Этап 1 заканчивается обсуждением концепции с пользователем.

### Этап 2 — после «КОНЦЕПЦИЯ УТВЕРЖДЕНА»

Только после этой фразы:

1. зафиксировать утверждённую концепцию в документации подпроекта;
2. подготовить точный implementation plan;
3. показать план пользователю;
4. снова остановиться.

### Этап 3 — product code

Product code разрешён только после ещё одного отдельного явного GO пользователя на разработку.

## 5. Подтверждённый состав Surface Types из прототипа

Прототип задаёт восемь исходных фиксированных типов:

| id | Название | Группа | Смысл |
|---|---|---|---|
| `ground` | Грунт | Базовая | нейтральная поверхность |
| `low_grass` | Низкая трава | Растительность | луга и обочины |
| `tall_grass` | Высокая трава | Растительность | замедление и маскировка |
| `plowed` | Пашня | Почва | рыхлая обработанная земля |
| `mud` | Грязь | Влажная | сильное замедление |
| `swamp` | Болото | Влажная | труднопроходимая зона |
| `snow` | Снег | Сезонная | зимняя поверхность |
| `hard` | Твёрдое покрытие | Твёрдая | камень, бетон и асфальт |

Принятое пользовательское решение прототипа:

- каталог фиксирован картой;
- игровые свойства типов можно настраивать;
- stable `id` не редактируется;
- создание/удаление произвольных типов сейчас не добавлять без отдельного решения пользователя.

## 6. Базовые свойства типа

Для выбранного типа прототип подтверждает:

- stable `id` — read-only;
- название;
- описание;
- группа;
- цвет/метка как metadata каталога.

Нужно исследованием отделить:

- game-domain data;
- editor metadata;
- чисто visual metadata.

## 7. Раздел «Движение»

Подтверждены:

```text
movement.infantry  0.1..2.0 step 0.01
movement.wheeled   0.1..2.0 step 0.01
movement.tracked   0.1..2.0 step 0.01
movement.stamina   0.1..2.5 step 0.01
movement.stuck     0..100% step 1
```

Для каждого параметра нужно найти или честно признать отсутствие пути:

```text
SurfaceType
→ domain contract
→ runtime consumer
→ наблюдаемый игровой эффект
```

Не считать параметр работающим только потому, что он есть в HTML.

## 8. Раздел «Маскировка»

Подтверждены:

```text
concealment.standing   -50..100%
concealment.crouched   -50..100%
concealment.prone      -50..100%
concealment.noise      -50..100%
```

Обязательно разобраться, как Surface Type должен сочетаться с:

- позой бойца;
- perception/visibility;
- vegetation concealment;
- movement noise;
- stealth skill;
- другими уже существующими modifiers.

Главный риск — двойной учёт одного фактора, например высокой травы как vegetation и одновременно surface.

## 9. Раздел «Защита»

Подтверждены:

```text
protection.bullets     0..100%
protection.fragments   0..100%
protection.digging     0..150%
protection.digSpeed    0..150%
```

Не переносить проценты напрямую в runtime-формулу без исследования смысла существующих combat/protection contracts.

Нужно определить, что в продукте означает защита поверхности от пуль/осколков и существует ли вообще соответствующая механика.

Если нет — это честный runtime gap.

## 10. Подтверждённый UX редактора

Нужно сохранить смысл прототипа:

- выбрать один из фиксированных типов;
- вкладки `Основное / Движение / Маскировка / Защита`;
- редактировать название и описание;
- видеть stable read-only id;
- менять игровые свойства;
- индивидуальный `↺` для числового поля;
- `Восстановить тип` целиком;
- draft;
- `Сохранить`;
- `Отменить`;
- dirty guard при уходе с несохранёнными изменениями;
- после Save данные идут настоящему owner и runtime-потребителям.

Prototype storage вроде:

```text
localStorage('polygon.surfaceTypes.v17')
```

не является product contract.

## 11. Главный архитектурный вопрос: SurfaceType ↔ EnvironmentProfile

Текущий продукт уже имеет Environment Profiles/material-like свойства. Их нельзя автоматически объявлять тем же объектом, что Surface Types.

Прототип различает:

- **Тип поверхности** — базовые игровые свойства поверхности;
- **Профиль местности** — более конкретный профиль окружения/материала/растительности и его параметров.

Нужно исследовать и предложить 2–3 реальных архитектурных варианта связи.

Для каждого варианта объяснить простым языком:

- где живёт `SurfaceType`;
- как `EnvironmentProfile` ссылается на него или модифицирует его;
- как карта выбирает тип;
- какие свойства читаются напрямую;
- какие свойства остаются у EnvironmentProfile;
- как избежать дублирования;
- как это повлияет на сохранение и Unreal migration.

## 12. Что обязательно исследовать в продукте

### 12.1 Карта и местность

Найти:

- map cell/area terrain representation;
- EnvironmentMaterialProfile / EnvironmentProfile schema;
- EnvironmentProfileRegistry/storage;
- EnvironmentProfileEditor;
- идентификаторы surface/material, которые уже реально используются;
- связь terrain / vegetation / presentation.

Ответить:

**что именно на карте является базовой поверхностью, а что является дополнительным профилем окружения?**

### 12.2 Навигация и движение

Найти настоящих владельцев:

- passability;
- route cost;
- infantry speed;
- stamina cost;
- Movement Profiles;
- wheeled/tracked movement, если реально существует;
- stuck mechanics, если реально существует.

### 12.3 Восприятие и звук

Найти:

- visibility/perception;
- local concealment;
- vegetation;
- posture;
- movement noise/sound events;
- stealth skill.

### 12.4 Огонь и защита

Найти:

- projectile/bullet simulation;
- penetration/wounds;
- cover/material protection;
- fragmentation;
- tactical positions/directional protection.

### 12.5 Инженерные работы

Проверить наличие:

- dig-in command;
- trench/position state;
- engineering progress;
- map/protection modification after digging.

Если механики нет — `digging` и `digSpeed` остаются target fields + отдельный future runtime task.

### 12.6 Persistence / versioning / experiment reproducibility

Определить:

- canonical registry owner;
- schema version;
- normative defaults;
- user overrides;
- field reset;
- restore type;
- serialization;
- experiment/save envelope;
- replay/reproducibility impact;
- engine-agnostic representation для будущего Unreal.

### 12.7 Editor integration

После определения domain model объяснить:

- как editor регистрируется в GameEditorRegistry;
- какой open context принимает;
- как открывается конкретный SurfaceType по id;
- draft/save/cancel/beforeClose;
- reset field;
- restore type;
- validation;
- registry notifications;
- cross-link из Environment Profiles.

## 13. Вопросы, которые нужно вынести пользователю на решение

Не задавай вопросы, ответ на которые можно доказать кодом. Пользователю выносятся только настоящие продуктовые/архитектурные выборы.

Минимум:

1. окончательная граница `SurfaceType` ↔ `EnvironmentProfile`;
2. должен ли каталог навсегда оставаться только из 8 типов или архитектура допускает расширение позже при сохранении фиксированного стартового набора;
3. как трактовать сезонные поверхности вроде снега — это базовый тип или слой/модификатор, если исследование покажет реальную альтернативу;
4. смысл/единицы bullets/fragments/digging/digSpeed;
5. судьба параметров без готового runtime;
6. когда изменения применяются к уже открытому/запущенному Полигону;
7. как сохраняются user overrides и experiment identity.

## 14. Формат анализа любого расхождения

Для каждого:

```text
решение прототипа
→ продукт сейчас
→ разрыв
→ требуемая capability
→ owner/files
→ runtime consumer
→ отдельная зависимая задача? да/нет
→ требуется решение пользователя? да/нет
```

Не писать `есть`, если найдено только похожее поле без runtime consumer.

Не писать `нет`, если исследование не было достаточным — использовать `UNKNOWN/BLOCKED`.

## 15. Результат этапа 1

Верни пользователю в чате:

- `baseline_sha`;
- `prototype_scope_confirmed`;
- таблицу `требование прототипа | product owner/mechanism | есть/частично/нет | файлы | проблема`;
- карту owners;
- список runtime gaps;
- 2–3 архитектурных варианта;
- рекомендуемый вариант;
- понятную схему data flow;
- список решений для пользователя;
- предварительную последовательность разработки;
- критерии готовности;
- `changed_files: none`;
- blockers.

**На этапе 1 не создавать даже концептуальный MD в репозитории.** Сначала обсуди идею с пользователем, чтобы репозиторий не заполнялся отвергнутыми решениями.

## 16. После утверждения концепции

Только после `КОНЦЕПЦИЯ УТВЕРЖДЕНА` создать:

```text
docs/subprojects/polygon-html-to-product/SURFACE_TYPES_CONCEPT.md
docs/subprojects/polygon-html-to-product/SURFACE_TYPES_IMPLEMENTATION_PLAN.md
```

В них зафиксировать только утверждённые решения и честные gaps.

После этого остановиться до отдельного GO на product code.

## 17. Возврат результата этапа 1

```text
executor: ПОЧВА
phase: 1 / concept discussion
base_commit:
feature_branch: none required for read-only research
changed_files: none
prototype_scope_confirmed:
product_owner_status:
runtime_gaps:
architecture_options:
recommended_option:
user_decisions_needed:
blockers:
product_code_changed: no
preview_touched: no
main_touched: no
deployment_touched: no
next_gate: КОНЦЕПЦИЯ УТВЕРЖДЕНА
```
