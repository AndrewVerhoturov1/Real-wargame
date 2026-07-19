# Web Chat and Worker Result Template

Use this template for canonical feature work. Put the practical Russian summary first; technical evidence follows only when useful.

## 1. User-facing summary

### Code ready, not deployed

```md
# Результат

**Статус:** код готов, не задеплоен

**Что изменилось:**
Короткое объяснение.

**Ветка:** `feature/...`
**Коммит:** `short-sha`

**Проверки:**
- фактически выполненные проверки

**Деплой:** не запускался; требуется отдельная команда пользователя.
```

### Manual Preview ready

```md
# Результат

**Статус:** готово к проверке

**Что изменилось:**
Короткое объяснение.

**Открыть:**
- [Игра](<game-preview-url>/)
- [Редактор ИИ](<game-preview-url>/ai-node-editor.html)

**Ветка:** `feature/...`
**Коммит:** `short-sha`

**Что проверить:**
1. Короткий шаг.
2. Ожидаемый результат.
```

## 2. Presentation rules

- Use simple Russian.
- Make useful URLs clickable.
- Never make the user search logs for links.
- Show useful screenshots directly when available.
- Put long hashes, workflow IDs and diagnostics after the practical result.
- Never invent a deployment URL when deployment was not requested or did not succeed.

## 3. Task and branch identity

```text
task:
status: COMPLETED / PARTIAL / BLOCKED / RESEARCH_ONLY
delivery_state: implementation / code_ready / manual_deployment / ready_for_live_test / live_test_revision / visual_qa / transferred_to_preview
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
```

## 4. Verification selection

```text
change_risk:
mandatory_non_browser_checks:
risk_selected_focused_checks:
manual_live_checks:
deployment_requested: yes / no
visual_verification_requested: yes / no
heavy_checks_deliberately_not_run:
TESTED_IMPLEMENTATION_HEAD:
```

List only commands that actually ran:

```text
<command> — passed / failed
```

Always distinguish local checks, Vercel deployment, human live testing, browser verification and GitHub Actions.

## 5. Performance impact

Mandatory for runtime-affecting work:

```text
hot_path:
worst_case_complexity:
main_thread_work:
full_map_builds:
shared_prepared_data:
worker_and_queue_budget:
cache_owner_key_limit:
invalidation_revisions:
stale_result_rejection:
teardown:
remaining_performance_risks:
```

For non-runtime documentation work, state `not applicable` and why.

## 6. Required deployment pages

Every build and deployment must include:

```text
/                     → game
/ai-node-editor.html  → AI Node Editor
```

Report:

```text
game_build_output: present / missing / not checked
ai_node_editor_build_output: present / missing / not checked
```

## 7. Manual Vercel deployment

Git pushes do not deploy.

```text
deployment_requested: yes / no
deployment_trigger: explicit_user_request / not_requested
deployment_status: ready / failed / pending / not_run
deployment_id:
deployed_branch:
deployed_commit:
product_sha_match: yes / no / unproven / not_applicable
game_preview: clickable URL / unavailable / not_deployed
ai_node_editor_preview: clickable URL / unavailable / not_deployed
permanent_vercel_project_touched: no
```

When deployment was requested, follow:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

Do not claim `ready` before Vercel reports `READY`. Do not claim an exact SHA when identity is unproven.

## 8. Manual live-test checklist

### Game

1. What to open or select.
2. What action to perform.
3. What should visibly change.

### AI Node Editor

1. Confirm `ai-node-editor.html` opens.
2. Open the task-relevant section.
3. Confirm controls and state updates work.

## 9. Human live-test status

```text
live_test_status: pending / passed / failed / not_run
live_tested_commit:
reported_issues:
```

Product issues stay on the same feature branch. Later pushes do not update Vercel automatically.

## 10. Visual QA

```text
visual_qa_prepared: yes / no / not_applicable
visual_qa_approval: approved / declined / pending / not_applicable
visual_qa_route: direct_browser / vercel_deployment_playwright_e2e / not_run / not_applicable
visual_qa_run: passed / failed / not_run / not_applicable
expected_product_sha:
observed_product_sha:
visual_product_sha_match: yes / no / unproven / not_applicable
```

Visual permission does not imply deployment permission. The deployed-Vercel Playwright skill tests an existing deployment and must not deploy it.

## 11. Changed files

List only relevant files:

```text
path/to/file — what changed
```

## 12. Transfer and cleanup

```text
preview_transfer_approval: approved / declined / pending
approved_feature_commit:
preview_commit:
transfer_method:
preview_deployment_requested: yes / no
feature_branch_cleanup:
temporary_ci_cleanup:
legacy_temporary_vercel_project_cleanup:
main_touched: no
```

Transfer into `real-wargame-preview` and deployment of that branch are separate permissions unless the user explicitly requests both.

## 13. Required honesty

Never claim one as another:

- commit/push;
- local checks;
- Vercel deployment;
- human live testing;
- direct-browser verification;
- GitHub Actions evidence.

A green workflow alone is not visual proof. A successful build alone is not a deployment. A push alone is not a deployment request.
