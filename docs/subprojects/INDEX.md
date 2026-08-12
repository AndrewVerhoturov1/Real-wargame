<!-- GENERATED FILE. Edit subproject.json files, then run npm run docs:generate. -->
# Subproject Index

Working branch: `real-wargame-preview`  
Canonical launcher: `Run-Real-Wargame-Lab.bat`

| Subproject | ID | Status | Current focus | Next step | Updated |
|---|---|---|---|---|---|
| [Отображение солдат видом сверху](soldier-topdown-appearance/STATUS.md) | `soldier-topdown-appearance` | active | Принята система условных знаков: круг для стоящего, скруглённый треугольник для присевшего, вытянутый прямоугольник для лежащего, оружие закреплено внутри знака справа у условного плеча; определены состояния и три уровня детализации. | Использовать UNIT_SYMBOL_SYSTEM.md как канонический визуальный контракт при переносе принятого HTML-прототипа в штатный рендер карты и редактора юнитов без отдельной демонстрационной сцены. | 2026-08-10 |
| [Первый прототип пехотного боя](infantry-combat-prototype-v1/STATUS.md) | `infantry-combat-prototype-v1` | active | Этап 1: сохраняемый статический предрасчёт и чистый решатель локальных рабочих точек проверены и перенесены в real-wargame-preview. Текущая работа — физическое выполнение временного действия от защищённого якоря. | Реализовать общий runtime anchor → action port → требуемая поза → observation/fire → return с отменой, сохранением и диагностикой. | 2026-07-22 |
| [Полигон — редактор эксперимента](polygon-prototype/STATUS.md) | `polygon-prototype` | active | Приняты рабочие UX-прототипы «Редактор юнита», «Редактор карты», «Программа», «Метрики v18» и «Журнал v4». Journal v4 утверждён пользователем, перенесён в real-wargame-preview и является единственной текущей канонической базой для следующих UI-итераций Полигона. Следующая незавершённая крупная продуктовая вкладка — «Серия»; production-подключение telemetry и replay/history остаётся отдельной runtime-задачей. | Проектировать вкладку «Серия» по обязательному text-first процессу, начиная только от принятого Journal v4; отдельно позже подключить принятые UX Метрик и Журнала к реальному telemetry/replay runtime, сохраняя simulation единственным источником игровой истины. | 2026-08-12 |
