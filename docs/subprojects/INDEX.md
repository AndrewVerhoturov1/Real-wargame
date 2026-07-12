<!-- GENERATED FILE. Edit subproject.json files, then run npm run docs:generate. -->
# Subproject Index

Working branch: `real-wargame-preview`  
Canonical launcher: `Run-Real-Wargame-Lab.bat`

| Subproject | ID | Status | Current focus | Next step | Updated |
|---|---|---|---|---|---|
| [AI Single-Unit Editor — Stateful Tactical Awareness Lab](ai-single-unit-editor/STATUS.md) | `ai-single-unit-editor` | active | Navigation Profiles and Route Cost v1 перенесены в real-wargame-preview: доступны редактируемые профили движения, единый выбор активного профиля, профильный A*, ограничение обхода, субъективная известная опасность, контролируемое перестроение и независимый кешированный слой стоимости маршрута. Автоматические не-визуальные проверки пройдены; визуальная проверка ещё не запускалась. | Провести ручную проверку профилей, маршрутов, слоя стоимости и перестроения при смене профиля. Отдельный Playwright-сценарий запускать только после явного разрешения пользователя; затем продолжить по плану Soldier Perception and Attention v1. | 2026-07-12 |
| [2D Tactical Command Game — RTS Foundation / Soldier Behavior Lab](real-wargame-start/STATUS.md) | `real-wargame-start` | maintenance | RTS-заготовка завершена как рабочая основа и поддерживается по мере необходимости. Активная разработка перенесена в подпроект ai-single-unit-editor. | Исправлять карту, интерфейс, редактор, видимость и укрытия только когда это требуется активным вертикальным срезом поведения солдата. | 2026-07-12 |
| [GitHub Collaboration](github-collaboration/STATUS.md) | `github-collaboration` | maintenance | Основной workflow работает. Подпроект переведён в режим поддержки: активные документы должны использовать прямой push в real-wargame-preview как предпочтительный путь и PR в preview как fallback. | Поддерживать единый контракт во всех agent-facing документах и развивать автоматическую проверку их целостности без расширения процесса разработки игры. | 2026-07-12 |
| [Repo Migration](repo-migration/STATUS.md) | `repo-migration` | historical | Миграция завершена и больше не является рабочим подпроектом. Актуальная навигация находится в docs/ai/repo-context.json и docs/subprojects/index.json. | Не развивать этот подпроект. Обращаться к нему только для исторического контекста первоначальной настройки. | 2026-07-12 |
