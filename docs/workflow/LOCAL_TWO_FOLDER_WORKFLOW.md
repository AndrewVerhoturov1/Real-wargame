# Local Main and Preview Folders

This document describes the optional local two-folder setup. It is no longer the canonical feature-development or live-test route.

Canonical feature workflow:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## What the two folders mean

A local setup may contain:

- `Real-wargame` — local checkout of `main`;
- `Real-wargame-preview` — local checkout of `real-wargame-preview`.

The folders avoid repeatedly switching branches in one working directory.

## Current limitation of this setup

Unaccepted feature work no longer goes directly into `real-wargame-preview`. Therefore the local preview folder does not normally contain the current feature under live testing.

The canonical unfinished-feature test uses:

```text
feature branch
→ branch-linked Vercel Preview
→ human live test
```

The local `Real-wargame-preview` folder shows only the accepted preview integration state after explicit user GO and transfer.

## Optional use of the local preview folder

Use the local preview folder when the user explicitly wants to:

- run the accepted `real-wargame-preview` state locally;
- compare Vercel Preview behavior with the integrated preview branch;
- diagnose environment-specific behavior after transfer;
- prepare a later release from preview to `main`.

It is not required for the normal unfinished-feature cycle.

## Updating the local preview folder

After an explicitly approved transfer into `real-wargame-preview`, update the local folder with the repository-provided scripts or an equivalent safe Git synchronization route.

Typical project scripts:

```text
scripts/windows/setup-preview-folder.bat
scripts/windows/update-preview.bat
scripts/windows/run-preview.bat
```

Do not claim the user's PC was synchronized or tested unless that actually happened.

## Feature work ownership

For new work:

1. Web Chat creates `feature/YYYYMMDD-short-kebab-slug` from the exact current preview head.
2. Web Chat implements and pushes that feature branch.
3. Codex only exposes it as a branch-linked Vercel Preview.
4. The user tests the live Vercel deployment.
5. Web Chat fixes issues on the same feature branch.
6. After explicit user GO, Web Chat transfers the accepted exact commit into `real-wargame-preview`.
7. Only then may the local `Real-wargame-preview` folder be updated to show the accepted state.

## Main branch

`main` is the stable branch and remains outside the normal feature loop. No agent, Codex or local script may change or merge to `main` without separate explicit user GO.

## Temporary feature branch cleanup

After successful transfer into `real-wargame-preview`, close or delete the temporary feature branch unless the user explicitly asks to keep it.

If it remains open, the report must include:

```text
branch_cleanup_status: kept by user request
branch_cleanup_reason: ...
```
