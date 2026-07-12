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
- **Current focus:** На временной ветке реализуется Navigation Profiles v1: редактируемый реестр профилей, единый выбор активного профиля, профильный A*, ограничение обхода, субъективная известная опасность, контролируемое перестроение и независимый кешированный слой стоимости маршрута. Результат ещё не переносился в real-wargame-preview; визуальная проверка не запускалась.
- **Next step:** Завершить не-визуальные проверки точного SHA, подготовить отдельный Playwright-сценарий и после разрешения пользователя провести визуальную проверку с осмотром PNG. Перенос в real-wargame-preview возможен только по отдельной явной команде пользователя.
- **Last verified commit:** `a818afa65b8cc0086c3360d27002b023e6848650`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
