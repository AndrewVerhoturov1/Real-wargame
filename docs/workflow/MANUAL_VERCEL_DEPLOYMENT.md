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
- intermediate development commits must remain deployment-free;
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

A request to implement, commit, push, transfer or merge does not automatically authorize deployment unless deployment is also stated.

## 2. Mandatory skill

For every manual deployment request, read and use:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
```

Visual verification after deployment is a separate operation and may additionally require:

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

Run the smallest sufficient non-browser matrix for the changed subsystem:

```text
TypeScript check
+ focused smoke tests
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

Do not run GitHub Actions, Chromium, Playwright or broad performance matrices without separate authorization.

If the environment cannot run the checks, report that limitation before deployment. Do not describe an unverified branch as locally green.

## 5. Supported manual deployment routes

Use the first available authenticated route that can deploy the exact source:

### Connected Vercel tool

Use the connected manual deployment action only when the current project/workspace is proven to represent the requested branch and SHA.

### Branch-specific Deploy Hook

A Deploy Hook may be used when it is already configured for the exact branch. The hook URL is a secret and must stay outside the repository, commits, logs and user-facing reports.

### Authenticated Vercel CLI

From a checkout of the exact requested branch:

```bash
vercel deploy --yes
```

Never use `--prod` unless the user separately and explicitly authorizes a production deployment.

If no route can prove exact source identity, stop with:

```text
deployment source identity unproven
```

## 6. Failed build loop

When the manual deployment fails:

1. inspect Vercel build logs;
2. identify the exact failure;
3. fix only the authorized branch;
4. rerun focused checks;
5. commit and push the corrected branch;
6. manually deploy the corrected HEAD;
7. repeat only as necessary for the same deployment task.

Do not restore automatic deployment. Do not create an empty commit to trigger Vercel.

## 7. Required deployment verification

A successful deployment must reach `READY` and expose both pages:

```text
/                     → game
/ai-node-editor.html  → AI Node Editor
```

Inspect build logs when status is `ERROR`. If deployment protection is active, use the connected Vercel access/share mechanism without exposing tokens.

Verify the deployed branch and SHA when Vercel exposes that metadata. If exact identity cannot be proven, state:

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
- necessary redeployments after fixing build failures for that same task.

A later product change requires a new explicit deployment request.

Transfer into `real-wargame-preview` and deployment of `real-wargame-preview` are separate permissions unless the user explicitly requests both.

`main` always requires separate explicit approval.

## 10. Prohibited routes

Never:

- enable automatic Git deployments as a shortcut;
- deploy on every push;
- create dummy commits for deployment;
- create a separate Vercel project per feature branch;
- delete the permanent Git-connected Vercel project;
- commit Vercel tokens, Deploy Hook URLs, share tokens or bypass secrets;
- claim deployment success before status is `READY`;
- claim exact-SHA deployment when identity is unproven.
