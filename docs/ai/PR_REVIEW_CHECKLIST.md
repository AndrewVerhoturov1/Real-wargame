# Feature Delivery and Optional Pull Request Review Checklist

Use this checklist before live-test publication, before optional visual GitHub Actions verification and before an explicitly approved transfer into `real-wargame-preview`.

A Pull Request is not the default development route. Use the PR-specific section only when the user explicitly requests PR review/transfer or repository protection requires it.

## Canonical branch identity

- [ ] `feature_branch` follows `feature/YYYYMMDD-short-kebab-slug`.
- [ ] The feature branch was created from the exact current `real-wargame-preview` head recorded as `base_commit`.
- [ ] `current_commit` is reported exactly.
- [ ] All implementation and live-test fixes remain on the same feature branch.
- [ ] `real-wargame-preview` was not used as the active implementation branch.
- [ ] `main` was not changed.

## Scope

- [ ] The change solves one clear task.
- [ ] Changed files match the intended scope.
- [ ] There is no unrelated formatting or cleanup.
- [ ] Architecture was not rewritten without a task-related reason.
- [ ] Files were not deleted without a clear reason.

## Safety

- [ ] No secrets, tokens, passwords, keys, `.env` or private data.
- [ ] `main` was not changed without `MAIN_GO_APPROVED_BY_USER: yes`.
- [ ] Auto-merge is not enabled.
- [ ] The author did not claim checks that did not run.
- [ ] Codex did not implement, commit, fix, merge or transfer the feature.

## Project compatibility

- [ ] PixiJS changes use current v8 APIs without active v7 compatibility aliases.
- [ ] English canonical code/data names and complete Russian human-facing text are present.
- [ ] Normal user workflow does not require source code, JSON or terminal commands.
- [ ] Core AI/simulation boundaries remain independent of PixiJS and DOM.
- [ ] Runtime-affecting changes satisfy the mandatory performance contract.

## Focused non-browser checks

- [ ] Exact commands are listed with passed/failed/not run status.
- [ ] `npx tsc --noEmit` ran when TypeScript source changed, or the limitation is reported.
- [ ] Focused smoke tests cover the changed behavior.
- [ ] One production build ran when source, package scripts or build configuration changed.
- [ ] Documentation changes passed the required docs checks.
- [ ] Broad matrices and performance workflows were omitted unless the diff gave a concrete reason to run them.

## Ready for human live testing

- [ ] Feature branch and exact commit were pushed.
- [ ] The readiness report lists changed files, checks, not checked items and risks.
- [ ] The manual live-test checklist is task-specific and understandable.
- [ ] Expected result is stated for each important manual step.
- [ ] `preview_touched: no` and `main_touched: no` are explicit.

## Codex deployment-only handoff

- [ ] Codex received the already-pushed feature branch and exact commit.
- [ ] Codex returned a branch-linked Vercel Preview URL.
- [ ] Codex returned deployment status and deployed commit.
- [ ] The deployment follows later pushes to the same feature branch.
- [ ] Codex did not modify code or create replacement commits.
- [ ] Codex did not merge or transfer branches.

## Human live test

- [ ] `live_test_status` is reported.
- [ ] `live_tested_commit` matches the branch commit the user opened.
- [ ] Reported defects were fixed on the same feature branch.
- [ ] Every revision reports a new exact commit.
- [ ] A new branch was not created for each defect.

## Visual work

Preparation:

- [ ] Relevant Playwright scenario exists or was updated.
- [ ] Key PNGs and the evidence each should prove are defined.
- [ ] Visual risks not covered by non-browser checks are reported.

When visual QA was explicitly requested:

- [ ] The exact feature commit was used.
- [ ] The real application ran in a real browser.
- [ ] Fresh PNGs were captured after the change.
- [ ] Artifact SHA matches the reported commit.
- [ ] Playwright result and logs are available.
- [ ] Changed/key PNGs were opened and inspected.
- [ ] Failures were corrected on the same feature branch.

## Explicit transfer gate

- [ ] The user explicitly approved transfer into `real-wargame-preview`.
- [ ] The approval refers to the exact accepted feature commit.
- [ ] The feature branch was updated from current preview when necessary.
- [ ] Conflicts were resolved on the feature branch.
- [ ] Focused checks required by the final diff passed.
- [ ] The resulting `preview_commit` is reported.
- [ ] The feature branch cleanup state is documented.

## Optional Pull Request only

Use this section only after explicit user request or when branch protection requires a PR.

- [ ] PR base is `real-wargame-preview`.
- [ ] PR head is the already-tested canonical feature branch.
- [ ] PR was not opened as the initial development route.
- [ ] PR body reports `base_commit`, `current_commit`, Vercel Preview and live-test status.
- [ ] PR body includes the user's explicit preview-transfer approval state.
- [ ] The PR is not self-merged without explicit user GO.
- [ ] Temporary QA-only PRs are closed after use.

## Recommendation

Return one clear recommendation:

```text
Готово к живому тесту.
Нужно доработать в той же feature-ветке.
Готово к визуальной проверке через GitHub Actions.
Визуальная проверка пройдена; ожидается GO на перенос.
Можно переносить exact commit в real-wargame-preview.
Нельзя переносить: нет явного GO пользователя.
Лучше отклонить.
Нужно разделить задачу.
```
