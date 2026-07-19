# Vercel Workflow Simplification Design

## Goal

Simplify feature delivery around the permanent GitHub-connected Vercel project, make both application entry pages mandatory, and make all user-facing reports easy to use.

## Canonical route

```text
user task
→ create feature branch from exact real-wargame-preview head
→ implement and run focused checks
→ push feature branch
→ Vercel automatically creates or updates the branch Preview
→ report direct links for the game and AI Node Editor
→ user performs live testing
→ fix defects on the same feature branch
→ explicit user GO for the exact accepted commit
→ transfer into real-wargame-preview
→ wait for the preview deployment and verify both pages
→ clean up the temporary feature branch
```

Codex is not a required deployment step. It may still be used for coding or analysis when the user explicitly chooses it.

## Required deployment pages

Every build, Preview deployment and production deployment must include:

- `/` from `index.html`;
- `/ai-node-editor.html` from `ai-node-editor.html`.

Vite must use both files as explicit build inputs. The production build must fail if either output page is missing.

## Vercel project policy

Use one permanent Vercel project connected to `AndrewVerhoturov1/Real-wargame`.

- Do not create a separate Vercel project for each feature branch.
- Do not delete the permanent Git-connected project during normal delivery.
- Non-production branches create Preview deployments inside the permanent project.
- After transfer into `real-wargame-preview`, verify the new Preview deployment and both required pages before cleanup.
- Delete the feature branch after successful transfer unless the user asks to keep it.
- If an old separate temporary Vercel project exists, delete it only after the replacement `real-wargame-preview` deployment is Ready and both required pages have been checked.
- Old branch deployments may be removed manually or by a Vercel deployment-retention policy; deleting the permanent project is forbidden.

## Communication style

All communication with the user must be in simple Russian, at the level used with an intelligent high-school student.

- Prefer ordinary Russian words.
- Avoid unnecessary English terms and abbreviations.
- When a technical English term is unavoidable, explain it once in simple Russian.
- Put the practical result first.
- Do not make the user operate Git or a terminal when the agent can do it.

## User-facing report

Every live-test or completion report starts with a compact block:

```text
Статус
Что изменилось
Ссылка на игру
Ссылка на AI Node Editor
Ветка
Коммит
Что проверить
```

Links must be clickable. When screenshots exist, show the most useful screenshots directly and provide the full artifact link separately. Long hashes, workflow identifiers and diagnostics belong after the practical summary, not before it.

## Verification

The change is complete when:

1. `npm run build` produces `dist/index.html` and `dist/ai-node-editor.html`;
2. a focused deployment-page smoke verifies both files;
3. repository workflow documents no longer require Codex deployment;
4. machine-readable repository context records automatic Vercel deployment and both required pages;
5. user-facing reporting rules require direct links and convenient screenshot presentation;
6. cleanup rules distinguish the permanent Vercel project from legacy temporary projects.
