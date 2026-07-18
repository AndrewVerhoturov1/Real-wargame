# Web Chat Preview Workflow Design

## Goal

Make the repository use one canonical feature-delivery route:

```text
user task
→ Web Chat creates a temporary feature branch from current real-wargame-preview
→ Web Chat implements and runs focused non-browser checks
→ Web Chat pushes the branch and reports the exact commit plus a manual checklist
→ user gives the branch to Codex once
→ Codex only makes the branch available as a Vercel Preview and returns the URL
→ user performs live testing
→ Web Chat continues fixes on the same feature branch
→ optional visual GitHub Actions check runs only after explicit user approval
→ Web Chat transfers the tested result into real-wargame-preview only after explicit user GO
```

`main` remains outside normal feature work.

## Canonical role ownership

### Web Chat

Web Chat owns the feature branch, implementation, commits, pushes, focused non-browser verification, regression fixes, optional visual workflow invocation and final transfer into `real-wargame-preview` after explicit user approval.

### Codex

Codex has one bounded deployment role: expose the already-pushed feature branch through a Vercel Preview and return the branch and deployment URLs. Codex does not implement, commit, push fixes, merge, transfer branches or participate in later iterations.

### Human user

The user performs live testing, may request the optional visual GitHub Actions check, and gives the explicit GO for transfer into `real-wargame-preview`.

## Branch contract

- Every implementation task starts from the current `real-wargame-preview` head.
- The default task branch is `feature/YYYYMMDD-short-kebab-slug`.
- Direct implementation commits to `real-wargame-preview` are forbidden.
- Fixes after live testing stay on the same feature branch.
- `real-wargame-preview` is updated only after explicit user GO.
- `main` is not changed without a separate explicit user GO.
- Auto-merge is forbidden.

## Verification contract

Before publishing a feature branch, Web Chat runs the smallest sufficient non-browser matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ documentation checks when documentation or generated status changed
```

The default route must not require Vercel, Chromium, Playwright or a broad GitHub Actions matrix.

For user-visible work, Web Chat prepares the relevant visual scenario and reports what the human should inspect. Browser or screenshot verification runs only after explicit user approval.

## Delivery and reporting contract

A feature-ready report must include:

- feature branch;
- base branch and base commit;
- current commit;
- changed files;
- checks actually run;
- what was not checked;
- manual live-test checklist;
- visual QA preparation and execution state;
- confirmation that preview and main were not changed.

After manual feedback, Web Chat updates the same branch and reports the new commit. A new branch or renewed Codex participation is not required.

## Multi-chat compatibility

Parallel ordinary chats may still be used for research or competing implementation proposals, but they do not update `real-wargame-preview` and do not create independent delivery routes. One designated Web Chat owns the canonical feature branch, integrates selected results there and follows the same live-preview workflow.

## Legacy route removal

Repository guidance must no longer present any of these as a normal path:

- direct push to `real-wargame-preview`;
- PR-first development;
- Codex implementation or regression fixing;
- Codex-managed merge or transfer;
- automatic browser checks on every push;
- separate branches for each bug found during live testing.

PRs may remain available only as an optional technical transfer/review mechanism after explicit user instruction; they are not the default development path.
