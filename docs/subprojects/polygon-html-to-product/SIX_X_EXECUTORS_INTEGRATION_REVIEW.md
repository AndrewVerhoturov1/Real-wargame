# Сводный review шести исполнителей X — Polygon HTML → Product

Дата проверки: 2026-08-17  
Репозиторий: `AndrewVerhoturov1/Real-wargame`  
Целевая ветка: `real-wargame-preview`  
Текущий и общий base шести исполнителей: `8292bf25bf241712901090fcb565dded939e7a08`

## Итоговый вердикт

**`NOT_READY_TO_COMBINE`**

Все шесть ожидаемых веток и PR существуют, и в проверенных diff не найдено сознательного создания второго map/runtime/selection/renderer/history owner. Однако переносить шесть результатов в `real-wargame-preview` сейчас нельзя.

Главные блокеры:

1. **ЛИНЗА не подключена к общему right-panel seam ПУЛЬСА.** Её LIVE data/view код существует, но ни один изменённый файл ЛИНЗЫ не монтирует его в продуктовый shell. После простого объединения веток `Инфо / Внимание / Память` сами не появятся.
2. **КОНТЕКСТ не подключён к ПУЛЬСУ / ЛИНЗЕ / РЕДАКТОРАМ.** `openPanel` и `openEditor` являются внедряемыми callbacks, но текущий caller их не передаёт; пункты `Юнит / Внимание / Память / Инфо / Редактировать` поэтому остаются disabled. Реально работает только маршрут `Выбрать` через штатный `selectUnit`.
3. **Обязательная проверочная матрица не закрыта у пяти направлений из шести.** ПУЛЬС, ЛИНЗА, КОНТЕКСТ и текущий head ПЕШКИ не имеют полного exact-head `typecheck + build + focused checks + browser/screenshot QA`; РЕДАКТОРЫ не имеют свежей browser/screenshot проверки и отдельного editor smoke на итоговом head.
4. **Pixel-perfect соответствие утверждённому HTML не подтверждено.** Exact файл `polygon-series-v1.1-memory-v3-interface-linkage(1).html`, на который ссылаются исполнители, в доступном дереве репозитория не найден. Для КАРТЫ есть свежий exact-SHA browser artifact и reference PNG; это доказывает рабочую композицию и настоящий canvas, но не пиксельное равенство исходному HTML.
5. **Есть реальный интеграционный hotspot в `src/combat-lab/main.ts`.** Его одновременно меняют КАРТА, ПУЛЬС и РЕДАКТОРЫ. Каждый PR отдельно mergeable относительно общей базы, но это не доказывает pairwise merge; простой blind merge/cherry-pick без ручного сведения общего startup/lifecycle кода небезопасен.
6. **КОНТЕКСТ выполняет полный проход по `state.map.objects` на RMB pointerdown.** Это не hot pointermove и не ticker, но это `O(map.objects)` интерактивная работа при наличии уже принятого spatial-index подхода в продукте. По performance contract этот путь нужно либо сделать bounded/local, либо отдельно обосновать и измерить перед ACCEPT.

## Манифест навыков

### skills_read

- `real-wargame-orchestration` — прочитан первым; exact SHA является единицей handoff/review, merge/transfer запрещён без отдельного GO.
- `real-wargame-ai-runtime` — прочитан для ownership/runtime границ, movement/order и субъективного knowledge.
- `real-wargame-performance` — прочитан; проверялись bounded work, prepared owners, recurring UI work, renderer lifecycle и teardown.
- `real-wargame-screenshots` — прочитан; зелёный workflow сам по себе не считался визуальным доказательством.
- `real-wargame-local-preview` — прочитан условно для правил browser/evidence.
- `real-wargame-pixijs` — прочитан условно для КАРТЫ, ПЕШКИ, camera/input и renderer ownership.

### skills_unavailable

- `real-wargame-documentation` — **недоступен**: `.agents/skills/real-wargame-documentation/SKILL.md` возвращает `404 Not Found` на текущем `real-wargame-preview`. Поэтому специальные правила именно этого skill не выдаются здесь за прочитанные. Документ оформлен по `AGENTS.md`, orchestration contract и существующей документации подпроекта.

### skills_skipped

- нет среди навыков, перечисленных в задании аудитора.

Дополнительно прочитаны `AGENTS.md`, `IMPLEMENTATION_WAVE_20260817.md`, `ORCHESTRATOR_HANDOFF_20260817.md`, `INTEGRATION_STATUS.md`, prompt-файлы шести направлений и относящиеся к ним owner/contract документы.

## Проверенная идентичность веток

У всех шести веток `merge_base == 8292bf25bf241712901090fcb565dded939e7a08`, `behind_by == 0`. Это подтверждает, что они действительно стартовали от общей базы задания.

| Направление | Ветка | PR | Base → фактический head | Фактический объём | Реальные проверки / evidence | Основные проблемы | Готовность |
|---|---|---:|---|---|---|---|---|
| КАРТА | `feature/20260817-polygon-map-surface-x` | [#283](https://github.com/AndrewVerhoturov1/Real-wargame/pull/283) | `8292bf25…` → `74d476992c002cebca5c8c9e5de3336c338355ec` | 1 commit, 2 файла. Возвращает существующий Pixi canvas в shell через CSS/layout; не создаёт второй renderer/map state. | Exact-SHA run `31992089286`: typecheck, build, map revision/grid smokes, Chromium browser QA. Artifact `9275675057` скачан аудитором; открыты reference и ключевые PNG, `evidence.json.sha == 74d4769…`, `errors == []`. | Pixel-perfect к exact HTML не доказан; на 1080×800 при двух открытых панелях карта реально сжимается до ~252×252 canvas. | **Условно готов к integration candidate**, но не доказывает pixel-perfect. |
| ПУЛЬС | `feature/20260817-polygon-pulse-live-unit-x` | [#285](https://github.com/AndrewVerhoturov1/Real-wargame/pull/285) | `8292bf25…` → `6ac3d2e0ad204bf6809859b5362abf0a53b48c4b` | 1 commit, 9 файлов. Нейтральный right-panel seam, LIVE Unit, real UnitModel presentation, posture через `CombatLabVisualSession.executeInteractive`, readback, editor links. | GitHub Preview Policy + Agent Docs Integrity зелёные. Executor сообщает passed source-contract smoke / syntax transpile. Код smoke для real posture transition существует и проверен чтением. | Полный `typecheck`, build, presentation smoke и browser QA exact head не выполнены. Добавлен per-ticker `inspector.refresh()` — bounded до выбранного юнита, но это recurring UI work и требует проверки в общем кандидате. | **Не готов к transfer** до exact-head checks + visual QA. |
| РЕДАКТОРЫ | `feature/20260817-polygon-editors-new-design-x` | [#284](https://github.com/AndrewVerhoturov1/Real-wargame/pull/284) | `8292bf25…` → `66895a4b7c85b9b206dbce7ab07ecbf968a4bcc5` | 2 commits, 6 файлов. Reparent существующих hosts и catalogue через `CombatLabEditorShellBridge`, без второго registry. | Implementation SHA `5739a5a…`: `tsc` прошёл; вложенный matrix зафиксировал build passed. PR Risk overall красный из-за pre-existing trailing whitespace в исторических файлах, не из editor diff. Current docs-only tail: Preview Policy + Agent Docs Integrity зелёные. | `combat-lab-game-editors:smoke` отдельно не запускался; browser/screenshot QA итогового UI не выполнен; не проверены все редакторы и narrow layout. Пересекается с КАРТОЙ/ПУЛЬСОМ в `main.ts`. | **Не готов к transfer** до focused editor + browser QA на integration candidate. |
| ЛИНЗА | `feature/20260817-polygon-linza-right-panel-x` | [#287](https://github.com/AndrewVerhoturov1/Real-wargame/pull/287) | `8292bf25…` → `4e453b85adbe91af5dd5028bbf70ce74b941c390` | 2 commits, 5 файлов. Real Info/Attention/Memory adapters/views; prepared terrain/object owners; canonical Attention writes; subjective `perceptionKnowledge`. | Preview Policy + Agent Docs Integrity. Executor сообщает TS syntax transpilation. Focused smoke source подробно проверяет bounded Info и запрет второго owner, но сам smoke в полном checkout не запускался. | **Hard blocker:** view нигде не установлен в shell/PULSE seam. Full typecheck/build/smoke/browser не выполнены. `nearbyUnits`, `danger`, `estimatedFront` честно `unavailable`. | **Не готов.** Нужен integration hook после ПУЛЬСА и полный QA. |
| КОНТЕКСТ | `feature/20260817-polygon-entity-context-menu-x` | [#288](https://github.com/AndrewVerhoturov1/Real-wargame/pull/288) | `8292bf25…` → `2297b3ca919ff938233ceb2f973001bd3effecab` | 1 commit, 8 файлов. Entity target, short-RMB arbitration внутри существующего `TacticalOrderRadialInput`, menu UI, Playwright spec. | Preview Policy + Agent Docs Integrity. Executor сообщает isolated type compatibility и 5 чистых arbitration assertions. Tactical Order Visual QA на current head — skipped. | **Hard blocker:** panel/editor callbacks не подключены, соответствующие menu items disabled. Playwright/typecheck/build/browser не выполнены. PR остаётся draft. Map-object hit test — полный `O(objects)` scan на pointerdown. | **Не готов.** |
| ПЕШКА | `feature/20260817-polygon-unit-map-token-x` | [#286](https://github.com/AndrewVerhoturov1/Real-wargame/pull/286) | `8292bf25…` → `71ebbecbf2f8914653a96bc5199c5efe584df57f` | 2 commits, 7 файлов. Развит единственный `PixiUnitRenderer`: near/medium/far LOD, posture shapes, weapon/facing, movement/suppression/wound/death cues, persistent views. | Implementation SHA `bdae5ea…`: PR Risk overall красный на inherited historical whitespace; TypeScript и вложенный build прошли до этого gate. Последний `71ebbec…` — docs-only tail; Preview Policy + Agent Docs Integrity зелёные. | PR body всё ещё показывает старый implementation head; fresh exact-current product QA отсутствует. Browser/screenshot QA не выполнялся. Commander star/role label/squad hull не реализованы без надёжного owner — это честный unsupported volume, а не fake. | **Не готов к transfer** до exact combined renderer QA. |

> `mergeable: true` у отдельных PR означает только, что каждый PR GitHub может свести с текущей base-веткой в отдельности. Это **не** доказательство, что шесть PR совместимы друг с другом после последовательного объединения.

## Что фактически реализовано по полному функциональному объёму волны

| Требование | Состояние по шести веткам | Вывод |
|---|---|---|
| Настоящая карта через `PixiMapRenderer` | КАРТА открывает уже существующий product canvas; runtime diagnostics подтверждают live map/unit renderer. | Реализовано и browser-проверено на SHA КАРТЫ. |
| Маркеры и LOD через `PixiUnitRenderer` | ПЕШКА меняет именно существующий renderer, persistent view reuse сохранён. | Код есть; визуальная приёмка exact head отсутствует. |
| Selection → LIVE Unit | ПУЛЬС переиспользует `CombatLabWorkspaceServices.selection` / `getSelectedUnit`; второго selection store нет. | Код есть; end-to-end browser QA не закрыт. |
| Posture command → simulation → readback | Используется `CombatLabVisualSession.executeInteractive({kind:'posture'})`; smoke source проверяет отсутствие optimistic posture и завершение simulation transition. | Архитектура правильная; полный smoke на current head не выполнен. |
| Инфо / Внимание / Память | ЛИНЗА читает настоящие owners и не создаёт front/history runtime. | **Не достигается пользователем**, пока view не подключён к ПУЛЬСУ. |
| Редакторы через `GameEditorRegistry` | РЕДАКТОРЫ переиспользуют уже установленный registry/overlay/hosts. | Код есть; полный browser inventory не проверен. |
| Контекстное меню сущности | Меню и arbitration реализованы. | **Частично:** owner routes panel/editor не переданы, пункты disabled. |
| Quick move / right-drag / radial orders | КОНТЕКСТ встроен в существующий `TacticalOrderRadialInput`, не создаёт второй order runtime. | Код намеренно сохраняет сценарии, но Playwright доказательство не запускалось. |
| Карта ↔ пешка ↔ ПУЛЬС ↔ ЛИНЗА | КАРТА/ПЕШКА/ПУЛЬС имеют совместимые owners; ЛИНЗА ждёт seam. | Полной цепочки пока нет. |
| Нет подмены реальных данных demo-значениями | В ключевых проверенных файлах fake product data не найдено. ПУЛЬС читает UnitModel/combat runtime; ЛИНЗА показывает unsupported как `unavailable`; ПЕШКА читает UnitModel; КАРТА использует реальный renderer. | Архитектурно положительно. |

## Матрица пересечений файлов

| Файл / зона | КАРТА | ПУЛЬС | РЕДАКТОРЫ | ЛИНЗА | КОНТЕКСТ | ПЕШКА | Риск |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| `src/combat-lab/main.ts` | X | X | X |  |  |  | **Высокий.** Три независимых startup/lifecycle diff от одной базы; нужно ручное сведение imports/install/destroy. |
| `docs/.../INTEGRATION_STATUS.md` |  |  | X |  | X | X | Средний, docs-only conflict. Не должен определять product решение. |
| `src/rendering/PixiUnitRenderer.ts` |  |  |  |  |  | X | Один owner сохранён. |
| `src/combat-lab/ui/*LiveUnit*`, `CombatLabRightPanelSeam.ts` |  | X |  | логическая зависимость | route dependency |  | Файлового конфликта нет, но это главный right-panel seam. |
| `src/combat-lab/right-panel/*` |  | consumer seam |  | X | route dependency |  | ЛИНЗА изолирована правильно, но сейчас dead/unmounted product code. |
| editor bridge/CSS/registry API |  | editor links | X |  | route dependency |  | API ownership совместим, wiring КОНТЕКСТА отсутствует. |
| `TacticalOrderRadialInput.ts` / context UI |  | selection owner dependency |  | panel route dependency | X |  | Один tactical input owner сохранён; требуется regression QA. |
| map CSS/layout | X | shell consumer | shell consumer | shell consumer | overlay/menu consumer | canvas consumer | Файлы разные, но финальная CSS-композиция должна проверяться вместе. |

## Матрица владельцев данных

| Владелец | Кто пишет / владеет | Кто только читает или вызывает | Результат review |
|---|---|---|---|
| Map state / `PixiMapRenderer` | существующий `GameApplication → PixiTacticalBoardApp → PixiMapRenderer` | КАРТА только меняет presentation/layout | Второго map/runtime не найдено. |
| Unit renderer | `PixiUnitRenderer` | ПЕШКА развивает его же | Второго renderer не найдено. |
| Selection | существующий `SimulationState` + workspace selection controller | ПУЛЬС exposes seam; ПЕШКА читает selected ids; ЛИНЗА ожидает injected unitId; КОНТЕКСТ вызывает `selectUnit` | Второго selection store не найдено. |
| Posture command | product session/physical action path | ПУЛЬС вызывает `executeInteractive`, потом читает UnitModel | Direct mutation не найден. |
| Attention | `UnitModel` + canonical AttentionController/Profile functions | ЛИНЗА вызывает штатные write functions и делает readback | Второго Attention runtime не найдено. |
| Subjective memory | `UnitModel.perceptionKnowledge` | ЛИНЗА читает | Fake history/front не создан. |
| Editor inventory | `createDefaultGameEditorRegistry` / existing `CombatLabGameEditors` | РЕДАКТОРЫ меняют shell presentation; ПУЛЬС/КОНТЕКСТ должны использовать open API | Второго registry не найдено. |
| Tactical orders | существующие `RoutedMoveOrders` / `TacticalOrderRadialInput` | КОНТЕКСТ делает arbitration вокруг того же owner | Второго command runtime не найдено. |

## Матрица зависимостей между направлениями

Обозначения: `HARD` — без этого направление не закончено; `QA` — код может существовать отдельно, но проверять надо вместе.

| От кого → кому | КАРТА | ПЕШКА | ПУЛЬС | ЛИНЗА | РЕДАКТОРЫ | КОНТЕКСТ |
|---|---:|---:|---:|---:|---:|---:|
| КАРТА | — | QA: реальные знаки на настоящей карте | QA: selection на итоговой поверхности | QA: Info hover на итоговой карте | QA: Map Editor рядом с итоговой картой | QA: entity RMB на итоговой карте |
| ПЕШКА |  | — | QA: map symbol selection identity | QA: один и тот же unitId |  | QA: entity hit/selection не должен расходиться с знаком |
| ПУЛЬС |  |  | — | **HARD: hosts/state/selection seam** | linked editor API consumer | **HARD для Unit/panel routes** |
| ЛИНЗА |  |  |  | — |  | **HARD для Info/Attention/Memory routes** |
| РЕДАКТОРЫ |  |  |  |  | — | **HARD для `Редактировать` route** |
| КОНТЕКСТ |  |  |  |  |  | — |

Главная зависимость волны:

```text
КАРТА + ПЕШКА + ПУЛЬС
→ затем подключение ЛИНЗЫ к seam ПУЛЬСА
→ затем РЕДАКТОРЫ
→ затем КОНТЕКСТ с реальными routes
```

## Проверка совместимости и конфликтов при объединении

### Совместимо по архитектуре

- КАРТА не трогает `PixiUnitRenderer`, selection или simulation.
- ПЕШКА не создаёт отдельные сущности и остаётся внутри canonical renderer.
- ПУЛЬС не создаёт второй selection store и пишет позу через product command/session boundary.
- ЛИНЗА не создаёт selection/history/front runtime и не сканирует все units на hover; тяжёлые owners готовятся заранее, object query локальный.
- РЕДАКТОРЫ не создают второй `GameEditorRegistry`.
- КОНТЕКСТ не создаёт отдельный tactical-order runtime и использует существующий map input ownership.

### Не совместимо «простым сложением» без интеграционного кода

1. **ЛИНЗА + ПУЛЬС:** требуется маленький product hook, который создаёт `PolygonRightPanelLiveView`, передаёт PULSE hosts/state/current unitId/prepared Info owners и вызывает render/invalidate по существующему lifecycle. Сейчас этого кода нет ни в ПУЛЬСЕ, ни в ЛИНЗЕ.
2. **КОНТЕКСТ + ПУЛЬС/ЛИНЗА/РЕДАКТОРЫ:** требуется передать настоящие `openPanel/openEditor` callbacks в `installTacticalOrderRadialInput`. Сейчас default `{}` делает связанные menu actions disabled.
3. **КАРТА + ПУЛЬС + РЕДАКТОРЫ:** нужно вручную сохранить все три изменения `src/combat-lab/main.ts`; порядок коммитов сам по себе не является доказательством корректного startup/teardown.
4. **CSS:** КАРТА, ПУЛЬС, ЛИНЗА и РЕДАКТОРЫ добавляют отдельные стили поверх accepted shell. Даже без textual conflict возможны cascade/layout regressions; нужен один browser pass уже после сведения.
5. **КОНТЕКСТ:** нужен bounded/local map-object target lookup либо performance evidence, что текущий полный объектный scan допустим для целевого масштаба.

## Что может выглядеть готовым, но продуктово ещё не закончено

Прямой fake/demo facade в проверенных diff не найден. Однако есть участки, которые по коду/CSS выглядят завершёнными, а пользовательский product flow ещё отсутствует:

- **ЛИНЗА:** полноценные карточки `Инфо / Внимание / Память` написаны и используют реальные data owners, но view не mounted — конечный пользователь их не получает.
- **КОНТЕКСТ:** меню рисуется и содержит действия `Юнит / Инфо / Внимание / Память / Редактировать`, но без injected owners они намеренно disabled.
- **ЛИНЗА / Инфо:** `nearbyUnits` и `danger` отображаются как unsupported, потому что принятый bounded unit spatial query / danger owner для этого UI не найден.
- **ЛИНЗА / Память:** Estimated Front намеренно unavailable; никакой synthetic front не подставлен.
- **ПЕШКА:** commander star, role label и squad hull не выдуманы. Если эти элементы обязательны для принятого визуального контракта, сначала нужен надёжный product owner/identity.
- **РЕДАКТОРЫ:** новый shell presentation существует, но без browser-прогона всех editor routes нельзя считать визуально красивое открытие каталога доказательством сохранения всего функционального объёма редакторов.

## Рекомендуемый порядок интеграции

Сначала не переносить PR напрямую в preview, а собрать **отдельный integration candidate** от `8292bf25…` и свести там product code с сохранением exact provenance каждого результата.

Порядок:

1. **КАРТА** — `74d476992c002cebca5c8c9e5de3336c338355ec`.
2. **ПЕШКА** — текущий product diff из `71ebbec…` / implementation `bdae5ea…`; сразу прогнать renderer smoke на новой карте.
3. **ПУЛЬС** — `6ac3d2e…`; вручную свести `main.ts` с КАРТОЙ.
4. **Обязательное исправление:** подключить ЛИНЗУ через нейтральный seam ПУЛЬСА без нового selection/runtime.
5. **ЛИНЗА** — `4e453b85…` после этого hook.
6. **РЕДАКТОРЫ** — `66895a4b…`; вручную свести третий `main.ts` diff и проверить lifecycle/teardown.
7. **Обязательное исправление:** подключить реальные context `openPanel/openEditor` routes и закрыть bounded target lookup.
8. **КОНТЕКСТ** — `2297b3ca…` только после проверки short RMB / right-drag / hold radial на уже собранной сцене.

То есть порядок шести направлений остаётся каноническим:

```text
КАРТА → ПЕШКА → ПУЛЬС → ЛИНЗА → РЕДАКТОРЫ → КОНТЕКСТ
```

но между ПУЛЬСОМ/ЛИНЗОЙ и перед КОНТЕКСТОМ обязательны небольшие integration fixes.

## Обязательные проверки integration candidate до transfer

### 1. Идентичность и diff

- зафиксировать exact integration head;
- убедиться, что base — `8292bf25bf241712901090fcb565dded939e7a08`;
- `git diff --check` только по корректному scope, отдельно классифицируя inherited base failures;
- проверить, что не появился второй selection/map/runtime/renderer/history owner.

### 2. Компиляция и сборка

```text
npm run typecheck
npm run build
```

### 3. Карта / renderer

```text
npm run map-revision:smoke
npm run map-grid-lod:smoke
node scripts/unit_map_token_smoke.mjs
```

Проверить unchanged view reuse, LOD hysteresis, selection independence, deletion/teardown и отсутствие geometry rebuild каждый frame.

### 4. ПУЛЬС

```text
node scripts/combat_lab_live_unit_ui_contract_smoke.mjs
node scripts/combat_lab_live_unit_presentation_smoke.mjs
```

Дополнительно обязательно доказать A → B → clear/reset без stale id/object и posture command → simulation → readback.

### 5. ЛИНЗА

Запустить штатным TS runner focused smoke `scripts/linza_right_panel_product_smoke.ts` на полном checkout и проверить:

- Info использует prepared owners и local query;
- Attention write/readback идёт через canonical functions;
- Memory только subjective `perceptionKnowledge`;
- нет второго selection/history/front runtime;
- integration hook реально монтирует views в PULSE hosts.

### 6. РЕДАКТОРЫ

```text
npm run combat-lab-game-editors:smoke
npm run combat-lab-ui-contract:smoke
```

В browser открыть каталог и все доступные editor routes, включая Map/Unit-linked переходы.

### 7. КОНТЕКСТ / tactical input

```text
npm run routed-move:smoke
npm run tactical-order:smoke
```

И реально выполнить `tests/entity-context-menu.spec.ts` в Chromium/Playwright на exact integration head.

Обязательные сценарии:

- entity + short RMB → context menu, без move;
- entity + right-drag → существующий quick move/facing;
- entity + hold → существующий radial order;
- empty ground + selection → существующий tactical flow;
- no selection + entity → context menu;
- menu → Unit / Info / Attention / Memory / Editor через настоящие routes;
- Escape/outside click/lost capture teardown.

### 8. Browser/screenshot visual QA exact integration head

Минимум:

- 1600×900, обе панели открыты;
- 1080×800, обе панели открыты;
- left/right collapse;
- grid off/on, zoom/pan;
- несколько настоящих units: selected/unselected, standing/crouched/prone, разные доступные weapon roles, near/medium/far LOD;
- LIVE Unit: A/B/clear, posture change/readback;
- Info/Attention/Memory real data;
- editor catalogue и editor return;
- context menu + tactical gestures.

Скриншоты должны относиться к **exact combined product SHA**, быть скачаны и открыты глазами. Зелёный workflow без просмотра PNG недостаточен.

### 9. Pixel-perfect gate

Если exact утверждённый HTML-прототип доступен интегратору, провести прямое сравнение:

- отступы;
- размеры;
- цвета;
- шрифты;
- иконки;
- радиусы;
- границы;
- active/hover/disabled states;
- композицию на тех же viewport.

Пока exact HTML недоступен, итог должен оставаться `pixel_perfect: unconfirmed`, даже если функциональный browser QA зелёный.

### 10. Производительность

- убедиться, что Info hover не делает full-map/full-unit scan;
- проверить recurring `PULSE inspector.refresh()` и при необходимости перевести на revision/event-driven refresh либо доказать допустимую стоимость;
- закрыть/обосновать `O(map.objects)` context target scan;
- проверить, что Pixi persistent views переиспользуются и удаляются;
- heavy scenario запускать только при конкретном `PERFORMANCE_REASON` по repository skill.

## Визуальная проверка аудитора

Для КАРТЫ независимо проверен artifact exact-SHA run `31992089286`:

- artifact: `xroute-map-final-74d4769`, id `9275675057`;
- `evidence.json.sha`: `74d476992c002cebca5c8c9e5de3336c338355ec`;
- `evidence.json.errors`: `[]`;
- открыты глазами: reference 1600×900, target grid-off, grid-on, left-collapsed и 1080×800 open;
- настоящий canvas видим и не размыт; overlay совпадает с canvas bounds; collapse увеличивает площадь карты;
- при 1080×800 и двух открытых панелях canvas около `252×252`, при collapse правой панели около `540×540`.

Это подтверждает **рабочую map-surface integration**, но не pixel-perfect равенство exact HTML.

Для ПУЛЬСА, РЕДАКТОРОВ, ЛИНЗЫ, КОНТЕКСТА и ПЕШКИ свежих exact-current PNG, удовлетворяющих screenshot skill, в проверенных workflow evidence нет. Их визуальный результат **неподтверждён**.

## Что проверено фактически аудитором

- текущий `real-wargame-preview` HEAD повторно получен: `8292bf25bf241712901090fcb565dded939e7a08`;
- найдены все 6 ожидаемых веток и PR;
- сверены actual PR head SHA, а не только SHA из описаний;
- для каждого выполнен exact `8292bf25… → current head` compare, включая полный список изменённых файлов;
- проверены key product files ПУЛЬСА, РЕДАКТОРОВ, ЛИНЗЫ, КОНТЕКСТА, ПЕШКИ и КАРТЫ;
- проверены workflow runs/current-head policy status и, где существовали, логи risk-selected CI;
- отдельно установлено, что поздние commits ПЕШКИ и ЛИНЗЫ являются docs-only tails;
- у РЕДАКТОРОВ подтверждено, что overall PR Risk failure дошёл до inherited historical `git diff --check`, при этом `tsc` и вложенный build прошли;
- у ПЕШКИ подтверждён аналогичный inherited historical whitespace failure после успешного TypeScript и вложенного build;
- скачан и визуально просмотрен exact-SHA artifact КАРТЫ;
- проверены ownership границы и отсутствие очевидного второго selection/map/renderer/history runtime в изменённых файлах.

## Что осталось неподтверждённым

- pairwise/combined Git merge шести product веток не выполнялся: это запрещено задачей review-only и результат должен быть docs-only;
- новый полный combined `typecheck/build/smoke` не запускался;
- direct local checkout аудитора невозможен в текущем внешнем окружении: DNS к `github.com` недоступен, поэтому независимые executable checks выполнялись только там, где уже существовал проверяемый GitHub Actions evidence;
- pixel-perfect к exact пользовательскому HTML не подтверждён;
- visual QA ПУЛЬСА / РЕДАКТОРОВ / ЛИНЗЫ / КОНТЕКСТА / ПЕШКИ не подтверждён;
- фактическая работоспособность context panel/editor routes не подтверждается, потому что в текущем коде эти routes ещё не подключены;
- фактическая доступность ЛИНЗЫ в UI не подтверждается и по diff видно, что install hook отсутствует;
- heavy performance combined candidate не запускался и без конкретного performance reason не требуется.

## Заключение

Шесть исполнителей **доставили шесть реальных веток**, и основная архитектурная идея волны выглядит совместимой: существующие product owners в большинстве случаев переиспользованы, fake runtime не обнаружен.

Но это пока **набор совместимых частей, а не собранный Полигон**. Два обязательных seam-а отсутствуют, пять направлений не имеют требуемой финальной exact-head/visual приёмки, а три ветки сходятся в одном startup-файле. Поэтому прямое объединение в `real-wargame-preview` до отдельного integration candidate, исправления seam-ов и общего browser QA не разрешается этим review.

**Финальный вердикт: `NOT_READY_TO_COMBINE`.**
