# Web Chat Preview Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository's direct-preview and PR-first guidance with the approved Web Chat feature-branch → one-time Codex Vercel Preview → human live test → optional visual Actions → explicit preview transfer workflow.

**Architecture:** `AGENTS.md` and `docs/ai/repo-context.json` define the canonical machine and human contract. Entry-point, external-chat, orchestration, review and reporting documents must repeat the same role ownership and branch gates without introducing alternate defaults. Existing performance and visual-QA safety rules remain intact.

**Tech Stack:** Markdown, JSON, GitHub branch workflow documentation.

## Global Constraints

- Base every implementation branch on the current `real-wargame-preview` head.
- Default branch naming is `feature/YYYYMMDD-short-kebab-slug`.
- Web Chat owns implementation, commits, pushes, fixes and final transfer.
- Codex only exposes the already-pushed branch as a Vercel Preview and returns the URL.
- Direct implementation commits to `real-wargame-preview` are forbidden.
- Transfer to `real-wargame-preview` requires explicit user GO.
- `main` requires a separate explicit user GO.
- Browser and screenshot workflows remain manual-only.
- Preserve focused verification and performance contracts.

---

### Task 1: Replace the canonical branch and role contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai/repo-context.json`
- Modify: `docs/ai/WEB_CHAT_START.md`
- Modify: `docs/ai/AGENT_START_HERE.md`

- [ ] Rewrite the branch policy so a Web Chat always creates a temporary feature branch from current `real-wargame-preview`.
- [ ] State that direct implementation pushes to `real-wargame-preview` are forbidden.
- [ ] Define the focused non-browser check route and one-time Codex deployment role.
- [ ] Define the same-branch manual feedback loop and explicit user GO transfer gate.
- [ ] Update required report fields and machine-readable delivery data.

### Task 2: Replace external and multi-chat legacy routes

**Files:**
- Modify: `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- Modify: `docs/orchestration/CHAT_WORKFLOW.md`
- Modify: `docs/orchestration/ORCHESTRATOR_PROMPT.md`
- Modify: `docs/orchestration/WORKER_PROMPT.md`
- Modify: `docs/orchestration/INTEGRATOR_PROMPT.md`

- [ ] Make the canonical feature branch the only write target during development.
- [ ] Restrict parallel chats to research or proposals unless one designated Web Chat owns the feature branch.
- [ ] Remove direct-preview delivery and independent PR delivery from worker and integrator instructions.
- [ ] Preserve runtime, architecture and performance invariants.

### Task 3: Update review, visual QA and reporting guidance

**Files:**
- Modify: `docs/ai/PR_REVIEW_CHECKLIST.md`
- Modify: `docs/orchestration/RESULT_TEMPLATE.md`
- Modify: `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md`
- Modify: `docs/ai/TASK_ROUTER.md`

- [ ] Reframe PR review as optional transfer/review after explicit user instruction.
- [ ] Add feature branch, base commit, current commit, Vercel preview, manual live-test and preview-transfer fields.
- [ ] Preserve manual-only browser execution and exact-SHA artifact checks.
- [ ] Make focused non-browser verification the default minimum for implementation work.

### Task 4: Repository-wide consistency verification

**Files:**
- Review all modified files.

- [ ] Search modified content for stale default phrases such as `direct push`, `PR fallback`, direct delivery to preview and Codex implementation.
- [ ] Validate `docs/ai/repo-context.json` as JSON.
- [ ] Check that every canonical document uses the same branch, role and approval wording.
- [ ] Compare the feature branch against `real-wargame-preview` and inspect the final diff.
- [ ] Report checks that could not be executed because no local checkout or GitHub Actions run was used.
