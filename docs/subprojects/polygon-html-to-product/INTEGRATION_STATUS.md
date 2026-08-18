# Перенос Полигона — текущий статус

Дата актуализации: 2026-08-18

## Текущая точка входа

Дальнейшую доработку подпроекта после текущей Web Chat-волны продолжает **Кодекс**.

Главный handoff:

`docs/subprojects/polygon-html-to-product/CODEX_HANDOFF_20260818.md`

Канонический рабочий подход остаётся поэлементным: принятый HTML-прототип задаёт presentation/композицию, а продуктовые owners задают реальные данные, команды, persistence и readback.

Процесс:

`docs/subprojects/polygon-html-to-product/ELEMENT_MIGRATION_WORKFLOW.md`

## Профили маршрута — локальная visual-полировка 2026-08-18

Точный локальный product commit:

```text
c30a2bfb3ec24322b384ee192c2c16b84fe45f64
```

Он **не отправлен, не перенесён в `real-wargame-preview` и не задеплоен**.

Для состояния `Осторожный / Основное` перенесены из принятого HTML-прототипа:

- структура списка `Встроенные / Мои профили`, пустое состояние и размеры строк;
- шапка профиля, чип, вкладки, резюме и четыре семантические карточки;
- горизонтальное ограничение обхода с процентным readback и кнопкой сброса;
- компактные четыре колонки метаданных;
- закреплённая нижняя полоса.

Визуальная проверка сделана локально во встроенном браузере при `1442×740` по приложенному утверждённому скриншоту. Ползунок и процентный ввод меняют один и тот же настоящий `maximumDetourRatio`; проверен readback `50% → 55% → 50%`.

Принятое исключение: пункт **«Типы поверхностей»** остаётся таким, как в продукте — недоступным с меткой `НЕДОСТУПНО`.

Счётчики `Бойцы / Программа / Лаборатория` в нижней полосе пока являются только presentation-оболочкой с нулевыми значениями. У них ещё нет одного authoritative owner/read-model, поэтому нельзя считать их функционально подключёнными.

## Профили маршрута — внутренние вкладки 2026-08-18

Локальный product commit:

```text
e26116d6f7cf19f02e895319a38f8fb372e5222c
```

Он **не отправлен, не перенесён в `real-wargame-preview` и не задеплоен**.

Из утверждённого HTML перенесены на реальные product-owner поля три внутренних вкладки профиля маршрута:

- `Местность`: вводная карточка и сетка из девяти реальных параметров; названия, пояснения, единицы, состояния предпочтения/избегания, ползунки, вводы и сброс соответствуют прототипу;
- `Тактика`: четыре настоящих веса, две честные метки `Ещё не подключено` и сворачиваемые `Территориальные предпочтения` с меткой будущей механики;
- `Маршрут`: прототипный порядок `Ограничения → Когда искать новый маршрут → Чувствительность перестроения`, компактные чекбоксы и настоящий `maximumRouteCost`.

Для ограничения цены переключатель и числовой ввод меняют тот же owner path: readback во встроенном браузере подтверждён как `без предела → 1 → без предела`. Блок территориальных предпочтений проверен скрытым вне вкладки `Тактика`.

Визуальная проверка проведена в настоящем локальном приложении во встроенном браузере при `1442×740`; экраны `Местность`, `Тактика` и `Маршрут` сняты и просмотрены. Новый layout не вводит второй state, registry или runtime-owner.

## Точный текущий product snapshot

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: bd25f5debc312db7021b1515a525697ad248fff1
feature_branch: feat/20260817-polygon-editors-visual-parity
verified_product_sha: f695c9b1c035340de319e769b2ada4c993d2b83b
```

После `f695c9b1...` на feature-ветку могут добавляться documentation-only commits. Следующий исполнитель обязан получать свежий remote HEAD, а `f695c9b1...` использовать как идентичность уже проверенного и опубликованного product snapshot.

## Vercel Preview

```text
project: repo
deployment_id: dpl_5LcLrP6Me3RVCQ7ibQavpJRstXYF
preview: https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/
polygon: https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/combat-lab.html
status: READY
```

Публикация выполнена через exact-source fallback из repo deployment skill. В опубликованном `/deployment-source.json` подтверждены:

```text
ref: feat/20260817-polygon-editors-visual-parity
sourceSha: f695c9b1c035340de319e769b2ada4c993d2b83b
verificationStatus: passed
skippedChecks: []
```

## Проверки текущего результата

Для `f695c9b1...`:

- Preview verification gate — **31/31 passed**;
- TypeScript — passed;
- production build — passed;
- deployment pages contract — passed;
- `/`, `/ai-node-editor.html`, `/combat-lab.html`, `/deployment-source.json` — опубликованы и проверены;
- exact system-Chrome audit `32088591178` — **SUCCESS**;
- viewport visual QA — `1440x900`;
- 11 состояний редакторов сняты;
- 0 console errors;
- 0 page errors;
- 0 failed requests.

Validation/audit PR #311 и #312 закрыты без merge.

## Текущий статус раздела «Редакторы»

Принятая навигация содержит ровно 11 пунктов:

1. Профили маршрута
2. Тактические позиции
3. Архетипы бойцов
4. Профили внимания
5. Профили восприятия
6. Профили движения
7. Вооружение
8. Ранения и подавление
9. Типы поверхностей
10. Профили местности
11. Направленный рельеф

Группы:

```text
Поведение:
- Профили маршрута
- Тактические позиции

Боец:
- Архетипы бойцов
- Профили внимания
- Профили восприятия
- Профили движения

Бой:
- Вооружение
- Ранения и подавление

Мир:
- Типы поверхностей
- Профили местности
- Направленный рельеф
```

`Данные бойца` и `Граф поведения` не входят в визуальную навигацию Полигона. Их код не удаляется.

## Что закрыто текущей visual-parity волной

Общее:

- modal/shell и nav геометрически сближены с принятым HTML;
- устранён legacy inset рабочей области;
- унифицированы tabs/cards/forms/footer presentation;
- secondary mode label убран из первого визуального плана;
- устранён конфликт `[hidden]` с owner `display:grid !important`.

По редакторам:

- `Тактические позиции` — semantic summary строится из реальных owner fields;
- `Профили движения` — live summary использует настоящий owner state;
- `Вооружение` — live summary и presentation-tabs поверх существующих authoritative sections;
- `Архетипы бойцов` — исправлены compact tabs/summary/owner-grid;
- `Ранения и подавление` — исправлены compact tabs/summary/owner-grid;
- `Профили восприятия` — flow больше не забирает flexible owner row;
- `Направленный рельеф` — статические псевдодиаграммы не выдаются за live визуализацию.

Product/gameplay owners, persistence и write paths ради визуальной подгонки не заменялись.

## Незавершённые области

### 1. Типы поверхностей — BLOCKED

Отдельный authoritative product owner отсутствует. До его появления пункт должен оставаться честно `НЕДОСТУПНО`.

Нельзя переносить prototype static registry/localStorage как product capability.

### 2. Профили местности — PARTIAL

Прототип ожидает aggregate environment profile, а текущий product UI во многих состояниях представляет вложенный material/environment контекст.

Если агрегированного read-model нет, нужна product owner/read-model задача; CSS сам по себе этот semantic gap не решает.

### 3. Направленный рельеф — PARTIAL

Для принятого вида нужны live silhouette и 8-sector diagram, построенные из authoritative values. Статическая имитация запрещена.

### 4. Остальные редакторы

Основная presentation-структура улучшена, но Кодекс может продолжить поэлементную визуальную полировку и перераскладку live owner controls. Любые reset/slider/readback улучшения должны сохранять один authoritative state/command path.

## Ключевые архитектурные границы

Следующая итерация не должна создавать вторую продуктовую истину ради соответствия HTML.

Не делать без отдельного решения:

- fake Surface Types registry;
- fake Journal/telemetry/Series;
- prototype localStorage architecture в product;
- hardcoded gameplay values ради совпадения со screenshot;
- второй selection store;
- второй map/runtime/editor owner;
- прямую запись в UnitModel из UI вместо штатной команды;
- статическую directional-terrain графику, выдаваемую за live data.

## Что ещё остаётся за пределами текущей editor-волны

Не отменены и не объявлены завершёнными:

- Program ↔ Journal LIVE foundation;
- canonical HistoryProvider;
- Metrics/telemetry;
- Laboratory runtime;
- Series/run records;
- replay;
- Save/Open experiment envelope;
- полный Unit Editor authoring/LIVE decision.

## Следующий порядок работы

Кодексу рекомендуется:

1. получить свежие remote HEAD `real-wargame-preview` и feature-ветки;
2. прочитать `CODEX_HANDOFF_20260818.md`;
3. провести собственный screenshot review опубликованного Preview против принятого HTML;
4. каждое расхождение классифицировать как CSS/DOM, presentation-adapter, owner/read-model dependency или missing capability;
5. не маскировать `Surface Types` visual-only реализацией;
6. Environment и Directional Terrain сначала проверять по owner/read-model контракту;
7. после каждой содержательной волны запускать TypeScript + `verify:preview` + build + fresh screenshot QA exact SHA;
8. deploy делать только по отдельному явному запросу пользователя;
9. transfer/merge в `real-wargame-preview` делать только после отдельного пользовательского GO;
10. `main` не трогать.

## Исторический контекст

Предыдущие этапы не удалены и остаются источником истории/ownership решений:

```text
docs/subprojects/polygon-html-to-product/CHECKPOINT_20260817_APPROACH_RESET.md
docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md
docs/subprojects/polygon-html-to-product/ARKA_IMPLEMENTATION_HANDOFF.md
docs/subprojects/polygon-html-to-product/PULSE_LIVE_UNIT_CONTRACT.md
docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md
docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md
```

Старые более оптимистичные или более пессимистичные формулировки visual readiness следует читать как историю соответствующего этапа. Для текущего состояния редакторов приоритет имеют этот файл и `CODEX_HANDOFF_20260818.md`.
