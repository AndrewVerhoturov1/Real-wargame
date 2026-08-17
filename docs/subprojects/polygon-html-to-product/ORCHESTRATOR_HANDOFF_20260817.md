# Handoff оркестратору — приоритетная волна Полигона 2026-08-17

## Что изменилось

После объединения АРКИ, ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА пользователь изменил ближайший приоритет: сначала сделать новый Полигон цельной игровой поверхностью, а не уходить глубже в Metrics/Series/replay.

Подготовлена новая параллельная волна из шести исполнителей:

1. **КАРТА** — живая product map вместо ARKA placeholder, visual presentation ближе к принятому прототипу.
2. **ПУЛЬС** — selection → UnitModel → `Юнит` LIVE → posture command → readback.
3. **РЕДАКТОРЫ** — существующие product editors в новом shell/design; не переписывать editor logic.
4. **ЛИНЗА** — `Инфо / Внимание / Память` LIVE по принятому contract.
5. **КОНТЕКСТ** — entity context menu с сохранением существующих right-button tactical orders.
6. **ПЕШКА** — принятая система тактических знаков в `PixiUnitRenderer` + near/medium/far LOD.

Полный coordination contract:

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

## База запуска

Planning anchor:

```text
real-wargame-preview @ 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
```

Перед запуском **каждой** feature-ветки повторно получить current exact preview HEAD по orchestration skill. Если запускаешь все шесть одновременно и HEAD ещё `26e5f7f...`, используй его как общий base для всех шести.

## Что важно при раздаче

- Не смешивать зоны между исполнителями.
- КАРТА не меняет unit renderer/selection.
- ПЕШКА не меняет map terrain/selection.
- ПУЛЬС владеет selection и минимальным generic right-panel seam.
- ЛИНЗА не создаёт второй selection; её views/adapters должны принимать hosts/state извне. Final shell hook можно сделать после ПУЛЬСА отдельным integration commit.
- РЕДАКТОРЫ сохраняют стабильный editor-open API.
- КОНТЕКСТ обязан сохранить quick move/right-drag/hold radial tactical orders; его задача — arbitration, а не замена tactical order system.

## Что не запускать в первой очереди

Не отменять ХРОНИСТ/Metrics/Series/replay/Save/Open, но пока не ставить их выше этой волны. Вернуться к ним после получения цельной map→unit→right-panel→editors сцены.

## Рекомендуемый integration order

```text
КАРТА
→ ПЕШКА
→ ПУЛЬС
→ ЛИНЗА
→ РЕДАКТОРЫ
→ КОНТЕКСТ
```

Разработка идёт параллельно; этот порядок только для transfer/review и уменьшения конфликтов.

## Старые ветки, которые можно исследовать, но нельзя вливать вслепую

```text
feature/20260816-polygon-live-unit-complete
feature/20260808-soldier-topdown-appearance*
feature/20260812-polygon-global-editors
feature/20260805-map-diorama-prototype
```

Причины:

- live-unit ветка может содержать полезную реализацию, но построена до новой общей базы;
- soldier branches сильно разошлись с текущим preview;
- global-editors уже в истории продукта и повторный merge не нужен;
- map-diorama — старый standalone визуальный ориентир, не product base.

## Приёмка

Каждого исполнителя принимать по exact `base...current` diff и `docs/orchestration/RESULT_TEMPLATE.md`.

Визуальные задачи КАРТА / РЕДАКТОРЫ / КОНТЕКСТ / ПЕШКА и финальный ПУЛЬС/ЛИНЗА UI должны использовать screenshot skill и свежие PNG exact SHA. Runtime/render задачи должны выполнять performance design review и risk-selected checks.

Не transfer/deploy без отдельного пользовательского GO.
