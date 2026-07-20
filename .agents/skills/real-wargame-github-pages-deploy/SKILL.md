---
name: real-wargame-github-pages-deploy
description: Use for Real-Wargame GitHub Pages publishing and after every verified product fix on the active tactical-position feature branch.
license: MIT
---

# Real-Wargame GitHub Pages Deploy

## Standing authorization

The user gave standing authorization on 2026-07-20 to update GitHub Pages after every successfully verified product change on:

```text
feature/20260719-tactical-position-system
```

For that branch:

- do not ask again after each fix;
- after focused checks pass, update GitHub Pages in the same task;
- deployment failure keeps the task incomplete until fixed or clearly reported;
- an explicit user instruction such as `не деплой`, `не обновляй Pages` or `остановись перед деплоем` overrides the standing authorization for that task.

Other branches still require an explicit Pages deployment request unless a newer repository instruction grants standing authorization.

## Required source identity

Before deployment, resolve and record:

```text
repository: AndrewVerhoturov1/Real-wargame
branch: exact feature branch
source_sha: exact current remote HEAD
```

Never publish an assumed branch or stale commit.

## Required pre-deployment checks

The Pages workflow must run at least:

```text
npx tsc
npm run tactical-position:smoke
npm run tactical-query:smoke
npm run editor:smoke
npm run workspace:smoke
npm run deployment-pages:smoke
```

The production build must use the repository base path `/Real-wargame/` and contain both entry pages:

```text
dist/index.html
dist/ai-node-editor.html
```

A failing command must stop publication. Do not use shell command groups where a later successful command can hide an earlier failure.

## Automatic feature-branch route

The canonical workflow is:

```text
.github/workflows/deploy-tactical-position-pages.yml
```

For `feature/20260719-tactical-position-system` it must:

1. run automatically after product-code or product-test changes;
2. skip documentation-only pushes;
3. publish only after every required check and the production build pass;
4. publish the complete `dist` directory to `gh-pages`;
5. preserve the exact source SHA in build metadata and the `gh-pages` commit message;
6. confirm the system workflow `pages build and deployment` completes successfully.

Do not modify `main` or `real-wargame-preview` unless separately authorized. Do not use Vercel for a GitHub Pages deployment.

## Mandatory live targets

Both pages are mandatory parts of one deployment:

```text
https://andrewverhoturov1.github.io/Real-wargame/
https://andrewverhoturov1.github.io/Real-wargame/ai-node-editor.html
```

The deployment is **failed** if either condition is true:

- the game page is unavailable or shows a bootstrap failure;
- the AI Node Editor page is unavailable, missing its application shell, or belongs to a different source SHA.

Never report Pages deployment success after checking only the game.

## Completion report

Report:

```text
source_branch
source_sha
workflow result
published gh-pages sha
game URL
AI Node Editor URL
checks that actually passed
```

A green build is not visual proof. State separately whether each page was fetched or interactively verified.