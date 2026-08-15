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

## Active subproject: Перенос Полигона из HTML-прототипа в продукт

- **ID:** `polygon-html-to-product`
- **Updated:** 2026-08-15
- **Current focus:** Аналитическая фаза завершена; четыре независимых Q-handoff для АРКИ, ПУЛЬСА, ЛИНЗЫ и ХРОНИСТА подготовлены, а рабочая карта проекта создана. Q пока не запущены.
- **Next step:** После отдельного разрешения пользователя заново получить exact current HEAD real-wargame-preview и запустить четыре Q параллельно на назначенных feature-ветках. Первая точка интеграции после принятия результатов: АРКА + ПУЛЬС → первый настоящий LIVE Unit.
- **Last verified commit:** not recorded
- **Status:** [generated status](../subprojects/polygon-html-to-product/STATUS.md)

## Active subproject: Полигон — редактор эксперимента

- **ID:** `polygon-prototype`
- **Updated:** 2026-08-15
- **Current focus:** Пользователем принята Interface Linkage v1 поверх актуальной Right Panel v1 / memory-tab-v3. Итерация сохраняет новую правую панель Юнит, Инфо, Внимание и Память и добавляет сквозную связность существующих разделов: Роль отдельно от Архетипа, linked-entity переходы и Используется, provenance Laboratory, двустороннюю связь Программа↔Журнал, единые Метрики для Серии, контекст исторического прогона и полный UX-контракт Сохранить эксперимент. Канонический внешний артефакт для ручной загрузки — polygon-interface-linkage-v1.html, 2 292 772 байта, SHA-256 4f33f19578698947cd629a88c6963c325895995fdd78a5380966ae1ef2fa1cfd; ACCEPTED_INTERFACE_LINKAGE_V1.md фиксирует контракт.
- **Next step:** Пользователь вручную загружает polygon-interface-linkage-v1.html в docs/subprojects/polygon-prototype/prototypes/ и сверяет размер/SHA-256. После этого все следующие UI-итерации Полигона начинать только от Interface Linkage v1. Следующие вкладки правого инспектора и production wiring проектировать отдельно, не откатывая принятую связность интерфейса и Right Panel v1.
- **Last verified commit:** `2549055956adff3e29c0b1f5ef9adb71d3146b66`
- **Status:** [generated status](../subprojects/polygon-prototype/STATUS.md)

## Active subproject: Отображение солдат видом сверху

- **ID:** `soldier-topdown-appearance`
- **Updated:** 2026-08-10
- **Current focus:** Принята система условных знаков: круг для стоящего, скруглённый треугольник для присевшего, вытянутый прямоугольник для лежащего, оружие закреплено внутри знака справа у условного плеча; определены состояния и три уровня детализации.
- **Next step:** Использовать UNIT_SYMBOL_SYSTEM.md как канонический визуальный контракт при переносе принятого HTML-прототипа в штатный рендер карты и редактора юнитов без отдельной демонстрационной сцены.
- **Last verified commit:** not recorded
- **Status:** [generated status](../subprojects/soldier-topdown-appearance/STATUS.md)
