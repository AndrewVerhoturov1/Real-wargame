## Optional transfer context

This Pull Request template is used only when the user explicitly requests PR review/transfer into `real-wargame-preview` or repository protection requires a PR.

A PR is not the default feature-development route.

- **Base branch:** `real-wargame-preview`
- **Canonical feature branch:**
- **Base commit:**
- **Current tested feature commit:**
- **Why a PR is being used:** explicit user request / repository protection / other approved reason
- **Preview transfer approved by user:** yes / no

If targeting `main` despite the normal policy:

- `MAIN_GO_APPROVED_BY_USER`: yes / no
- Why preview is not the target:

## Summary

- What changed:
- Why:
- Explicitly out of scope:

## Canonical workflow evidence

- Feature branch was created from the recorded current preview head: yes / no
- Direct implementation on `real-wargame-preview` was avoided: yes / no
- All live-test fixes stayed on the same feature branch: yes / no
- Codex was used only for branch-linked Vercel Preview: yes / no / not used
- Exact user-approved feature commit:

## Risk classification

```text
CHANGE_RISK: docs | ci-policy | core | ai | navigation | terrain | combat | tactical-order | ui | cross-cutting
TESTED_IMPLEMENTATION_HEAD: none
PERFORMANCE_REASON: none
```

`TESTED_IMPLEMENTATION_HEAD` may reference earlier heavy evidence only when the final diff and evidence tail remain valid. Do not replace `none` with a SHA unless successful evidence for that implementation is linked below.

## Changed files

- `path`

## Focused non-browser checks actually run

```text
npx tsc --noEmit: passed / failed / not run
focused smoke: passed / failed / not run
npm run build: passed / failed / not run
docs checks: passed / failed / not applicable
```

List only checks that actually ran.

## Vercel Preview and human live test

```text
vercel_branch_preview:
vercel_commit_preview:
deployed_commit:
deployment_status:
live_test_status: pending / passed / failed / not run
live_tested_commit:
reported_issues:
```

Codex must not have modified code, created replacement commits, fixed bugs, merged or transferred branches.

## Manual live-test checklist

- What the user opened:
- Steps:
- Expected result:

## Visual GitHub Actions verification

```text
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_run: passed / failed / not run / not applicable
tested_sha:
workflow_run:
artifact_sha_match:
screenshots_inspected:
```

The browser workflow must remain manual-only. A green workflow is not sufficient without exact-SHA matching and inspected key PNGs.

## Performance impact

For runtime-affecting changes, include the required fields from `docs/orchestration/RESULT_TEMPLATE.md`.

```text
performance reason:
tested implementation head:
remaining performance risks:
```

## Risks and not checked

- Risks:
- Not checked:

## Transfer gate

- [ ] The user explicitly approved transfer into `real-wargame-preview`.
- [ ] Approval refers to the exact tested feature commit.
- [ ] The feature branch was updated from current preview when necessary.
- [ ] Conflicts were resolved on the feature branch.
- [ ] Focused checks required by the final diff passed.
- [ ] Auto-merge is disabled.
- [ ] The PR will not be merged without explicit human GO.

## Safety

- [ ] `main` was not changed without separate explicit GO.
- [ ] No workflow commits generated files back into the active branch.
- [ ] No secrets, `.env`, keys or private data were added.
- [ ] Reported checks, live testing and visual inspection actually happened.
