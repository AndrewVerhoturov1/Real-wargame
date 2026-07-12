# Web-Chat Repository Context v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single-source, generated and validated repository context that a GitHub-aware web chat can understand without previous conversation history.

**Architecture:** Repository-wide state lives in `docs/ai/repo-context.json`; subproject state lives in each `subproject.json`. Focused Node.js scripts generate human-readable status pages and validate schema, paths, links and consistency. Existing long documents remain reference/history rather than competing current-status sources.

**Tech Stack:** Node.js ES modules, JSON, Markdown, GitHub Actions, existing Vite/TypeScript repository.

## Global Constraints

- Work only on `feature/web-chat-repository-v1` during implementation.
- Do not transfer or merge into `real-wargame-preview` without a new user instruction.
- Do not modify gameplay, rendering, AI behavior or scene data.
- Canonical development text and file names are English; complete Russian user-facing guidance remains available.
- The project uses PixiJS 7, not PixiJS 8.
- `main` requires explicit user GO.

---

### Task 1: Canonical metadata

**Files:**
- Create: `docs/ai/repo-context.json`
- Modify: `docs/subprojects/ai-single-unit-editor/subproject.json`
- Modify: `docs/subprojects/real-wargame-start/subproject.json`
- Modify: `docs/subprojects/github-collaboration/subproject.json`
- Modify: `docs/subprojects/repo-migration/subproject.json`

**Interfaces:**
- Produces repository and subproject JSON consumed by generator and checker.

- [ ] Add repository metadata with branches, launcher, stack, active subproject and delivery policy.
- [ ] Normalize subproject statuses and add `updated_at`, `next_step`, `canonical_launcher`, `last_verified_commit` and `superseded_by` where applicable.
- [ ] Keep existing domain-specific metadata intact.
- [ ] Validate JSON parsing.
- [ ] Commit.

### Task 2: Test-first generator and checker

**Files:**
- Create: `scripts/agent_docs_lib.mjs`
- Create: `scripts/generate_agent_docs.mjs`
- Create: `scripts/check_agent_docs.mjs`
- Create: `scripts/agent_docs_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `loadRepositoryContext`, `discoverSubprojects`, `generateAgentDocuments`, `validateAgentDocuments`.

- [ ] Write fixture-based smoke tests for deterministic generation, invalid status, stale generated output, missing path and PixiJS mismatch.
- [ ] Run the smoke and confirm RED because library functions do not exist.
- [ ] Implement the smallest reusable library.
- [ ] Run the smoke and confirm GREEN.
- [ ] Add `docs:generate`, `docs:check`, `docs:smoke`, `docs:sync` scripts.
- [ ] Commit.

### Task 3: Generate navigation and status

**Files:**
- Generate: `docs/ai/CURRENT_STATE.md`
- Generate: `docs/subprojects/index.json`
- Generate: `docs/subprojects/INDEX.md`
- Generate: `docs/subprojects/*/STATUS.md`

**Interfaces:**
- Consumes canonical JSON from Task 1.
- Produces the default web-chat navigation views.

- [ ] Run `npm run docs:generate`.
- [ ] Inspect generated Markdown for correct active status, launcher, branch and next step.
- [ ] Run `npm run docs:check`.
- [ ] Commit generated files.

### Task 4: Short web-chat route and architecture map

**Files:**
- Create: `docs/ai/WEB_CHAT_START.md`
- Create: `docs/ai/TASK_ROUTER.md`
- Create: `docs/architecture/OVERVIEW.md`
- Create: `docs/architecture/MODULE_MAP.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/subprojects/README.md`

**Interfaces:**
- Produces stable entry pages that route to generated status and relevant skills.

- [ ] Replace duplicated startup directions with the five-file route.
- [ ] Keep hard branch, language, honesty and no-terminal rules in `AGENTS.md`.
- [ ] Make README stable and link current state rather than duplicating it.
- [ ] Add task-to-files-to-checks routing.
- [ ] Add architecture boundaries and module map.
- [ ] Run link and docs checks.
- [ ] Commit.

### Task 5: Synchronize collaboration policy

**Files:**
- Modify: `docs/ai/WORKFLOW_OVERVIEW.md`
- Modify: `docs/ai/EXTERNAL_CHAT_WORKFLOW.md`
- Modify: `docs/ai/TASK_PACK_Q_TEMPLATE.md`
- Modify: `docs/ai/PR_REVIEW_CHECKLIST.md`
- Modify: `docs/subprojects/github-collaboration/SUBPROJECT.md`
- Modify: `.github/pull_request_template.md`

**Interfaces:**
- Ensures every active document uses direct-push-to-preview as preferred delivery and PR-to-preview as fallback.

- [ ] Remove statements that make a PR mandatory for every Q task.
- [ ] Keep PR-specific review requirements conditional on fallback PR use.
- [ ] Keep `main` GO protection unchanged.
- [ ] Run docs checks.
- [ ] Commit.

### Task 6: Project-local routing skills

**Files:**
- Create: `.agents/skills/real-wargame-pixijs/SKILL.md`
- Create: `.agents/skills/real-wargame-ai-runtime/SKILL.md`
- Modify: `docs/ai/SKILLS_INDEX.md`
- Modify: `docs/ai/PIXIJS_SKILLS_INDEX.md`

**Interfaces:**
- Routes PixiJS work through a v7 compatibility guard and AI-runtime work through focused project context.

- [ ] Add PixiJS 7 hard guard.
- [ ] Add AI GraphRunner/Runtime/Bridge boundaries and verification route.
- [ ] Update indexes so project-local skills are read first.
- [ ] Run docs checks.
- [ ] Commit.

### Task 7: CI integrity check

**Files:**
- Create: `.github/workflows/agent-docs-integrity.yml`

**Interfaces:**
- Runs `npm run docs:smoke`, `npm run docs:generate`, `git diff --exit-code`, `npm run docs:check`.

- [ ] Add path-filtered push and pull-request triggers.
- [ ] Use existing package-lock through `npm ci`.
- [ ] Run the local smoke where available.
- [ ] Commit.

### Task 8: Final verification and branch handoff

**Files:**
- Review all changed files.

- [ ] Run `npm run docs:smoke`.
- [ ] Run `npm run docs:generate` and verify clean diff.
- [ ] Run `npm run docs:check`.
- [ ] Run `npm run build` to detect accidental package/script regressions.
- [ ] Compare branch against `real-wargame-preview`.
- [ ] Verify no gameplay source files changed.
- [ ] Leave branch unmerged and report exact commit/check status.
