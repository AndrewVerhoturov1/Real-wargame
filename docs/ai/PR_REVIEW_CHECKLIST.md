# Pull Request and Delivery Review Checklist

Use this checklist for a fallback PR, an explicitly isolated feature branch or final review before preview transfer. A PR is not mandatory when a bounded GitHub-aware executor can safely deliver directly to `real-wargame-preview`.

## Delivery route

- [ ] The report states `direct push`, `PR fallback`, `isolated branch only` or `not changed`.
- [ ] The target is `real-wargame-preview`, unless the user explicitly approved `main`.
- [ ] An isolated branch has not been transferred when the user said not to transfer yet.
- [ ] If a temporary branch was used, its cleanup state is documented.

## Scope

- [ ] The change solves one clear task.
- [ ] Changed files match the allowed scope.
- [ ] There is no unrelated formatting or cleanup.
- [ ] Architecture was not rewritten without approval.
- [ ] Files were not deleted without a clear reason.

## Safety

- [ ] No secrets, tokens, passwords, keys, `.env` or private data.
- [ ] `main` was not changed without `MAIN_GO_APPROVED_BY_USER: yes`.
- [ ] Auto-merge is not enabled.
- [ ] The author did not claim checks that did not run.

## Project compatibility

- [ ] PixiJS changes use current v8 APIs without active v7 compatibility aliases.
- [ ] English canonical code/data names and complete Russian human-facing text are present.
- [ ] Normal user workflow does not require source code, JSON or terminal commands.
- [ ] Core AI/simulation boundaries remain independent of PixiJS and DOM.

## Checks

- [ ] Exact checks are listed with passed/failed/not run status.
- [ ] Production build ran when source or package scripts changed.
- [ ] Focused smoke tests cover changed behavior.
- [ ] TDD RED evidence exists for new behavior when applicable.
- [ ] Documentation changes passed `docs:smoke` and `docs:check`.

## Visual work

- [ ] The real application ran in a real browser.
- [ ] Fresh PNGs were captured after the change.
- [ ] Artifact SHA matches the reported commit.
- [ ] Changed/key PNGs were opened and inspected.
- [ ] The report distinguishes GitHub Actions, local agent checkout and the user's PC.

## Fallback PR only

- [ ] PR base is `real-wargame-preview`.
- [ ] Head is a separate task branch, not `main`.
- [ ] PR body explains why direct preview delivery was not used or why isolation is useful.
- [ ] The PR is not self-merged.
- [ ] Temporary visual-QA PRs are closed after artifact inspection.

## Q-mode result

- [ ] Repository, branch and commit are reported.
- [ ] PR number/link is reported only when fallback PR was used.
- [ ] Changed files, checks, not checked, risks and human verification are listed.
- [ ] `transfer_path` and `main_touched` are explicit.

## X / r-init result

- [ ] Terminal-free launcher is present when required.
- [ ] Human checklist is understandable without technical preparation.
- [ ] Expected result is stated for each manual step.
- [ ] GO/NO-GO remains a human decision.

## Recommendation

Return one clear recommendation:

```text
Можно принимать.
Нужно доработать.
Нужна локальная проверка.
Нужно оставить в изолированной ветке.
Лучше отклонить.
Нужно разделить задачу.
```
