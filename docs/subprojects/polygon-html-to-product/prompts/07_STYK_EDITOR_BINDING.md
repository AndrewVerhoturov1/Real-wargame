# Prompt исполнителю СТЫК — подключение принятого интерфейса редакторов к готовым механизмам продукта

Ты — исполнитель **СТЫК**.

В начале каждого отчёта напиши:

> Я — СТЫК. Отвечаю за подключение нового интерфейса редакторов Полигона к уже существующим настоящим механизмам продукта.

## 1. Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Репозиторий:

```text
AndrewVerhoturov1/Real-wargame
```

Целевая продуктовая ветка:

```text
real-wargame-preview
```

Planning anchor на момент подготовки prompt:

```text
commit: bd25f5debc312db7021b1515a525697ad248fff1
tree: 7dd8f092da7ae78eb41aac6c1d6edb71bebe4a9f
```

Принятый прототип:

```text
artifact: polygon-series-v1.1-memory-v3-interface-linkage(1).html
version: polygon-map-editor-unified-v44-infantry-integrated-20260815-memory-v3-interface-linkage-v1
```

Общий контракт этой волны:

`docs/subprojects/polygon-html-to-product/EDITORS_FUNCTIONAL_WAVE_20260818.md`

Прочитай его полностью до изменения кода.

## 2. Обязательная зависимость от визуальной линии

Визуальная часть редакторов выполняется отдельно.

Известный кандидат на момент подготовки prompt:

```text
branch: feat/20260817-polygon-editors-visual-parity
candidate_commit: 13a70b76bd5087b87c0767970eb378ba192a1b49
```

Этот SHA **не является вечным hard-coded base**.

Перед стартом product code оркестратор должен сообщить один из вариантов:

1. визуальный результат уже принят и перенесён в актуальный `real-wargame-preview`; или
2. дан exact accepted visual SHA, поверх которого разрешено создать stacked feature branch.

Если ни одно условие не выполнено — не начинай менять product code. Верни `BLOCKED: accepted visual base unresolved`.

## 3. Приоритет решений

При конфликте:

```text
явное решение пользователя
> принятый HTML-прототип
> правильная архитектура продукта как способ реализации
> старое поведение продукта
```

Архитектура продукта отвечает на вопрос **как реализовать**, но не отменяет принятое поведение прототипа.

Не переноси технические костыли HTML: DOM-state, prototype globals, fake data, prototype localStorage.

## 4. Главная задача

В принятом новом интерфейсе окна «Редакторы» подключить **уже существующие** product owners, registry, stores, commands, draft/save contracts и linked-editor routes.

Твоя работа — прежде всего wiring/adaptation:

```text
новый видимый control
→ существующая настоящая операция продукта
→ authoritative owner
→ реальное сохранение/readback
```

Ты не создаёшь новую игровую механику, если требуемой операции нет. Отсутствие product capability передаётся КУЗНЕЦУ или ПОЧВЕ.

## 5. Перед кодом — обязательная инвентаризация

Для каждого из 11 редакторов составь рабочую таблицу:

```text
редактор прототипа
→ видимые controls/actions прототипа
→ product owner/editor/schema
→ read path
→ write path
→ save/cancel/reset/open semantics
→ READY_FOR_BINDING / PRODUCT_GAP / SURFACE_TYPES_GAP
```

Не считай функцию отсутствующей только потому, что её не видно в текущем presentation.

Не считай функцию готовой только потому, что в schema есть похожее поле — должен существовать настоящий owner/write/readback path.

## 6. Перечень 11 редакторов

### 6.1 Профили маршрута

Подключить существующий Navigation/Route Profile owner и реальные поля:

- terrain costs;
- slope weight;
- danger/cover;
- maximum detour / maximum route cost;
- allow goal adjustment;
- replanning;
- directional terrain weights;
- остальные уже существующие поля schema.

Три отдельные механики **не реализовывать**:

```text
exposureWeight
enemyDistanceWeight
territoryWeights.friendly / neutral / enemy
```

Их runtime будет отдельной последующей работой. Не создавать fake effect.

Если визуальный интерфейс уже показывает эти поля, оставь технически честный seam для последующей маркировки КУЗНЕЦОМ как `не подготовлено / пока не работает`. Сам не реализуй runtime.

### 6.2 Тактические позиции

Использовать существующий owner/editor и его save semantics.

Сохранить принятую особенность продукта там, где она уже реально совпадает с требуемым поведением. Не создавать второй store.

### 6.3 Архетипы бойцов

Подключить реальные GameplayTuning fields и refs:

- traits;
- initial condition;
- `perceptionProfileId`;
- `conditionProfileId`;
- реальные linked-editor переходы.

Если новый UI требует прямого изменения встроенного профиля, а текущий owner это запрещает — **не обходи запрет локальным UI-хаком**. Это `PRODUCT_GAP` КУЗНЕЦА.

### 6.4 Профили внимания

Подключить настоящий Attention Profile owner/editor:

- глобальные параметры;
- режимы march / observe / search / engage;
- реальные defaults и save semantics.

### 6.5 Профили восприятия

Подключить существующие GameplayTuning perception fields.

Конфликт редактирования built-in не обходить presentation-кодом — передать КУЗНЕЦУ.

### 6.6 Профили движения

Подключить существующий Movement Profile owner:

- preferred gait;
- stance policy;
- fallback;
- category/order;
- numeric movement groups;
- logical switches;
- noise surface policy;
- fallback rules.

По текущему исследованию core product mechanism здесь уже достаточно полный; сначала докажи binding, а не планируй rewrite.

### 6.7 Вооружение

Подключить Combat Catalog:

- ammo;
- weapons;
- loadouts;
- stable IDs;
- revisions/status;
- существующие create/save/publish/new revision/archive operations.

Если прототип требует tuning опубликованной записи, а product owner делает published revision read-only — не ломай revision policy внутри UI. Зафиксируй `PRODUCT_GAP` КУЗНЕЦА.

### 6.8 Ранения и подавление

Подключить реальные GameplayTuning condition profiles и все подтверждённые поля ранений/подавления.

Built-in policy gap передать КУЗНЕЦУ.

### 6.9 Типы поверхностей

Отдельного authoritative Surface Types owner сейчас не подтверждено.

СТЫКУ запрещено:

- создавать fake editor;
- использовать Environment material как молчаливую замену;
- создавать локальный список из 8 типов только ради кликабельности;
- сохранять значения в presentation state/localStorage.

До результата ПОЧВЫ пункт остаётся честно unavailable/blocked в принятом интерфейсе.

### 6.10 Профили местности

Подключить существующий Environment Profile owner и реальные vegetation/material fields.

Если текущий owner сохраняет автоматически, а прототип требует `draft -> Save / Cancel`, не эмулируй отмену локальным snapshot без authoritative contract. Это product gap КУЗНЕЦА.

### 6.11 Направленный рельеф

Подключить реальные `directionalTerrain` данные выбранного NavigationProfile:

- forwardSlopePenalty;
- reverseSlopePreference;
- crestPenalty;
- silhouettePenalty;
- valleyPreference;
- criticalSectorMultiplier.

Переход «Открыть Профили маршрута» должен использовать настоящий editor-open route и реальный profile id.

## 7. Общие действия интерфейса

### 7.1 `↺` сброс поля

Если authoritative owner уже предоставляет нормативное/default значение и безопасную запись, реализуй кнопку нового интерфейса через этот контракт.

Не храни второй набор defaults в CSS/DOM/presentation.

Если достаточного контракта нет — `PRODUCT_GAP` КУЗНЕЦА.

### 7.2 Save / Cancel / dirty guard

Где product owner уже имеет draft/save/cancel/beforeClose — новый интерфейс обязан использовать именно его.

Не создавай локальный параллельный draft поверх готового authoritative draft.

### 7.3 Межредакторные переходы

Все переходы должны идти через стабильный product editor-open contract.

Нельзя:

- кликать DOM соседнего редактора;
- искать сущность по тексту;
- терять `id/profileId`;
- создавать presentation-only mapping как новый источник истины.

### 7.4 «Используется»

Если реальный where-used/reverse-reference owner уже существует — подключи его.

Если общего authoritative механизма нет — не синтезируй данные. Передай как gap КУЗНЕЦУ.

## 8. Разделение со СТЫКОМ и КУЗНЕЦОМ

Правило простое:

```text
операция реально существует → СТЫК подключает
операции/политики реально нет → КУЗНЕЦ проектирует/доделывает
новой сущности Surface Types нет → ПОЧВА
```

Если во время реализации выясняется новый gap, не расширяй scope самовольно. Запиши его в handoff КУЗНЕЦУ.

## 9. Разрешённые изменения

Разрешены только изменения, необходимые для functional binding принятого editor UI:

- presentation/controller adapters;
- editor mounting/open routes;
- event/listener wiring;
- использование существующих registry/store APIs;
- минимальные нейтральные helpers для подключения, если они не создают новую domain capability;
- focused tests на wiring.

## 10. Запрещённые изменения

Без отдельного решения не менять:

- core gameplay formulas;
- navigation runtime mechanics для трёх отложенных route факторов;
- GameplayTuning built-in policy;
- Combat Catalog published revision policy;
- Environment autosave/domain persistence policy;
- Surface Types domain model;
- map renderer/terrain model;
- AI/runtime только ради editor UI;
- `main`;
- `real-wargame-preview` напрямую.

Не делай deploy.

## 11. Проверки

Перед отчётом выполнить минимально достаточную проверку согласно `AGENTS.md` и risk policy.

Обязательно:

1. TypeScript/noEmit;
2. focused editor/wiring smoke, если существует;
3. `npm run build` или установленный preview verification route по правилам репозитория;
4. проверить, что registry definitions не потеряны;
5. открыть каждый из 10 реально доступных редакторов через новый интерфейс;
6. проверить save/readback минимум на одном безопасном пользовательском/draft объекте каждого типа owner, где это не разрушает fixtures;
7. проверить linked-editor переходы с точным id;
8. проверить dirty guard там, где он уже существует;
9. зафиксировать все PRODUCT_GAP без fake workaround.

Визуальную pixel-parity не переписывать. Если требуется browser/screenshot QA — использовать repository screenshot skill и exact final SHA.

## 12. Критерии ACCEPT

- новый интерфейс не является муляжом;
- существующие product editors/owners переиспользованы;
- нет второго registry/store/defaults/runtime;
- реальные поля читаются и сохраняются штатным путём;
- linked-editor routes передают реальные ID;
- отсутствующие product capabilities не подделаны;
- Surface Types остаётся честным gap;
- три route runtime mechanics не реализованы случайно;
- список gaps для КУЗНЕЦА полный и конкретный;
- diff не содержит unrelated product redesign.

## 13. Возврат результата оркестратору

Верни:

```text
executor: СТЫК
base_commit:
visual_base_commit:
feature_branch:
current_commit:
changed_files:
editor_inventory:
ready_bindings:
product_gaps_for_kuznets:
surface_types_status: blocked / owner absent
route_deferred_runtime_status:
checks_run:
not_checked:
manual_visual_checks_needed:
preview_touched: no
main_touched: no
deployment_touched: no
```

Не merge, не transfer, не deploy самостоятельно.
