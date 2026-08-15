# Polygon Exact Shell Design

## Goal

Replace the reconstructed dark Combat Lab shell with a visually faithful shell derived from the accepted HTML prototype `polygon-series-v1.1-memory-v3-interface-linkage(1).html` (SHA-256 `4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd`).

This task is intentionally UI-shell only. It must show the new Polygon visual language, top menu/control strip, left workspace panel tabs, right inspector tabs and the real product map underneath. It must not expose old Combat Lab panels or add new gameplay/runtime behavior.

## Exact visual source

Reference viewport: `1600×900`.

Reference geometry and tokens taken directly from the accepted HTML:

- top bar height: `58px`;
- left panel width: `372px`;
- right panel width: `336px`;
- panel gap: `14px`;
- page/map background: `#d9d7cd` / `#d2d0c5` family;
- primary dark olive: `#344321` with darker gradient endpoint `#273318`;
- accent yellow: `#d8b941`;
- light panel: `rgba(246,245,238,.96)` / `#f6f5ee`;
- panel radius: `7px`;
- panel shadow: `0 16px 44px rgba(22,26,17,.18), 0 2px 8px rgba(22,26,17,.16)`.

## Visible composition

### Top bar

Use the accepted prototype layout language:

- brand mark `П` + `ПОЛИГОН` on the left;
- existing real run controls live in the top bar and are restyled to the prototype language rather than shown in the old Combat Lab panel;
- centered shell buttons `ФАЙЛ` and `РЕДАКТОРЫ`;
- right shell buttons `ВИД ▾`, `EN` and the existing application menu trigger styled as `МЕНЮ`.

Buttons which do not yet have an accepted product action may be present as shell controls but must not fabricate state or domain behavior.

### Left panel

Floating light panel over the real map, matching prototype geometry. Visible content is limited to:

- header `РАБОЧИЙ РЕЖИМ` + current workspace title;
- collapse button;
- workspace tab buttons in prototype order:
  - `Программа`
  - `Лаборатория`
  - `Редактор карты`
  - `Редактор юнита`
  - `Серия`
  - `Метрики`
  - `Журнал`
- blank panel body.

Existing product workspace hosts remain mounted invisibly so current Combat Lab initialization does not break, but no legacy product panels are visible in this shell iteration.

### Right panel

Floating light panel over the real map, matching prototype geometry. Visible content is limited to:

- header `ВЫБРАННЫЙ ОБЪЕКТ` and an honest neutral title until PULSE/LINZA supply live content;
- collapse button;
- accepted inspector tabs only:
  - `Юнит`
  - `Инфо`
  - `Внимание`
  - `Память`
- blank panel body.

Do not add `Опасность / Скрытность / Позиции / Оружие` in this ARKA task because they are outside the accepted current right-panel scope.

### Map

The existing product map remains the only map. The shell does not create a replacement map, overlay label, fake units or demo scene.

## Explicit removals from the previous ARKA shell

The following must no longer be visible:

- the dark full-width primary tab strip;
- `Рабочая панель` / `Контекст` explanatory headings from the reconstructed shell;
- `Параметры` and `Общие редакторы` as visible bottom auxiliary tabs;
- dark card framing around the center map;
- empty-state explanation cards inside right tabs;
- the fake-looking bottom timeline container;
- old Combat Lab diagnostic/manual panels.

## State boundaries

Allowed UI-owned state:

- active left workspace tab;
- active right inspector tab;
- left/right collapsed state.

No new selected-unit store, gameplay state, history state, fake metrics, fake journal or global runtime API.

## Visual QA

Acceptance requires fresh screenshots from the real product deployment at `1600×900` and at least one narrower desktop viewport. Compare geometry, color hierarchy, panel placement, tab treatment and top bar against the exact prototype screenshot. Fix visible mismatches before final handoff.
