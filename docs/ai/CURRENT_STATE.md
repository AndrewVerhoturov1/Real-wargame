<!-- GENERATED FILE. Edit docs/ai/repo-context.json or subproject.json, then run npm run docs:generate. -->
# Current Repository State

Generated from canonical repository and subproject metadata.

## Repository

- **Project:** Real-Wargame
- **Repository:** `AndrewVerhoturov1/Real-wargame`
- **Working branch:** `real-wargame-preview`
- **Stable branch:** `main`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **PixiJS major:** 8
- **Updated:** 2026-08-12

## Delivery policy

- Preferred: `feature-branch-with-explicit-manual-vercel-preview` to `real-wargame-preview`.
- Fallback: `pull-request-to-preview-when-technically-required`.
- Changing `main` requires explicit human GO: **yes**.
- Auto-merge allowed: **no**.

## Active subproject: Первый прототип пехотного боя

- **ID:** `infantry-combat-prototype-v1`
- **Updated:** 2026-07-22
- **Current focus:** Этап 1: сохраняемый статический предрасчёт и чистый решатель локальных рабочих точек проверены и перенесены в real-wargame-preview. Текущая работа — физическое выполнение временного действия от защищённого якоря.
- **Next step:** Реализовать общий runtime anchor → action port → требуемая поза → observation/fire → return с отменой, сохранением и диагностикой.
- **Last verified commit:** `86071bb3d0c4ebd95adf4e87ee4d575fa7108da3`
- **Status:** [generated status](../subprojects/infantry-combat-prototype-v1/STATUS.md)

## Active subproject: Полигон — редактор эксперимента

- **ID:** `polygon-prototype`
- **Updated:** 2026-08-12
- **Current focus:** Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа» и «Метрики». Метрики v18 утверждены пользователем и перенесены в real-wargame-preview; принятый Отчёт имеет верхние режимы только «Обзор / Измерения / Хронология». Следующие незавершённые продуктовые разделы — «Серия» и «Журнал».
- **Next step:** Отдельно выбрать и текстом спроектировать следующий незавершённый раздел Полигона — «Серия» или «Журнал» — сохраняя принятую v18 Метрик без перепроектирования; позже закончить общую правую и верхнюю панели и связать UX Метрик с реальным runtime-сбором telemetry без переноса игровой истины в UI.
- **Last verified commit:** not recorded
- **Status:** [generated status](../subprojects/polygon-prototype/STATUS.md)

## Active subproject: Отображение солдат видом сверху

- **ID:** `soldier-topdown-appearance`
- **Updated:** 2026-08-10
- **Current focus:** Принята система условных знаков: круг для стоящего, скруглённый треугольник для присевшего, вытянутый прямоугольник для лежащего, оружие закреплено внутри знака справа у условного плеча; определены состояния и три уровня детализации.
- **Next step:** Использовать UNIT_SYMBOL_SYSTEM.md как канонический визуальный контракт при переносе принятого HTML-прототипа в штатный рендер карты и редактора юнитов без отдельной демонстрационной сцены.
- **Last verified commit:** not recorded
- **Status:** [generated status](../subprojects/soldier-topdown-appearance/STATUS.md)
