# Handoff оркестратору — поэлементный перенос Полигона 2026-08-17

## Текущая задача: поэлементный перенос (новый принятый подход)

Текущий способ работы подпроекта зафиксирован пользователем: Полигон переносится по одному элементу/вертикальному срезу (вкладка, карта или другой конкретный элемент).

Для каждого элемента:

1. параллельно запускаются два исполнителя:
   - **визуальный** — переносит вёрстку, графику, отступы, цвета, размеры, шрифты и иконки из утверждённого HTML-прототипа пиксель в пиксель; функциональные связи пока не подключает;
   - **аналитик** — сравнивает прототип и продукт, определяет, что уже есть, что частично есть, чего нет, настоящих владельцев данных, точки подключения и назначение каждой кнопки;
2. затем запускаются отдельные исполнители: подключающий уже готовые функции, доделывающий отсутствующие/неполные возможности и реализующий новые запланированные функции прототипа; при необходимости их может быть несколько.

Весь функциональный объём HTML-прототипа, включая запланированные возможности, остаётся целью подпроекта.

Канонический процесс и критерии перехода элемента:

`docs/subprojects/polygon-html-to-product/ELEMENT_MIGRATION_WORKFLOW.md`

Важно для оркестратора:

- результаты прежней six-X волны сохраняются как историческое исследование и технический контекст, но **не являются автоматическим основанием для объединения кода**;
- текущий checkpoint — техническая база, но **визуально не принят**;
- запрещены автоматический перенос в `real-wargame-preview`, изменения `main`, merge и deploy без отдельного явного разрешения пользователя.

Канонический документ статуса checkpoint:

`docs/subprojects/polygon-html-to-product/CHECKPOINT_20260817_APPROACH_RESET.md`

Ниже сохранён **исторический handoff исходной six-X волны**, чтобы не потерять причины и границы уже выполненной работы.

---

## Что изменилось на старте six-X волны

После объединения АРКИ, ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА пользователь изменил ближайший приоритет: сначала сделать новый Полигон цельной игровой поверхностью, а не уходить глубже в Metrics/Series/replay.

Была подготовлена параллельная волна из шести исполнителей:

1. **КАРТА** — живая product map вместо ARKA placeholder, visual presentation ближе к принятому прототипу.
2. **ПУЛЬС** — selection → UnitModel → `Юнит` LIVE → posture command → readback.
3. **РЕДАКТОРЫ** — существующие product editors в новом shell/design; не переписывать editor logic.
4. **ЛИНЗА** — `Инфо / Внимание / Память` LIVE по принятому contract.
5. **КОНТЕКСТ** — entity context menu с сохранением существующих right-button tactical orders.
6. **ПЕШКА** — принятая система тактических знаков в `PixiUnitRenderer` + near/medium/far LOD.

Полный historical coordination contract:

`docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`

Prompt-файлы:

```text
docs/subprojects/polygon-html-to-product/prompts/01_MAP_SURFACE.md
docs/subprojects/polygon-html-to-product/prompts/02_PULSE_LIVE_UNIT.md
docs/subprojects/polygon-html-to-product/prompts/03_EDITORS_NEW_DESIGN.md
docs/subprojects/polygon-html-to-product/prompts/04_LINZA_RIGHT_PANEL_LIVE.md
docs/subprojects/polygon-html-to-product/prompts/05_ENTITY_CONTEXT_MENU.md
docs/subprojects/polygon-html-to-product/prompts/06_UNIT_MAP_TOKEN.md
```

## Историческая база запуска

Planning anchor:

```text
real-wargame-preview @ 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
```

Позже общая planning/documentation база дошла до `8292bf25bf241712901090fcb565dded939e7a08`, от которой стартовали шесть X-исполнителей.

## Что было важно при раздаче

- Не смешивать зоны между исполнителями.
- КАРТА не меняет unit renderer/selection.
- ПЕШКА не меняет map terrain/selection.
- ПУЛЬС владеет selection и минимальным generic right-panel seam.
- ЛИНЗА не создаёт второй selection; её views/adapters принимают hosts/state извне.
- РЕДАКТОРЫ сохраняют стабильный editor-open API.
- КОНТЕКСТ сохраняет quick move/right-drag/hold radial tactical orders; его задача — arbitration, а не замена tactical order system.

Эти ownership-инварианты остаются полезными техническими знаниями и после смены визуального подхода.

## Что не запускалось в первой очереди

ХРОНИСТ/Metrics/Series/replay/Save/Open не отменялись, но не ставились выше six-X волны. Они по-прежнему отдельные незавершённые направления.

## Исторический integration order

```text
КАРТА
→ ПЕШКА
→ ПУЛЬС
→ ЛИНЗА
→ РЕДАКТОРЫ
→ КОНТЕКСТ
```

Фактическая six-X сборка уже выполнена в integration lineage; следующий исполнитель не должен повторять этот merge-процесс с нуля.

## Старые ветки, которые можно исследовать, но нельзя вливать вслепую

```text
feature/20260816-polygon-live-unit-complete
feature/20260808-soldier-topdown-appearance*
feature/20260812-polygon-global-editors
feature/20260805-map-diorama-prototype
```

Причины:

- live-unit ветка построена до новой общей базы;
- soldier branches сильно разошлись с текущим preview;
- global-editors уже присутствуют в истории продукта;
- map-diorama — старый standalone визуальный ориентир, не product base.

## Приёмка следующей итерации

Новый подход пользователя должен получить собственный scope и собственные acceptance criteria. Нельзя автоматически переиспользовать формулировку «pixel-perfect как HTML» как текущую задачу без нового подтверждения.

Для визуальных задач по-прежнему использовать repository screenshot skill и свежие PNG exact SHA. Runtime/render задачи проверять по performance/risk-based правилам.

`main` не transfer/merge без отдельного пользовательского GO.
