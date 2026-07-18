# Web Chat and Worker Result Template

Use this template for the canonical Web Chat feature branch and optional research/proposal workers.

```md
# Result

## Task

Short task name and formulation.

## Status

`COMPLETED`, `PARTIAL`, `BLOCKED` or `RESEARCH_ONLY`.

## Delivery state

```text
research_only
implementation
ready_for_live_test
live_test_revision
visual_qa
approved_for_preview
transferred_to_preview
```

## Canonical branch identity

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
```

Research-only workers without a branch use `feature_branch: owned by designated Web Chat` and do not invent commit identities.

## Understanding of the problem

How the problem was understood and what assumptions were made.

## Solution

What was implemented or proposed.

## Architecture

Why this approach was selected and how it fits existing systems.

## Performance impact

Mandatory for runtime-affecting work. For truly non-runtime work, use `not applicable` with exact reason.

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

Do not replace analysis with “small change should not affect performance”. Do not run performance checks only because SHA changed.

## Verification selection

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

The user does not need to name the visual skill. When visual verification is requested and no directly controlled browser can open the Vercel Preview, `vercel-deployment-playwright-e2e` is mandatory.

## Changed files

- `path/to/file`

## Checks actually run

- `<command>` — passed/failed;
- list only commands that actually ran.

## Not checked

Distinguish:

- Web Chat workspace checks;
- Vercel deployment;
- human live testing;
- direct-browser visual verification;
- GitHub Actions visual verification.

## Manual live-test checklist

For user-visible work, list task-specific steps for the human in the branch-linked Vercel Preview and expected results.

## Vercel Preview

```text
vercel_branch_preview: URL / pending / not requested
vercel_commit_preview: URL / unavailable / pending / not requested
deployment_status: ready / failed / pending / not requested
deployed_commit:
```

Codex is deployment-only. Do not report Codex implementation, fixes, merge or transfer.

## Human live-test status

```text
live_test_status: pending / passed / failed / not run
live_tested_commit:
reported_issues:
```

Product issues are fixed on the same feature branch.

## Visual QA preparation and approval

```text
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_route: direct-browser / vercel-deployment-playwright-e2e / not run / not applicable
visual_qa_run: passed / failed / not run / not applicable
```

Clear user intent such as `проверь визуально`, `сделай скриншоты` or `проверь через Playwright` already counts as approval. Do not ask the user to name the skill.

## Visual product identity

```text
target_url: clean URL without secrets
expected_product_sha:
observed_product_sha:
product_sha_match: yes / no / unproven
```

If deployed identity cannot be independently proven, do not describe the result as exact-SHA acceptance.

A new product SHA invalidates previous visual evidence for acceptance.

## Deployed Vercel CI identity

Complete when route is `vercel-deployment-playwright-e2e`:

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

Temporary PR must never be merged. CI harness files must not enter product branches.

## Visual scenario result

```text
application_load: passed / failed / not applicable
soldier_creation: passed / failed / not applicable
soldier_selection: passed / failed / not applicable
order_issue: passed / failed / not applicable
actual_movement: passed / failed / not applicable
danger: passed / failed / not applicable
cover: passed / failed / not applicable
combined: passed / failed / not applicable
persistence: passed / failed / not applicable
```

Adjust scenario fields for the task, but always verify actual state change rather than only DOM presence.

## Diagnostics

```text
console_errors:
page_errors:
request_failures:
ignored_service_failures:
failure_class: none / environment / test-harness / application
```

Classify before edits:

- environment/configuration changes stay in CI layer;
- test-harness changes stay in temporary CI head branch;
- application changes return to canonical feature branch.

Never fix product code on CI branches.

## Evidence inspection and presentation

```text
evidence_json_inspected: yes / no
screenshots_inspected: yes / no
trace_inspected: yes / no / not needed
contact_sheet:
key_frames:
artifact_link:
workflow_run_link:
```

A green workflow alone is insufficient. Download/extract artifact, read `evidence.json`, inspect key PNGs and show useful screenshots to the user.

## Temporary CI cleanup

```text
temporary_pr_closed_without_merge: yes / no
ci_branch_cleanup: deleted / pending with exact names
ci_cleanup_limitation:
feature_branch_modified_by_ci_harness: no
```

Do not transfer temporary workflow/tests into product branches without separate user instruction.

## Preview transfer

```text
preview_transfer_approval: approved / not approved
approved_feature_commit:
preview_commit:
transfer_method:
preview_touched: no / explicit approved transfer
main_touched: no / explicit approved change
```

Visual success does not grant transfer permission. Transfer requires separate explicit user GO for exact accepted commit.

## Feature branch cleanup

```text
branch_cleanup_status: open / deleted / kept by user request
branch_cleanup_reason:
```

## Risks and limitations

Known technical, behavioral, performance, visual, deployment-identity and cleanup limitations.

## Result package for research/proposal workers

One option:

- complete files with repository-relative paths;
- applicable patch;
- research-only report;
- exact commit in explicitly assigned isolated experiment branch.

Workers do not update preview and do not create an independent Codex or visual-delivery route.

## Alternative approaches

Alternatives considered and why not selected.

## Open questions

Unresolved questions for designated Web Chat or human user.
```
