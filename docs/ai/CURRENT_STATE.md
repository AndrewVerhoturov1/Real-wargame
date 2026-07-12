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
- **Updated:** 2026-07-12
- **Current focus:** Navigation Profiles and Route Cost v1 перенесены в real-wargame-preview: доступны редактируемые профили движения, единый выбор активного профиля, профильный A*, ограничение обхода, субъективная известная опасность, контролируемое перестроение и независимый кешированный слой стоимости маршрута. Автоматические не-визуальные проверки пройдены; визуальная проверка ещё не запускалась.
- **Next step:** Провести ручную проверку профилей, маршрутов, слоя стоимости и перестроения при смене профиля. Отдельный Playwright-сценарий запускать только после явного разрешения пользователя; затем продолжить по плану Soldier Perception and Attention v1.
- **Last verified commit:** `1477d378d0c2c11fb3b50ab3e846a69f43ae41af`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
