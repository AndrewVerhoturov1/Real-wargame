---
name: real-wargame-manual-vercel-deploy
description: Use when the user explicitly asks to deploy a Real-Wargame branch, create a Vercel Preview, redeploy a failed Preview, or verify the result of a manual deployment.
license: MIT
---

# Real-Wargame Manual Vercel Deploy

## Core rule

Git-triggered deployments are disabled by `vercel.json`. Deploy only after an explicit request such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`.

Canonical policy:

```text
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

## Required identity

Resolve and record before deployment:

```text
repository: AndrewVerhoturov1/Real-wargame
branch: exact requested branch
source_sha: exact current remote HEAD
checks_run: commands that actually passed
```

Never deploy an assumed branch, stale SHA or uncommitted workspace.

## Check matrix

Inspect `package.json` before choosing commands. Do not assume `npm run build` is only a production compilation; it may contain broad or historical smoke tests.

Use the smallest sufficient non-browser matrix:

```text
npx tsc --noEmit
+ focused smoke tests for every changed subsystem
+ integration smoke when multiple feature branches were combined
+ npx vite build
+ npm run deployment-pages:smoke
```

For an integration branch, use the union of the focused checks from all merged features. Do not run GitHub Actions, Playwright or Chromium without separate approval.

## Deployment routes

Use the first authenticated route that proves the exact branch and SHA:

1. connected Vercel tool for the existing permanent project;
2. branch-specific Deploy Hook stored outside the repository;
3. authenticated Vercel CLI from an exact checkout with `vercel deploy --yes`.

Never create a separate Vercel project for a branch.

## Exact-source bootstrap

When the connected Vercel tool can deploy files but the current environment has no exact checkout, use ephemeral copies of:

```text
templates/exact-source-package.json
templates/exact-source-deploy-build.mjs
templates/exact-source-vercel.json
```

Before sending the three files to the existing Vercel project:

1. replace `__EXACT_BRANCH__` and `__EXACT_SOURCE_SHA__` in the deployment copy;
2. fill `focusedChecks` with argument arrays for the selected smoke tests;
3. keep generated values ephemeral; do not commit a branch-specific copy;
4. require the build log to show `Verified deployment source: <branch> @ <sha>` before accepting any checks;
5. require `deployment-source.json` in the produced output.

The bootstrap must exit before `npm ci` when the cloned HEAD differs from `source_sha`.

## Failed build classification

Classify every failure before changing code:

- **code failure** — TypeScript, a current focused test or the production build proves a product defect. Fix only the authorized branch, rerun checks and redeploy its new HEAD.
- **environment failure** — clone, authentication, package installation or Vercel infrastructure failed. Repair the deployment route without changing product code.
- **stale test contract** — a smoke test checks an obsolete file owner or removed architecture while current focused contracts pass. Fix the test contract or stop and report it.

Do not silently remove a failing check. A reduced matrix requires explicit user approval and must be reported under `not_checked`; never present it as a fully green build.

## Required verification

After deployment:

1. inspect build logs and exact-source identity;
2. wait for `READY`;
3. verify `/` and `/ai-node-editor.html`;
4. when protection is enabled, create one temporary share link and reuse its token for both paths;
5. report branch, SHA, deployment ID, checks actually run and anything not checked.

## Hard boundaries

- Never enable automatic Git deployments.
- Never create dummy commits to trigger Vercel.
- Never deploy `main` without separate explicit approval.
- Transfer to `real-wargame-preview` and deployment of that branch are separate permissions.
- Never commit tokens, hook URLs, share tokens or bypass secrets.
- A later product or process change requires a new explicit deployment request.
