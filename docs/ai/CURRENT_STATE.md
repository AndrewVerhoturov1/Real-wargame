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
- **Current focus:** Soldier Perception and Attention v1 реализован и проверен во временной ветке feat/perception-attention-v1-current-temp поверх актуального real-wargame-preview. Добавлены режимы Марш/Наблюдение/Поиск цели/Стрельба, плавное поле внимания, постепенное ослабление обзора лесом, накопление и старение контактов, примерный слух, Blackboard и ноды управления вниманием, редактор профилей и отдельный PixiJS-слой. В real-wargame-preview реализация пока не перенесена.
- **Next step:** Показать результат пользователю во временной ветке. После явного подтверждения перенести feat/perception-attention-v1-current-temp в real-wargame-preview, повторить проверки на точном merge SHA и только затем продолжать расширение восприятия на всех бойцов; main не менять без отдельного явного GO пользователя.
- **Last verified commit:** `09209675b692e4d5b83666a272104ee4f452ebf2`
- **Status:** [generated status](../subprojects/ai-single-unit-editor/STATUS.md)
