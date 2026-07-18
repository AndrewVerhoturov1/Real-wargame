# External Chat Required Rules

This file is a mandatory GitHub-facing contract for any external GitHub-aware Web Chat working on `AndrewVerhoturov1/Real-wargame`.

## Before work

1. Read `AGENTS.md` in full.
2. Read `docs/ai/WEB_CHAT_START.md`.
3. Read `docs/ai/repo-context.json`.
4. Read `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`.
5. Read `docs/ai/SKILLS_INDEX.md` and only the skills relevant to the task.
6. Read the active subproject status and the navigation documents referenced by `AGENTS.md`.

## Canonical feature branch

7. Resolve the exact current remote head of `real-wargame-preview`.
8. Create one temporary branch from that exact commit:

```text
feature/YYYYMMDD-short-kebab-slug
```

9. Record both `base_commit` and the feature branch name before implementation.
10. Perform all implementation, commits, pushes and live-test revisions on that feature branch.
11. Do not implement directly on `real-wargame-preview`.
12. Do not create a new branch for every defect found during live testing.

## Web Chat ownership

13. Web Chat owns the code, tests, commits, pushes, focused checks, manual checklist, later fixes, optional visual verification and final transfer after explicit user GO.
14. Do not delegate implementation or regression fixing to Codex.
15. Do not ask the user to manage Git or terminal commands when the Web Chat can do it.

## Focused non-browser checks

16. Before reporting the branch ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ docs checks when applicable
```

17. Do not run Chromium, Playwright, the complete integration matrix, performance workflows or Vercel deployment by default.
18. If the current environment cannot run Node commands, report that limitation honestly. A small non-browser GitHub Actions check is an optional fallback.
19. Never claim a check that did not run.

## Branch-ready report

Every branch-ready report includes:

```text
feature_branch:
base_branch: real-wargame-preview
base_commit:
current_commit:
changed_files:
checks_run:
not_checked:
manual_checks_needed:
visual_qa_prepared:
preview_touched: no
main_touched: no
```

## Codex deployment-only handoff

20. The user may give the already-pushed feature branch to Codex once.
21. Codex only exposes that branch as a branch-linked Vercel Preview and returns the branch URL, commit URL when available, tested commit and deployment status.
22. Codex must not modify code, create replacement commits, fix bugs, merge, transfer branches or touch `real-wargame-preview` or `main`.
23. The Vercel Preview must remain associated with the feature branch so later pushes become testable without calling Codex again.
24. A detached one-off deployment that does not follow later branch pushes is not the canonical result.

## Human live testing and revision loop

25. The user performs live testing in the Vercel Preview.
26. When the user reports a defect, return to the same feature branch, reproduce it, add a focused regression test when practical, fix it, rerun focused non-browser checks, commit and push.
27. Report the new exact commit after every revision.
28. Keep the branch open until the user accepts the live result or stops the task.

## Visual GitHub Actions verification

29. For user-visible changes, prepare the relevant Playwright scenario and key screenshots.
30. Do not run the browser or screenshot workflow until the user explicitly requests it.
31. A valid visual result requires the exact feature commit, the real browser, fresh PNGs, matching artifact SHA, Playwright result and opened/inspected key frames.
32. Fix visual-test failures on the same feature branch.

Read:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## Transfer into preview

33. `real-wargame-preview` is the acceptance target, not the development branch.
34. Transfer only after the user gives explicit GO for the exact tested feature commit.
35. Before transfer, update the feature branch from current preview when necessary, resolve conflicts there and rerun focused checks required by the final diff.
36. Web Chat performs the transfer and reports the resulting preview commit.
37. A Pull Request may be used only when the user explicitly asks for PR review/transfer or repository protection requires it.
38. After successful transfer, close or delete the feature branch unless the user explicitly asks to keep it.

## Main branch

39. `main` is forbidden without separate explicit user GO.
40. If a task targets `main`, verify `MAIN_GO_APPROVED_BY_USER: yes` is documented.
41. Do not merge without explicit human permission.
42. Do not enable auto-merge.

## Required final report

Every task report includes:

- **feature_branch**;
- **base_commit**;
- **current_commit**;
- **delivery_state**;
- **changed_files**;
- **checks_run**;
- **not_checked**;
- **manual_checks_needed**;
- **vercel_preview**;
- **live_test_status**;
- **visual_qa_prepared / approval / run**;
- **preview_transfer_approval**;
- **preview_touched**;
- **main_touched**;
- **branch_cleanup_status**;
- **risks**.

## Prohibited legacy routes

- No direct implementation push to `real-wargame-preview`.
- No PR-first feature development.
- No Codex implementation, commits, bug fixing, merge or branch transfer.
- No automatic visual workflow on every push.
- No new branch for every live-test defect.
- No transfer to preview before explicit user GO.
- No secrets, `.env`, tokens or private data in files, commits, PR descriptions or comments.
- No scope creep unrelated to the task.
