# External GitHub-Aware Web Chat Workflow

The binding short contract is `AGENTS.md`. Start with `docs/ai/WEB_CHAT_START.md` and the active generated `STATUS.md`.

## Before work

1. Read the minimal route, not the whole repository.
2. Resolve the exact active subproject from `docs/subprojects/index.json`.
3. Read the relevant project skill.
4. Confirm the allowed scope and checks.
5. Inspect the exact branch/ref instead of assuming GitHub code search is complete.

## Delivery selection

### Preferred: direct preview delivery

Use when the task is bounded, write access exists and no explicit isolation was requested:

```text
commit/push directly to real-wargame-preview
```

### Fallback: Pull Request into preview

Use when direct push is unavailable, conflicts exist, review isolation is important or CI must run on a task branch:

```text
temporary branch
→ PR into real-wargame-preview
```

After the result reaches preview, close the temporary PR/branch unless a documented reason requires it to remain open.

### Explicit isolated branch

When the user says not to transfer yet:

```text
keep commits on the requested feature branch
```

Do not merge or retarget it. Report `transfer_path: isolated branch only`.

## Implementation discipline

- Change only the requested scope.
- Follow project-local skills before generic framework guidance.
- Real-Wargame uses PixiJS 7.
- Use TDD for behavior changes.
- Update canonical JSON and regenerate status pages for current-state documentation changes.
- Do not make unrelated cleanup changes.

## Verification honesty

Use exact wording:

```text
GitHub Actions browser verification completed.
```

or:

```text
Local agent checkout verification completed with ...
```

or:

```text
Local verification was not available.
```

Do not call GitHub Actions a run on the user's PC.

Do not call visual work successful until fresh PNGs from the same commit are inspected.

## Required report

```text
repository: AndrewVerhoturov1/Real-wargame
branch: ...
commit/pr: ...
transfer_path: direct push / PR fallback / isolated branch only / not changed
changed_files: ...
checks_run: ...
not_checked: ...
manual_checks_needed: ...
risks: ...
main_touched: no / explicit approved change
```

## Prohibited

- Direct write or merge to `main` without `MAIN_GO_APPROVED_BY_USER: yes`.
- Auto-merge.
- Publishing secrets, `.env`, keys or private data.
- Claiming tests or visual inspection that did not happen.
- Deleting files or rewriting architecture outside the task.
- Returning only a text answer when the user requested repository implementation and write access is available.

R/Q/X details remain in `docs/ai/ZWORKER_MODES.md`.
