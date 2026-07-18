# Web Chat and Worker Result Template

Use this template for the canonical Web Chat feature branch and for optional research/proposal workers.

```md
# Result

## Task

Short task name and formulation.

## Status

`COMPLETED`, `PARTIAL`, `BLOCKED` or `RESEARCH_ONLY`.

## Delivery state

One value:

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

For research-only workers without a branch, use `feature_branch: owned by designated Web Chat` and do not invent commit identities.

## Understanding of the problem

How the problem was understood and what assumptions were made.

## Solution

What was implemented or proposed.

## Architecture

Why this approach was selected and how it fits existing systems.

## Performance impact

This section is mandatory for every runtime-affecting change. For a truly non-runtime task, use `not applicable` with the exact reason.

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

Do not replace analysis with “the change is small and should not affect performance”. Do not run performance checks only because the SHA changed.

## Verification selection

```text
change risk:
mandatory non-browser checks:
risk-selected focused checks:
manual live checks:
visual GitHub Actions check:
heavy checks deliberately not run:
why omitted heavy checks cannot detect a regression from this change:
TESTED_IMPLEMENTATION_HEAD: <40-char SHA or none>
PERFORMANCE_REASON: <concrete reason or none>
```

## Changed files

- `path/to/file`

## Checks actually run

- `<command>` — passed/failed;
- list only commands that actually ran.

## Not checked

State what was not checked and why. Distinguish:

- Web Chat workspace checks;
- GitHub Actions checks;
- Vercel deployment;
- human live testing.

## Manual live-test checklist

For user-visible work, list task-specific steps the human should try in the branch-linked Vercel Preview and the expected result for each step.

For non-visual work, state `not applicable` or the exact manual behavior still worth checking.

## Vercel Preview

```text
vercel_branch_preview: URL / pending / not requested
vercel_commit_preview: URL / unavailable / pending / not requested
deployment_status: ready / failed / pending / not requested
deployed_commit:
```

Codex is deployment-only. Do not report Codex implementation, commits, fixes, merge or transfer because those actions are outside the canonical role.

## Human live-test status

```text
live_test_status: pending / passed / failed / not run
live_tested_commit:
reported_issues:
```

When issues are reported, fix them on the same feature branch and return a new exact `current_commit`.

## Visual QA

```text
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_run: passed / failed / not run / not applicable
tested_sha:
workflow_run:
playwright_result:
artifact_sha_match:
screenshots_inspected:
key_frames:
```

A green workflow alone is not a completed visual claim.

## Preview transfer

```text
preview_transfer_approval: approved / not approved
approved_feature_commit:
preview_commit:
transfer_method:
preview_touched: no / explicit approved transfer
main_touched: no / explicit approved change
```

Do not transfer into `real-wargame-preview` before explicit user GO for the exact tested commit.

## Branch cleanup

```text
branch_cleanup_status: open / deleted / kept by user request
branch_cleanup_reason:
```

## Risks

Known technical, behavioral, performance, visual and integration risks.

## Result package for research/proposal workers

One option:

- complete files with repository-relative paths;
- applicable patch;
- research-only report;
- exact commit in an explicitly assigned isolated experiment branch.

Workers do not update `real-wargame-preview` and do not create an independent Codex or PR delivery route.

## Alternative approaches

What alternatives were considered and why they were not selected.

## Open questions

Unresolved questions for the designated Web Chat or human user.
```
