<!-- GENERATED FILE. Edit subproject.json files, then run npm run docs:generate. -->
# Subproject Index

Working branch: `real-wargame-preview`  
Canonical launcher: `Run-Real-Wargame-Lab.bat`

| Subproject | ID | Status | Current focus | Next step | Updated |
|---|---|---|---|---|---|
| [AI Single-Unit Editor — Stateful Tactical Awareness, Hierarchical States and Plans](ai-single-unit-editor/STATUS.md) | `ai-single-unit-editor` | active | Gate 0 кампании Stage 1–2: State/Plan v1, Tactical Query System и код Combat Tactical Integration Stage 1 уже находятся в real-wargame-preview. Stage 1 остаётся открытым до устранения зафиксированных follow-up gaps и отдельной визуальной приёмки. | Выполнять план завершения Stage 1 вертикальными срезами: разделить опасность и подавление, доказать объединение неизвестного огня, живое перестроение маршрута, выбор безопасной стороны стены и обратного склона, закрепить smoke в CI и только после разрешения запустить visual QA. Поведенческие решения последующих срезов собирать и настраивать через Graph v2. | 2026-07-14 |
| [2D Tactical Command Game — RTS Foundation / Soldier Behavior Lab](real-wargame-start/STATUS.md) | `real-wargame-start` | maintenance | RTS-заготовка завершена как рабочая основа и поддерживается по мере необходимости. Активная разработка перенесена в подпроект ai-single-unit-editor. | Исправлять карту, интерфейс, редактор, видимость и укрытия только когда это требуется активным вертикальным срезом поведения солдата. | 2026-07-12 |
| [GitHub Collaboration](github-collaboration/STATUS.md) | `github-collaboration` | maintenance | Основной workflow работает. Подпроект переведён в режим поддержки: активные документы должны использовать прямой push в real-wargame-preview как предпочтительный путь и PR в preview как fallback. | Поддерживать единый контракт во всех agent-facing документах и развивать автоматическую проверку их целостности без расширения процесса разработки игры. | 2026-07-12 |
| [Repo Migration](repo-migration/STATUS.md) | `repo-migration` | historical | Миграция завершена и больше не является рабочим подпроектом. Актуальная навигация находится в docs/ai/repo-context.json и docs/subprojects/index.json. | Не развивать этот подпроект. Обращаться к нему только для исторического контекста первоначальной настройки. | 2026-07-12 |
