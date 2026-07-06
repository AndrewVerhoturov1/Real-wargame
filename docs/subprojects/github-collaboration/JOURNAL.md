# Subproject Journal

## Rules

- Record important and medium-importance steps only, not every micro-step.
- Keep entries short: what changed, why, and the result.
- Do not paste raw logs, telemetry, or full reports.
- One entry per significant event or decision.

## Entries

- **2026-07-06**: Started `github-collaboration` subproject as a v1 documentation layer for shared GitHub development. Captured the public contract: one task -> one branch -> one Pull Request; `main` is not a working branch for meaningful changes; Codex controls/reviews, OpenCode acts as limited hands, external web-chat works through GitHub PRs, manual zworker returns ZIP drafts from public context only.
- **2026-07-06**: Добавлен черновик различия R/Q режимов внешней работы. R остаётся полным zworker-запросом с ZIP-ответом, Q описан как короткий GitHub-aware запрос, где внешний исполнитель создаёт ветку/PR и возвращает отчёт для Codex.
- **2026-07-06**: Q-режим доведён до v1-контура: Codex готовит короткую постановку, внешний GitHub-capable исполнитель читает правила/навигацию, работает в отдельной ветке и открывает PR, Codex проверяет diff/scope/риски, человек решает. R-режим сохранён как ZIP-процесс для ручного zworker.
- **2026-07-06**: Добавлен `docs/ai/POST_PR_CONSOLIDATION.md` — слой консолидации после PR. Документ добавлен в навигационные списки AGENTS.md, SUBPROJECT.md и subproject.json для обеспечения discoverability агентами и человеком.
- **2026-07-06**: Codex reconciled the R-INT candidate set, preserved governance on `main`, and selectively integrated `real-wargame-start` plus `tactical-board` files into the working tree without git writes.
- **2026-07-07**: Added X-mode (W-class strong external web/chat reasoning) documentation alongside existing R/Q. X uses direct GitHub branch+PR delivery, markdown report, authoritative truth order (PR diff first, report second). No ZIP, no direct main write, no merge, no auto-merge. Updated AGENTS.md, ZWORKER_MODES.md, TASK_PACK_Q_TEMPLATE.md, POST_PR_CONSOLIDATION.md, SUBPROJECT.md, subproject.json, and JOURNAL.md.
