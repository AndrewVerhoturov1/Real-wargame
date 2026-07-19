# Vercel Workflow Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mandatory Codex deployment step with automatic GitHub-to-Vercel deployment, require both application pages in every build, and simplify user-facing reports and cleanup.

**Architecture:** Configure Vite as a two-page build, add a post-build contract check, and update canonical workflow documents plus machine-readable repository context. Keep one permanent Git-connected Vercel project and treat feature branches as Preview deployments inside it.

**Tech Stack:** Vite 5, TypeScript 5, Node.js, GitHub, Vercel.

## Global Constraints

- Work only on `feature/20260719-simplify-vercel-workflow`.
- Do not touch `real-wargame-preview` or `main` without explicit user GO.
- Do not run GitHub Actions.
- Every build must contain `/` and `/ai-node-editor.html`.
- User-facing communication must use simple Russian and avoid unnecessary English terms.
- Never delete the permanent Git-connected Vercel project.

---

### Task 1: Enforce both deployment pages

**Files:**
- Modify: `vite.config.ts`
- Create: `scripts/deployment_pages_smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: root `index.html` and `ai-node-editor.html`.
- Produces: `dist/index.html`, `dist/ai-node-editor.html`, and `npm run deployment-pages:smoke`.

- [ ] **Step 1: Add a failing output contract**

Create `scripts/deployment_pages_smoke.mjs` that exits non-zero when either required page is missing or empty.

- [ ] **Step 2: Run the contract before changing Vite**

Run: `npm run build && node scripts/deployment_pages_smoke.mjs`

Expected: failure because `dist/ai-node-editor.html` is absent.

- [ ] **Step 3: Configure both Vite inputs**

Add explicit Rollup inputs for `index.html` and `ai-node-editor.html` using `fileURLToPath(new URL(..., import.meta.url))`.

- [ ] **Step 4: Make the build enforce the contract**

Add `deployment-pages:smoke` and append it to the `build` script after `vite build`.

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
npm run deployment-pages:smoke
```

Expected: both commands pass and both HTML files exist.

### Task 2: Replace Codex deployment with automatic Vercel deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai/WEB_CHAT_START.md`
- Modify: `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`
- Modify: `docs/ai/repo-context.json`

**Interfaces:**
- Consumes: GitHub-connected permanent Vercel project.
- Produces: canonical workflow with automatic branch Preview deployment.

- [ ] **Step 1: Remove mandatory Codex handoff language**

Replace the one-time Codex deployment stage with automatic deployment after every feature-branch push.

- [ ] **Step 2: Require two live links**

Require direct links for the game root and `/ai-node-editor.html` in readiness and live-test reports.

- [ ] **Step 3: Add cleanup policy**

Document feature-branch deletion after accepted transfer and legacy temporary Vercel-project deletion only after the replacement preview is Ready and both pages work.

- [ ] **Step 4: Update machine-readable state**

Record automatic Vercel deployment, the required pages, optional Codex role, and permanent-project protection in `repo-context.json`.

### Task 3: Make reports easy for the user

**Files:**
- Modify: `docs/orchestration/RESULT_TEMPLATE.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: compact practical summary before technical details.

- [ ] **Step 1: Add mandatory simple-Russian rule**

State that the user must be addressed in simple Russian, like an intelligent high-school student, with unnecessary English terms avoided.

- [ ] **Step 2: Add a practical report header**

Require status, short change summary, game link, AI Node Editor link, branch, commit, and test checklist first.

- [ ] **Step 3: Improve evidence presentation**

Require clickable links, directly shown key screenshots, and technical identifiers after the practical summary.

### Task 4: Verify repository consistency

**Files:**
- Test: all modified files.

- [ ] **Step 1: Run focused checks**

```bash
npm run build
npm run deployment-pages:smoke
npm run docs:smoke
npm run docs:check
```

- [ ] **Step 2: Inspect the branch diff**

Confirm no product runtime behavior changed and no temporary Vercel secret or project identifier was committed.

- [ ] **Step 3: Report**

Provide clickable GitHub branch and Vercel links when available. State that GitHub Actions were not run.
