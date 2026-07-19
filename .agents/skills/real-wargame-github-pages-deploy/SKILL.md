---
name: real-wargame-github-pages-deploy
description: Use when the user explicitly asks to deploy, redeploy, publish, or update a Real-Wargame branch on GitHub Pages.
license: MIT
---

# Real-Wargame GitHub Pages Deploy

## Authorization

Run this workflow only after an explicit request such as `задеплой на GitHub Pages`, `задеплой на пайдж`, `обнови деплой на пайдж` or `опубликуй эту ветку на Pages`.

A commit, push, implementation request, transfer or merge does not imply Pages deployment permission.

## Required source identity

Before deployment, resolve and record:

```text
repository: AndrewVerhoturov1/Real-wargame
branch: exact requested feature branch
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

The production build must use the repository base path `/Real-wargame/` and must contain both entry pages:

```text
dist/index.html
dist/ai-node-editor.html
```

## Publication route

1. Build the exact feature-branch HEAD.
2. Publish the complete `dist` directory to the `gh-pages` branch.
3. Confirm the system workflow `pages build and deployment` completes successfully for the resulting `gh-pages` commit.
4. Do not modify `main` or `real-wargame-preview` unless separately authorized.
5. Do not use Vercel for a GitHub Pages deployment request.

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

A green build is not visual proof. State separately whether each page was only fetched or interactively verified.
