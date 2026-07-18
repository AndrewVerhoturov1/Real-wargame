# Web Chat Preview Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository's direct-preview and PR-first guidance with the approved Web Chat feature-branch → one-time Codex Vercel Preview → human live test → optional visual Actions → explicit preview transfer workflow.

**Architecture:** `AGENTS.md` and `docs/ai/repo-context.json` define the canonical machine and human contract. Entry-point, external-chat, orchestration, review and reporting documents repeat the same role ownership and branch gates without introducing alternate defaults. Existing architecture, performance and manual-only visual-QA safety rules remain intact.

**Tech Stack:** Markdown, JSON, GitHub branch workflow documentation.

## Global Constraints

- Base every implementation branch on the current `real-wargame-preview` head.
- Default branch naming is `feature/YYYYMMDD-short-kebab-slug`.
- Web Chat owns implementation, commits, pushes, fixes and final transfer.
- Codex only exposes the already-pushed branch as a branch-linked Vercel Preview and returns the URL.
- Direct implementation commits to `real-wargame-preview` are forbidden.
- Transfer to `real-wargame-preview` requires explicit user GO.
- `main` requires a separate explicit user GO.
- Browser and screenshot workflows remain manual-only.
- Preserve focused verification and performance contracts.

---

### Task 1: Replace the canonical branch and role contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/ai/repo-context.json`
- Modify: `docs/ai/WEB_CHAT_START.md`
- Modify: `docs/ai/AGENT_START_HERE.md`
- Create: `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`

- [x] Rewrite the branch policy so a Web Chat always creates a temporary feature branch from current `real-wargame-preview`.
- [x] State that direct implementation pushes to `real-wargame-preview` are forbidden.
- [x] Define the focused non-browser check route and one-time Codex deployment role.
- [x] Define the same-branch manual feedback loop and explicit user GO transfer gate.
- [x] Update required report fields and machine-readable delivery data.

### Task 2: Replace external and multi-chat legacy routes

**Files:**
- Modify: `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- Modify: `docs/orchestration/CHAT_WORKFLOW.md`
- Modify: `docs/orchestration/CURRENT_WORK.md`
- Modify: `docs/orchestration/ORCHESTRATOR_PROMPT.md`
- Modify: `docs/orchestration/WORKER_PROMPT.md`
- Modify: `docs/orchestration/INTEGRATOR_PROMPT.md`
- Modify: `docs/ai/R_INIT_WORKFLOW.md`
- Modify: `docs/ai/ZWORKER_MODES.md`
- Modify: `docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md`
- Modify: `docs/workflow/LOCAL_TWO_FOLDER_WORKFLOW.md`

- [x] Make the canonical feature branch the only write target during development.
- [x] Restrict parallel chats to research or proposals unless one designated Web Chat owns the feature branch.
- [x] Remove direct-preview delivery and independent PR delivery from worker and integrator instructions.
- [x] Deprecate Q/R/X/r-init and direct-preview compatibility routes.
- [x] Reframe local preview folders as an optional post-transfer diagnostic route.
- [x] Preserve runtime, architecture and performance invariants.

### Task 3: Update review, visual QA and reporting guidance

**Files:**
- Modify: `.github/pull_request_template.md`
- Modify: `docs/ai/PR_REVIEW_CHECKLIST.md`
- Modify: `docs/orchestration/RESULT_TEMPLATE.md`
- Modify: `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md`
- Modify: `docs/ai/TASK_ROUTER.md`

- [x] Reframe PR review as optional transfer/review after explicit user instruction.
- [x] Add feature branch, base commit, current commit, Vercel preview, manual live-test and preview-transfer fields.
- [x] Preserve manual-only browser execution and exact-SHA artifact checks.
- [x] Make focused non-browser verification the default minimum for implementation work.
- [x] State that PR or visual success does not grant transfer permission without explicit user GO.

### Task 4: Repository-wide consistency verification

**Files:**
- Review all modified files.

- [x] Review canonical, orchestration, legacy and optional PR documents for stale positive instructions to use direct preview, PR-first development or Codex implementation.
- [x] Validate `docs/ai/repo-context.json` with a JSON parser.
- [x] Check that canonical documents use the same branch, role and approval wording.
- [x] Compare the feature branch against `real-wargame-preview` and inspect the complete changed-file set.
- [x] Confirm the feature branch remains based exactly on preview commit `0ead877ea6ab04025e494c363769245a30207141` and is not behind preview.
- [x] Record that local repository commands and GitHub Actions were not run because the environment has no GitHub network access or `gh`, and the task is documentation-only with no requested browser verification.

## Verification result

```text
repo-context JSON parse: passed
feature branch vs preview: ahead, behind_by 0
base/merge-base preview SHA: 0ead877ea6ab04025e494c363769245a30207141
GitHub Actions: not run
browser/Playwright: not run
local npm/docs commands: not run; no local checkout available in this environment
```
