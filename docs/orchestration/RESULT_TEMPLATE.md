# Web Chat and Worker Result Template

Use this template for the canonical Web Chat feature branch and optional research/proposal workers.

The user-facing part must come first. Technical details follow only when they help a decision or provide evidence.

## 1. User-facing summary

```md
# Результат

**Статус:** готово / готово к проверке / частично / заблокировано

**Что изменилось:**
Короткое объяснение обычным русским языком.

**Открыть:**
- [Игра](<game-preview-url>)
- [Редактор ИИ](<game-preview-url>/ai-node-editor.html)

**Ветка:** `feature/...`
**Коммит:** `short-sha`

**Что проверить:**
1. Короткий шаг.
2. Ожидаемый результат.
```

Mandatory presentation rules:

- write in simple Russian, as for an intelligent high-school student;
- avoid unnecessary English terms and abbreviations;
- explain an unavoidable technical term once;
- make all useful URLs clickable;
- never make the user search for links in logs;
- when screenshots exist, show the most useful screenshots directly after the summary;
- provide the full artifact link separately;
- put long hashes, workflow IDs and raw diagnostics after the practical result.

## 2. Useful screenshots

When screenshots exist, present them in a convenient order:

```md
## Скриншоты

### Основной результат
![Короткое понятное описание](<direct-screenshot-or-artifact-link>)

### Дополнительная проверка
![Короткое понятное описание](<direct-screenshot-or-artifact-link>)

[Открыть полный набор материалов](<artifact-link>)
```

Do not dump every frame. Select the frames that prove the requested behavior.

## 3. Task and status

```text
task:
status: COMPLETED / PARTIAL / BLOCKED / RESEARCH_ONLY
delivery_state: research_only / implementation / ready_for_live_test / live_test_revision / visual_qa / approved_for_preview / transferred_to_preview
```

## 4. Canonical branch identity

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
```

Research-only workers without a branch use:

```text
feature_branch: owned by designated Web Chat
```

They do not invent commit identities.

## 5. Solution

Explain:

- how the problem was understood;
- what was changed;
- why this approach fits the current systems;
- what was intentionally not changed.

Keep the first explanation understandable without repository jargon.

## 6. Performance impact

Mandatory for runtime-affecting work. For truly non-runtime work, use `not applicable` and give the exact reason.

```text
hot path:
worst-case complexity:
main-thread work:
full-map builds:
shared prepared data:
worker and queue budget:
cache owner/key/limit:
invalidation revisions:
memory estimate:
stale-result rejection:
teardown:
before metrics:
after metrics:
performance scenario affected:
performance reason:
tested implementation head:
remaining performance risks:
```

Do not replace analysis with “small change should not affect performance”. Do not run performance checks only because a SHA changed.

## 7. Verification selection

```text
change risk:
mandatory non-browser checks:
risk-selected focused checks:
manual live checks:
visual verification requested: yes / no
visual route selected: direct-browser / vercel-deployment-playwright-e2e / not run / not applicable
heavy checks deliberately not run:
why omitted heavy checks cannot detect regression:
TESTED_IMPLEMENTATION_HEAD:
PERFORMANCE_REASON:
```

The user does not need to name the visual skill.

## 8. Changed files

List only relevant files:

```text
path/to/file — what changed
```

## 9. Checks actually run

List only commands that actually ran:

```text
<command> — passed / failed
```

Always distinguish:

- local or Web Chat checks;
- Vercel deployment;
- human live testing;
- direct-browser verification;
- GitHub Actions verification.

Never claim one as another.

## 10. Required deployment pages

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

A deployment with only the game page is incomplete.

## 11. Vercel Preview

Use the one permanent Git-connected Vercel project.

```text
game_preview: clickable URL / pending / failed
ai_node_editor_preview: clickable URL / pending / failed
deployment_status: ready / failed / pending / not checked
deployed_branch:
deployed_commit:
product_sha_match: yes / no / unproven
permanent_vercel_project_touched: no
```

Codex is not required for deployment. Do not report a manual Codex handoff as the normal route.

## 12. Manual live-test checklist

For user-visible work, provide short task-specific steps for both pages.

### Game

1. What to open or select.
2. What action to perform.
3. What should visibly change.

### AI Node Editor

1. Confirm `ai-node-editor.html` opens.
2. Open the task-relevant editor section.
3. Confirm controls, styles and state updates work.

Do not require full-project manual regression for every focused change.

## 13. Human live-test status

```text
live_test_status: pending / passed / failed / not run
live_tested_commit:
reported_issues:
```

Product issues are fixed on the same feature branch. Later pushes update Vercel automatically.

## 14. Visual QA preparation and approval

```text
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_route: direct-browser / vercel-deployment-playwright-e2e / not run / not applicable
visual_qa_run: passed / failed / not run / not applicable
```

Clear intent such as `проверь визуально`, `сделай скриншоты` or `проверь через Playwright` already counts as approval.

## 15. Visual product identity

```text
target_game_url: clean URL without secrets
target_ai_node_editor_url: clean URL without secrets
expected_product_sha:
observed_product_sha:
product_sha_match: yes / no / unproven
```

A new product SHA invalidates previous visual acceptance evidence.

## 16. Deployed Vercel CI identity

Complete when the route is `vercel-deployment-playwright-e2e`:

```text
temporary_base_branch:
temporary_head_branch:
temporary_pr:
final_run_id:
final_workflow_head_sha:
workflow_conclusion:
artifact_id:
artifact_digest: value / unavailable
```

The temporary PR must never be merged. CI harness files must not enter product branches.

## 17. Visual scenario result

Adjust fields to the task, but verify actual state change rather than only element presence.

```text
game_load: passed / failed / not applicable
ai_node_editor_load: passed / failed / not applicable
soldier_creation: passed / failed / not applicable
soldier_selection: passed / failed / not applicable
order_issue: passed / failed / not applicable
actual_movement: passed / failed / not applicable
danger: passed / failed / not applicable
cover: passed / failed / not applicable
combined: passed / failed / not applicable
persistence: passed / failed / not applicable
```

## 18. Diagnostics

```text
console_errors:
page_errors:
request_failures:
ignored_service_failures:
failure_class: none / environment / test-harness / application
```

Classify before edits:

- environment/configuration changes stay in the CI or deployment layer;
- test-harness changes stay in the temporary CI head branch;
- application changes return to the canonical feature branch.

Never fix product code on CI branches.

## 19. Evidence inspection

```text
evidence_json_inspected: yes / no
screenshots_inspected: yes / no
trace_inspected: yes / no / not needed
contact_sheet:
key_frames:
artifact_link: clickable URL
workflow_run_link: clickable URL
```

A green workflow alone is insufficient. Inspect the evidence and show useful screenshots to the user.

## 20. Preview transfer

```text
preview_transfer_approval: approved / not approved
approved_feature_commit:
preview_commit:
transfer_method:
preview_touched: no / explicit approved transfer
main_touched: no / explicit approved change
```

Visual success does not grant transfer permission. Transfer requires separate explicit user GO for the exact accepted commit.

## 21. Post-transfer deployment check

After transfer into `real-wargame-preview`:

```text
preview_deployment_status: ready / failed / pending
preview_game_url: clickable URL
preview_ai_node_editor_url: clickable URL
preview_game_checked: yes / no
preview_ai_node_editor_checked: yes / no
preview_deployed_commit:
```

The transfer is not complete from the user's perspective until both pages work or the failure is reported.

## 22. Cleanup

```text
feature_branch_cleanup: deleted / kept by user request / pending
temporary_pr_closed_without_merge: yes / no / not applicable
ci_branch_cleanup: deleted / pending with exact names / not applicable
legacy_temporary_vercel_project: none / deleted / kept with reason
legacy_temporary_vercel_project_cleanup_condition_met: yes / no / not applicable
permanent_vercel_project_deleted: no
```

Rules:

- delete the feature branch only after the accepted preview deployment works;
- delete an old separate temporary Vercel project only after both replacement pages work;
- never delete the permanent Git-connected Vercel project;
- old deployments inside the permanent project may be handled by Vercel retention settings.

## 23. Risks and limitations

List known technical, behavioral, performance, visual, deployment-identity and cleanup limitations in plain Russian first. Add detailed diagnostics only when useful.

## 24. Alternative approaches and open questions

Include only real alternatives or unresolved decisions. Do not add filler.
