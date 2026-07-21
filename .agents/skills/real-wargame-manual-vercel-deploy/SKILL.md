---
name: real-wargame-manual-vercel-deploy
description: Use when the user explicitly asks to deploy a Real-Wargame branch, create or update a Vercel Preview, redeploy after an infrastructure failure, or inspect a manual deployment.
license: MIT
---

# Real-Wargame Manual Vercel Deploy

## Core rule

Git-triggered deployments remain disabled by `vercel.json`. Deploy only after an explicit request such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`.

Vercel is a publication stage, not a TDD or debugging environment. TypeScript errors, smoke failures and hanging Node processes must be found by the deployment verification gate before any deployment is created.

Canonical policy:

```text
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

## Required identity

Resolve and record before installation or deployment:

```text
repository: AndrewVerhoturov1/Real-wargame
ref: exact requested branch, tag or commit
source_sha: exact expected 40-character SHA
checks_run: commands that actually passed
skipped_checks: checks explicitly permitted to be skipped
```

Never deploy an assumed ref, stale SHA or uncommitted workspace.

## Normal routes

Use the first available route below.

### 1. Manual GitHub Actions workflow

The preferred route is the manual GitHub Actions workflow:

```text
.github/workflows/manual-vercel-preview.yml
```

It must be started through `workflow_dispatch` with the exact `ref` and `expected_sha`. It verifies the checked-out SHA before `npm ci`, runs the gate, builds once and publishes once with a pinned Vercel CLI.

### 2. Exact local checkout

An authenticated exact local checkout may run the same sequence:

```text
npm ci
npm run verify:preview -- --report <report-file>
npx vercel@56.4.1 pull --yes --environment=preview
verify permanent project repo
npx vercel@56.4.1 build
write deployment-source.json
npm run verify:deployment-pages -- --root .vercel/output/static --require-source
npx vercel@56.4.1 deploy --prebuilt --yes
```

The local checkout must prove its ref and SHA before installation.

Both normal routes must use the permanent project `repo`. Never create any additional Vercel project for a branch, retry, test, scheduler investigation, source check or other diagnostic purpose.

## Verification gate

The canonical gate is:

```text
npm run verify:preview -- --report <report-file>
```

It runs TypeScript and the Preview smoke matrix before Vercel publication. Every smoke scenario runs in a separate child Node process with a timeout and captured stdout/stderr.

Never silently reduce the gate. If the user explicitly permits skipped Preview smoke checks, provide a reason, preserve every skipped check in the report and describe the result as passed with skipped checks. Do not call it fully verified.

A code failure is fixed and retested before the next deployment. Vercel must not be used to discover the next product error.

## One SHA, one normal deployment

A normal successful request creates one deployment for one verified SHA.

A further deployment is allowed only after:

- the source SHA changed and the user explicitly requested publication of the new state;
- an infrastructure failure prevented the same verified output from being published or inspected;
- a new explicit deployment request was given.

Do not repeatedly publish the same source to diagnose code failures.

## Permanent project proof

GitHub Actions uses only these secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

After `vercel pull`, `.vercel/project.json` must match both secret IDs and project name `repo`. Do not print secret values. Do not commit `.vercel`, tokens, hook URLs, share tokens or bypass credentials.

## Emergency exact-source fallback

Use the bootstrap below only when both manual GitHub Actions and an exact local checkout are unavailable:

```text
templates/exact-source-package.json
templates/exact-source-deploy-build.mjs
templates/exact-source-vercel.json
```

Before sending the temporary bootstrap files to the permanent project `repo`:

1. replace `__EXACT_BRANCH__` and `__EXACT_SOURCE_SHA__` in an ephemeral copy;
2. keep the generated copy outside Git history;
3. require the clone and `git rev-parse HEAD` comparison to finish before `npm ci`;
4. run only the canonical Preview gate and production build, not an accumulated historical matrix;
5. require `deployment-source.json` in the output;
6. inspect the build log for `Verified deployment source: <branch> @ <sha>`.

The fallback necessarily starts a Vercel build before it can test the cloned source, so it is an emergency route rather than the normal loop. It must never target a temporary project.

## Failure classification

- **code failure** — TypeScript, a current smoke scenario or production compilation proves a product defect. Fix the authorized branch and rerun checks before another deployment request.
- **infrastructure failure** — checkout transport, authentication, package installation, Vercel CLI or Vercel infrastructure failed. Repair the route and retry the same verified SHA without product changes.
- **stale test contract** — a smoke checks an obsolete owner or removed architecture. Compare the test with the current implementation owner and update the contract separately; never delete it merely to make the gate green.

## Required verification after publication

Success requires:

1. Vercel status `READY`;
2. `/` responds successfully;
3. `/ai-node-editor.html` responds successfully;
4. `/deployment-source.json` contains the exact ref, SHA, executed checks and skipped checks;
5. the workflow summary contains the deployment ID and Preview URL.

## Hard boundaries

- Never enable deployment on every push.
- Never create dummy commits to trigger Vercel.
- Never deploy `main` without separate explicit approval.
- Transfer to `real-wargame-preview` and deployment remain separate permissions.
- Never create another Vercel project for tests or diagnostics.
- Never delete the permanent project `repo`.
- Never commit or print secrets.
