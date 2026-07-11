<!-- GENERATED FILE. Edit docs/subprojects/github-collaboration/subproject.json, then run npm run docs:generate. -->
# GitHub Collaboration — Current Status

- **ID:** `github-collaboration`
- **Status:** `maintenance`
- **Updated:** 2026-07-12
- **Working branch:** `real-wargame-preview`
- **Canonical launcher:** `Run-Real-Wargame-Lab.bat`
- **Last verified commit:** `f0bc53566be4451e9dd9fb8aa5df6a7027de759b`

## Goal

Создать и поддерживать понятную систему совместной разработки через GitHub, где человек принимает решения, а агенты безопасно работают через preview, ограниченные задачи и честные проверки.

## Current focus

Основной workflow работает. Подпроект переведён в режим поддержки: активные документы должны использовать прямой push в real-wargame-preview как предпочтительный путь и PR в preview как fallback.

## Next step

Поддерживать единый контракт во всех agent-facing документах и развивать автоматическую проверку их целостности без расширения процесса разработки игры.

## Read first

- `docs/subprojects/github-collaboration/STATUS.md`
- `docs/ai/WEB_CHAT_START.md`
- `AGENTS.md`
- `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- `docs/ai/ZWORKER_MODES.md`
- `docs/ai/PR_REVIEW_CHECKLIST.md`
- `docs/ai/R_INIT_WORKFLOW.md`

## Main files

- `AGENTS.md`
- `.gitignore`
- `.github/pull_request_template.md`
- `.github/workflows/preview-policy.yml`
- `.github/workflows/agent-docs-integrity.yml`
- `docs/ai/repo-context.json`
- `docs/ai/WEB_CHAT_START.md`
- `docs/ai/CURRENT_STATE.md`
- `docs/ai/WORKFLOW_OVERVIEW.md`
- `docs/ai/EXTERNAL_CHAT_WORKFLOW.md`
- `docs/ai/CODEX_CONTROLLER_WORKFLOW.md`
- `docs/ai/OPENCODE_HANDS_WORKFLOW.md`
- `docs/ai/HUMAN_WORKFLOW.md`
- `docs/ai/TASK_PACK_TEMPLATE.md`
- `docs/ai/TASK_PACK_Q_TEMPLATE.md`
- `docs/ai/PR_REVIEW_CHECKLIST.md`
- `docs/ai/ZWORKER_MODES.md`
- `docs/ai/POST_PR_CONSOLIDATION.md`
- `docs/ai/R_INIT_WORKFLOW.md`
- `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- `docs/subprojects/github-collaboration/SUBPROJECT.md`
- `docs/subprojects/github-collaboration/subproject.json`
- `scripts/agent_docs_lib.mjs`
- `scripts/generate_agent_docs.mjs`
- `scripts/check_agent_docs.mjs`

## Suggested verification

- `npm run docs:smoke`
- `npm run docs:generate`
- `npm run docs:check`
- `Проверить, что все активные документы называют real-wargame-preview рабочей веткой.`
- `Проверить, что direct push в preview указан как предпочтительный путь, а PR в preview — как fallback.`
- `Проверить, что main требует MAIN_GO_APPROVED_BY_USER: yes.`
- `Проверить, что generated files не имеют ручных расхождений с JSON.`

## Safety rules

- Не менять main напрямую для содержательных изменений.
- Не мержить PR без явного разрешения человека.
- Не включать auto-merge.
- Не публиковать secrets, токены, ключи, .env или приватные данные.
- Для внешнего web-chat и zworker передавать только минимальный публичный контекст.
- Не утверждать, что локальные проверки запускались, если они не запускались.
- Не использовать Q-режим, если у внешнего исполнителя нет GitHub-доступа или задача требует фиксированного ZIP-результата.
- Не считать PR обязательным, если исполнитель может безопасно доставить ограниченный результат прямым push в real-wargame-preview.
- Не оставлять временную ветку или QA PR без явной причины.
