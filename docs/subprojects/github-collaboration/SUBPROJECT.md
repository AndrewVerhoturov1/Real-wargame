# GitHub Collaboration

## Goal

Создать и поддерживать понятную систему совместной разработки через GitHub, где человек принимает решения, а агенты безопасно работают через ветки, Pull Request и ограниченные задачи.

## Current focus

Довести Q-режим до рабочего v1 рядом с уже существующим R/manual zworker процессом: Q должен быть короткой GitHub-aware постановкой, где внешний исполнитель создаёт ветку/PR и возвращает отчёт для Codex, а Codex проверяет PR и передаёт решение человеку.
Добавить X-режим (r-init) как preview-интеграционный workflow: preview-ветка, .bat-лаунчер, чеклист, GO/NO-GO, merge-handoff. Route X — отдельный механизм доставки, используемый r-init, но не идентичный ему.

## Key decisions

- Публичный контракт: одна задача -> одна ветка -> один Pull Request.
- `main` не является рабочей веткой для содержательных изменений.
- Человек не обязан вручную работать с ветками, merge, rebase и конфликтами.
- Codex выступает техническим контролёром и объяснителем.
- OpenCode используется как руки Codex для ограниченной рутины.
- Внешний web-chat работает через GitHub и возвращает результат через PR.
- Ручной zworker работает только по опубликованному контексту и возвращает ZIP с `answer.md`.
- R-режим сохраняется как полный ручной zworker-запрос с raw-ссылками и ZIP-ответом.
- Q-режим — v1 для внешнего исполнителя с GitHub-доступом: короткая постановка, самостоятельное чтение правил/навигации, отдельная ветка, PR и отчёт для Codex.
- Q-режим не заменяет контроль Codex: Codex всё равно проверяет PR, diff, scope, риски и не мержит без разрешения человека.
- Q-режим требует проверки на практике после первого реального внешнего исполнителя с GitHub-доступом.
- X-режим — preview-интеграционный workflow (r-init). Route X — отдельный механизм доставки, не идентичный r-init.

## Read first

1. `docs/subprojects/github-collaboration/SUBPROJECT.md`
2. `docs/subprojects/github-collaboration/subproject.json`
3. `docs/subprojects/github-collaboration/JOURNAL.md` (если существует)
4. `docs/ai/ZWORKER_MODES.md`
5. `docs/ai/TASK_PACK_Q_TEMPLATE.md`
6. `python scripts/subproject_context.py github-collaboration --brief`
7. `AGENTS.md`
8. `docs/ai/WORKFLOW_OVERVIEW.md`
9. `docs/ai/ROLES.md`
10. `docs/ai/POST_PR_CONSOLIDATION.md`
11. `docs/ai/R_INIT_WORKFLOW.md`

## Boundaries

- Не привязывать v1 системы к конкретному продукту, жанру, движку или стеку.
- Не добавлять CI, CODEOWNERS, issue templates, GitHub Actions или дополнительные security patterns в рамках этого v1 без отдельного задания.
- Не расширять `.gitignore`, кроме уже согласованных `.env` и `.env.*`.
- Не менять существующий subproject workflow в `AGENTS.md`; только расширять его.
- Не читать весь репозиторий без необходимости.
- Не превращать Q в auto-merge или прямую запись в `main`.

## Testing

Проверка v1 — документальная и структурная:

- файлы находятся по ожидаемым repo-relative путям;
- `subproject.json` содержит поля, используемые `scripts/subproject_context.py`;
- R/manual zworker flow сохранён как ZIP с `answer.md`;
- Q-mode описан как branch + PR + report для Codex;
- X-mode (r-init) описан как preview-ветка + .bat-лаунчер + чеклист + GO/NO-GO + merge-handoff; Route X — отдельный механизм доставки, не идентичный r-init;
- `AGENTS.md` сохраняет существующий Subproject Workflow и расширяет его центральным контрактом.

Needs local verification: запуск `python scripts/subproject_context.py github-collaboration --brief` в локальной среде.
