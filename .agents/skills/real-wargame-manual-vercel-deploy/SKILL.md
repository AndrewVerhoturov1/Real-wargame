---
name: real-wargame-manual-vercel-deploy
description: Use when the user explicitly asks to deploy a Real-Wargame branch, create a Vercel Preview, redeploy a failed Preview, or verify the result of a manual deployment.
license: MIT
---

# Real-Wargame Manual Vercel Deploy

## Overview

Git-triggered deployments are disabled by `vercel.json`. A commit or push only saves code; it must not create a Vercel deployment.

Deploy only after an explicit user request such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`.

Canonical reference:

```text
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

## Required identity

Before deployment, resolve and record:

```text
repository: AndrewVerhoturov1/Real-wargame
branch: exact requested branch
source_sha: exact current remote HEAD
checks_run: commands that actually passed
```

Do not deploy an assumed branch, a stale commit or an uncommitted workspace.

## Deployment route

Use the first authenticated route that can prove it deploys the exact branch and commit:

1. connected Vercel deployment tool for the exact current project/workspace;
2. a branch-specific Vercel Deploy Hook stored outside the repository;
3. authenticated Vercel CLI from a checkout of the exact branch:

```bash
vercel deploy --yes
```

If exact source identity cannot be proven, stop and report `deployment source identity unproven`.

## After starting deployment

1. Inspect deployment status and build logs.
2. On build failure, fix code only on the same authorized branch, rerun focused checks and redeploy the corrected HEAD as part of the same deployment task.
3. Wait for `READY` before reporting success.
4. Verify both required pages:

```text
/                     → game
/ai-node-editor.html  → AI Node Editor
```

5. If Vercel protection is enabled, create a temporary share link through the connected Vercel tool. Never expose or commit protection secrets.
6. Report branch, deployed commit, deployment status and both clickable URLs.

## Hard boundaries

- Never enable Git automatic deployments to work around this policy.
- Never create an empty or dummy commit merely to trigger Vercel.
- Never deploy on every intermediate push.
- Never deploy `main` without separate explicit user approval.
- Transfer to `real-wargame-preview` and deployment of that branch are separate permissions unless the user explicitly requests both.
- Never create a separate Vercel project for each branch.
- Never commit Deploy Hook URLs, access tokens, share tokens or bypass secrets.
- Do not run Playwright, Chromium or GitHub Actions unless separately authorized.

## Authorization scope

One explicit deployment request authorizes deployment of the exact current HEAD and necessary retries caused by build failures for that same task. A later product change requires a new explicit deployment request.
