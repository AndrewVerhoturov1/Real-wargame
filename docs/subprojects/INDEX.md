<!-- GENERATED FILE. Edit subproject.json files, then run npm run docs:generate. -->
# Subproject Index

Working branch: `real-wargame-preview`  
Canonical launcher: `Run-Real-Wargame-Lab.bat`

| Subproject | ID | Status | Current focus | Next step | Updated |
|---|---|---|---|---|---|
| [AI Single-Unit Editor — Stateful Tactical Awareness Lab](ai-single-unit-editor/STATUS.md) | `ai-single-unit-editor` | active | View and Memory Heatmap v1 и управление направлением бойца сохранены из актуальной preview-базы. Поверх них в изолированной ветке реализован этап 3 Graph v2: единый реестр контрактов, типизированные порты, строгая проверка, безопасная миграция v1, области памяти, четыре сохраняемых подграфа и русский интерфейс редактора. Идёт повторная полная и обязательная визуальная проверка на актуальной базе; real-wargame-preview не изменена. | Завершить полный набор smoke/build и обязательную browser/PNG-проверку итогового commit SHA. После отчёта ждать отдельной прямой команды пользователя на перенос в real-wargame-preview. | 2026-07-13 |
| [2D Tactical Command Game — RTS Foundation / Soldier Behavior Lab](real-wargame-start/STATUS.md) | `real-wargame-start` | maintenance | RTS-заготовка завершена как рабочая основа и поддерживается по мере необходимости. Активная разработка перенесена в подпроект ai-single-unit-editor. | Исправлять карту, интерфейс, редактор, видимость и укрытия только когда это требуется активным вертикальным срезом поведения солдата. | 2026-07-12 |
| [GitHub Collaboration](github-collaboration/STATUS.md) | `github-collaboration` | maintenance | Основной workflow работает. Подпроект переведён в режим поддержки: активные документы должны использовать прямой push в real-wargame-preview как предпочтительный путь и PR в preview как fallback. | Поддерживать единый контракт во всех agent-facing документах и развивать автоматическую проверку их целостности без расширения процесса разработки игры. | 2026-07-12 |
| [Repo Migration](repo-migration/STATUS.md) | `repo-migration` | historical | Миграция завершена и больше не является рабочим подпроектом. Актуальная навигация находится в docs/ai/repo-context.json и docs/subprojects/index.json. | Не развивать этот подпроект. Обращаться к нему только для исторического контекста первоначальной настройки. | 2026-07-12 |
