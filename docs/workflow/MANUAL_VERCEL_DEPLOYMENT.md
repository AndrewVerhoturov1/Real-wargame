# Manual Vercel Deployment Workflow

This is the canonical deployment policy for `AndrewVerhoturov1/Real-wargame`.

## 1. Core rule

Git-triggered Vercel deployments are disabled through:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

Therefore:

- commits and pushes do not deploy;
- intermediate development commits remain deployment-free;
- a deployment starts only after explicit user intent;
- the permanent Git-connected Vercel project remains the only normal project.

Phrases that authorize deployment include:

```text
деплой
задеплой
создай Preview
обнови Preview
задеплой эту ветку
```

A request to implement, commit, push, transfer or merge does not authorize deployment unless deployment is also stated.

## 2. Mandatory skill

For every manual deployment request, read and use:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
```

Visual verification is separate and may additionally require:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

## 3. Required source identity

Before deploying, resolve:

```text
repository: AndrewVerhoturov1/Real-wargame
branch: exact requested branch
source_sha: exact remote HEAD
base_branch: when relevant
checks_run: only checks that actually ran
```

Do not deploy when the branch or source SHA is guessed, stale or uncommitted.

## 4. Pre-deployment checks

Inspect the current `package.json` scripts before selecting commands. `npm run build` may contain TypeScript, broad historical smoke tests and the Vite build; do not treat its name as proof of what it runs.

Use the smallest sufficient non-browser matrix:

```text
npx tsc --noEmit
+ focused smoke tests for every changed subsystem
+ an integration smoke when multiple feature branches were combined
+ npx vite build
+ npm run deployment-pages:smoke
```

For an integration branch, use the union of the focused checks that protected all merged branches. Add a current integration contract such as `workspace:smoke` when the merged work changes shared workspace ownership.

Do not run GitHub Actions, Chromium, Playwright or broad performance matrices without separate authorization.

If the environment cannot run checks before deployment, report that limitation. Do not describe the branch as locally green.

## 5. Supported manual deployment routes

Use the first authenticated route that can prove the exact source.

### Connected Vercel project with an exact checkout

Use the connected deployment action directly only when its current workspace is proven to represent the requested branch and SHA.

### Exact-source bootstrap for the connected Vercel project

When the connected Vercel action accepts deployment files but no exact local checkout is available, create ephemeral copies of:

```text
.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-package.json
.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-deploy-build.mjs
.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-vercel.json
```

In the ephemeral deployment copy:

1. replace `__EXACT_BRANCH__` with the authorized branch;
2. replace `__EXACT_SOURCE_SHA__` with its freshly resolved 40-character remote HEAD;
3. populate `focusedChecks` with command/argument arrays for the selected matrix;
4. send only these three bootstrap files to the existing permanent Vercel project;
5. require the build to clone the branch and compare `git rev-parse HEAD` to `source_sha` before `npm ci`;
6. require the log line `Verified deployment source: <branch> @ <sha>`;
7. preserve `deployment-source.json` in the published output.

Generated bootstrap files containing a branch or SHA are temporary deployment inputs. Do not commit them. The reusable placeholder templates are safe to keep in the repository.

### Branch-specific Deploy Hook

A Deploy Hook may be used only when it is already configured for the exact branch. The hook URL is a secret and stays outside the repository, commits, logs and user-facing reports.

### Authenticated Vercel CLI

From a checkout of the exact requested branch:

```bash
vercel deploy --yes
```

Never use `--prod` unless the user separately authorizes production.

If no route proves exact source identity, stop with:

```text
deployment source identity unproven
```

## 6. Failed build loop

Classify every failure before changing code.

### Code failure

TypeScript, a current focused test or the production compilation proves a product defect. Fix only the authorized branch, rerun the matrix and deploy the corrected HEAD. The original deployment request authorizes necessary retries for that same task.

### Environment failure

Cloning, authentication, dependency installation, Vercel infrastructure or the deployment transport failed. Repair the route and retry the same source. Do not change product code to hide an infrastructure problem.

### Stale test contract

A test checks an obsolete file owner, removed module or superseded architecture. Prove the current owner by reading both the failing test and the current implementation. Then fix the test contract on an authorized branch or stop and report the blocker.

Do not silently remove a failing check. A reduced matrix requires explicit user approval. When approved, report the omitted command and reason under `not_checked`; do not call the result a fully green build.

Never restore automatic deployment or create a dummy commit.

## 7. Required deployment verification

A successful deployment must reach `READY` and expose:

```text
/                     → game
/ai-node-editor.html  → AI Node Editor
```

The build log must prove the branch and SHA. `deployment-source.json` should contain the same identity and the commands that actually ran.

If Vercel protection is active, create a temporary share link. Reuse the same share token for `/` and `/ai-node-editor.html` instead of creating unrelated links.

If exact identity cannot be proven, state:

```text
product_sha_match: unproven
```

## 8. User-facing result

Report:

```text
Статус:
Игра: <clickable URL>
Редактор ИИ: <clickable URL>/ai-node-editor.html
Ветка:
Коммит:
Статус Vercel:
Что проверить:
```

Technical fields may follow:

```text
deployment_id:
deployed_branch:
deployed_commit:
product_sha_match:
checks_run:
not_checked:
```

## 9. Authorization boundaries

One explicit deployment request authorizes:

- one deployment of the exact current HEAD;
- necessary retries after a code or environment failure for that same task.

A later product or process change requires a new explicit deployment request.

Transfer into `real-wargame-preview` and deployment of that branch are separate permissions unless both are explicitly requested.

`main` always requires separate explicit approval.

## 10. Prohibited routes

Never:

- enable automatic Git deployments as a shortcut;
- deploy on every push;
- create dummy commits for deployment;
- create a separate Vercel project per feature branch;
- delete the permanent Git-connected Vercel project;
- commit Vercel tokens, Deploy Hook URLs, share tokens or bypass secrets;
- claim deployment success before `READY`;
- claim exact-SHA deployment when identity is unproven;
- bypass a failing check without the required explicit approval.
