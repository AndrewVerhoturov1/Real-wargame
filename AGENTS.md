# Real-Wargame Agent Contract

This is the canonical short contract for work in `AndrewVerhoturov1/Real-wargame`.

## 1. Project facts

```text
repository: AndrewVerhoturov1/Real-wargame
working branch: real-wargame-preview
stable branch: main
feature branch pattern: feature/YYYYMMDD-short-kebab-slug
canonical launcher: Run-Real-Wargame-Lab.bat
stack: Vite + TypeScript + PixiJS 8
```

This is not a Godot project.

Canonical sources:

```text
docs/ai/repo-context.json
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

## 2. Communication

Use simple Russian and put the practical result first.

- Avoid unnecessary English terms and abbreviations.
- Explain unavoidable technical terms once.
- Use clickable links.
- Show useful screenshots directly when available.
- Put hashes, IDs and raw diagnostics after the useful result.
- Do not make the user operate Git or a terminal when the agent can do it.

## 3. Minimal reading route

Read:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. active `STATUS.md`;
5. relevant skill from `docs/ai/SKILLS_INDEX.md`.

For runtime work also read:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
docs/architecture/ENGINE_MIGRATION_READINESS.md
```

For deployment always read:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
```

## 4. Canonical feature route

```text
user task
→ resolve exact current real-wargame-preview HEAD
→ create one feature branch from that commit
→ implement, test, commit and push on the feature branch
→ report code readiness without inventing a Preview
→ explicit user deployment request
→ manually deploy exact current HEAD
→ report game and AI Node Editor links
→ user live test
→ fix defects on the same feature branch
→ explicit user GO for accepted commit
→ transfer into real-wargame-preview
→ deploy preview only when separately requested or when transfer+deploy were explicitly requested together
```

A push never deploys. Transfer permission and deployment permission are separate.

## 5. Required pages

Every production build and deployment must contain:

```text
/                     → index.html
/ai-node-editor.html  → ai-node-editor.html
```

`npm run build` must fail if either page is missing.

## 6. Vercel policy

Git-triggered deployments are disabled by `vercel.json`.

Mandatory rules:

- commits and pushes do not create deployments;
- deploy only after explicit user intent such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`;
- use `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`;
- resolve exact branch and remote HEAD before deployment;
- use only an authenticated route that can prove exact source identity;
- inspect build logs and status;
- report success only after `READY`;
- report both required URLs;
- do not create a dummy commit to trigger Vercel;
- do not re-enable automatic deployment;
- do not create a separate Vercel project per branch;
- never delete the permanent Git-connected Vercel project;
- never commit tokens, Deploy Hook URLs or protected share URLs.

One explicit deployment request covers the exact current HEAD and necessary retries after build-failure fixes for that same task. Later product changes need a new request.

## 7. Branch policy

```text
base: real-wargame-preview
head: feature/YYYYMMDD-short-kebab-slug
```

- Do not implement directly on `real-wargame-preview`.
- Keep product fixes on the same feature branch.
- Do not transfer before explicit user GO.
- Do not touch or deploy `main` without separate explicit approval.
- Do not merge or enable auto-merge without explicit approval.
- PR is not the default feature route.

## 8. Focused verification

Before reporting readiness, run the smallest sufficient matrix:

```text
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

Run documentation checks when documentation changes.

GitHub Actions may be run without separate approval when they are relevant to the current task and use existing repository workflows. Separate approval is still required to create or modify workflows, create temporary CI branches, run Chromium or Playwright, or run broad or unjustified performance matrices.

## 9. Readiness without deployment

When deployment was not requested, report:

```text
Статус: код готов, не задеплоен
Ветка:
Коммит:
Проверки:
Деплой: не запускался
```

Do not wait for automatic Vercel and do not invent URLs.

## 10. Visual verification

Visual permission is separate from deployment permission.

When a deployment already exists:

```text
direct browser available
→ .agents/skills/real-wargame-local-preview/SKILL.md

direct browser unavailable
→ .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

The Playwright skill tests an existing deployment and must not deploy the application.

## 11. Architecture and performance boundaries

- core simulation and pure AI do not import PixiJS or DOM;
- renderers display state and are not gameplay truth;
- subjective knowledge does not reveal hidden objective state;
- UI layers do not own gameplay computation;
- full-map scans, queues and recurring work are bounded;
- asynchronous results use exact identity and stale-result rejection.

## 12. Current-status documentation

Edit current state in canonical JSON and run `npm run docs:sync` when the environment supports it. When generation cannot run, reproduce the exact intended generated output and report the limitation honestly.

## 13. Prohibited legacy routes

Do not reintroduce:

- automatic Vercel deployment on every push;
- dummy deployment commits;
- direct product implementation in preview;
- PR-first feature development;
- mandatory Codex deployment;
- a separate Vercel project per feature branch;
- deletion of the permanent Vercel project;
- product fixes on temporary CI branches;
- committed Vercel secrets;
- transfer or main operations without explicit approval.

## 14. Final report

Always distinguish:

```text
feature_branch:
current_commit:
checks_run:
deployment_requested:
deployment_status:
deployed_commit:
game_preview:
ai_node_editor_preview:
live_test_status:
visual_qa_status:
preview_touched:
main_touched:
```

Never claim code readiness, Vercel deployment, human live testing and browser evidence are the same thing.
