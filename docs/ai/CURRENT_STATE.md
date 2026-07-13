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
- **Current focus:** Graph v2 собран в чистой transfer-ветке transfer/ai-graph-v2-preview-ready-2026-07-13 поверх актуальной real-wargame-preview: единый реестр контрактов, типизированные порты, строгая проверка, автоматическая миграция Graph v1, пять областей памяти, WaitForEvent/Timeout/Retry, четыре сохраняемых подграфа и русский интерфейс настройки без JSON. Выбор подграфа, политика отмены и реальные входы/выходы видны прямо в панели «Человеческий интерфейс ноды». Локально пройдены все новые и старые smoke-проверки и production build на базе preview 7735cb07028d2855c3a85869cdd0531c9a55ed7e.
- **Next step:** Запустить SHA-привязанную системную Chromium-проверку clean transfer PR и осмотреть свежие PNG. После зелёного результата PR подготовлен к слиянию в real-wargame-preview по прямой команде пользователя; main не менять.
- **Last verified commit:** `02a43f233d1618b7b8b2331869d34e9b12bbec9e`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
