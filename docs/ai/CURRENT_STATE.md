<!-- GENERATED FILE. Edit docs/ai/repo-context.json or subproject.json, then run npm run docs:generate. -->
# Current Repository State

Generated from canonical repository and subproject metadata.

## Repository

- **Project:** Real-Wargame
- **Repository:** `AndrewVerhoturov1/Real-wargame`
- **Working branch:** `real-wargame-preview`
- **Stable branch:** `main`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **PixiJS major:** 7
- **Updated:** 2026-07-12

## Delivery policy

- Preferred: `direct-push-to-preview` to `real-wargame-preview`.
- Fallback: `pull-request-to-preview`.
- Changing `main` requires explicit human GO: **yes**.
- Auto-merge allowed: **no**.

## Active subproject: AI Single-Unit Editor — Stateful Tactical Awareness Lab

- **ID:** `ai-single-unit-editor`
- **Updated:** 2026-07-13
- **Current focus:** Graph v2 собран в чистое transfer-дерево `transfer/ai-graph-v2-preview-2026-07-13` поверх актуального `real-wargame-preview` `db80f36edaf018c6a45dfeb7cc0f7caaed00bdb5`: единый реестр 36 контрактов, типизированные порты, строгая проверка, миграция Graph v1, пять областей памяти, WaitForEvent/Timeout/Retry, четыре сохраняемых подграфа и русский интерфейс без обязательного JSON. Обязательная локальная Chromium-проверка выявила и исправила два дефекта: выбор подграфа теперь сохраняется из русской панели, а навигационная цепочка не дублирует название.
- **Next step:** Опубликовать чистую ветку `transfer/ai-graph-v2-preview-2026-07-13`, открыть PR в `real-wargame-preview` и выполнить SHA-привязанную системную Chrome-проверку. После зелёных CI и осмотра свежих PNG ветка готова к переносу; `main` не менять.
- **Last verified commit:** `02a43f233d1618b7b8b2331869d34e9b12bbec9e`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
