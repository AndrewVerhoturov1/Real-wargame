# Orchestrator report — Polygon Global Editors v1

## Result

- **Task:** завершить общие редакторы Полигона, разблокировать gameplay tuning, принять exact standalone UX и перенести в Preview.
- **Status:** `COMPLETED` для standalone UX/reference-контракта.
- **Base preview commit:** `97dc64e2930ebf79f8c9bbd3a9664fef35063a20`.
- **Feature branch:** `feature/20260812-polygon-global-editors`.
- **Accepted artifact commit:** `2ff387e668864243aad3c4af380b5869e530b482`.
- **Artifact:** `polygon-journal-v4.html`, `1 987 792` bytes.
- **SHA-256:** `78c89b784c441a87c8680134bf4aef31e0a96c6e0b2344cd1ad875f09d372e9b`.

## Product result

Общий popup Полигона содержит 11 редакторов:

- Behavior: Route Profiles, Tactical Positions;
- Soldier: Soldier Archetypes, Attention Profiles, Perception Profiles, Movement Profiles;
- Combat: Weapons, Wounds & Suppression;
- World: Surface Types, Environment Profiles, Directional Terrain.

`Behavior Graph` и `Soldier Data` сознательно исключены.

Все gameplay tuning controls в Polygon authoring mode разблокированы, в том числе встроенные профили, published weapon/ammo/loadout entries и будущие/disconnected tuning-поля. При этом truthful labels `Ещё не подключено` / `Будущая механика` сохранены. Stable ID, revision/status и запрет удаления built-in остаются служебными ограничениями, а не gameplay lock.

## Exact artifact storage

Exact Global Editors v1 хранится как проверяемый delta Journal v4 → Global Editors v1:

`docs/subprojects/polygon-prototype/prototypes/global-editors-v1/`

- compressed delta SHA-256: `253d57a6c3b61e693f04c6191e9da9b622429a64102816ca174ce9abea30974e`;
- `rebuild_global_editors_v1.py` валидирует SHA исходника, delta и результата;
- локальная контрольная реконструкция дала byte-for-byte identical HTML и expected SHA.

## Verification

Fresh checks on the exact accepted HTML:

- `qa_unlock_all_tabs.py`: PASS — no disabled gameplay settings in all tested editors/tabs;
- `qa_unlock_interactions.py`: PASS — edit/save flows verified for Route Profiles, Soldier Archetypes, Perception, Wounds & Suppression, Environment, published Weapon and Surface Types;
- Chromium + Playwright `page.set_content()`: 1600×1000 and 1280×800 visually checked, no page/console errors in the control run;
- range/number synchronization checked where present;
- exact delta reconstruction: PASS, `cmp` byte-identical.

Direct localhost/file URL navigation was blocked by the execution environment, so the exact self-contained HTML was executed in real Chromium through Playwright `page.set_content()`; no surrogate UI was used.

Production build/TypeScript tests were not rerun because this acceptance changes only standalone Polygon UX payload/docs, not production source/runtime.

## Runtime boundary

- Production simulation/registries remain authoritative.
- No claim that standalone edits already wire into production runtime.
- Metrics telemetry, Journal replay/history and common-editor production wiring remain separate tasks.

## Integration authorization

User explicitly approved transfer to `real-wargame-preview` after unlocking all controls. `main` is out of scope and must remain untouched.

## Deployment

- **Requested:** NO.
- **Status:** `NOT_RUN`.

## Next product step

`Серия` remains the next unfinished major Polygon tab and must follow the established text-first approval process, starting from Global Editors v1 only.
