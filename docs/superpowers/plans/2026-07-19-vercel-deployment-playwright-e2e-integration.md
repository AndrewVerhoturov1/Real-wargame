# Automatic Vercel Deployment Playwright E2E Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory automatically discovered skill for visual verification of the current feature branch's Vercel Preview through temporary GitHub Actions Playwright infrastructure when no directly controlled browser is available.

**Architecture:** The project skill router chooses between a directly controlled browser path and the CI fallback. The CI fallback creates temporary base/head branches from the exact product commit, runs a temporary non-merge PR, records evidence, classifies failures, displays inspected screenshots and cleans up without modifying product branches.

**Tech Stack:** Markdown project skills, GitHub Actions, Playwright, Vercel Preview.

## Global Constraints

- User intent triggers the skill; the user never needs to name it.
- Visual execution still requires explicit user approval.
- Product implementation remains on the canonical feature branch.
- CI harness files exist only on temporary `ci/**` branches.
- Secrets never enter repository files, PR text, logs or reports.
- Application defects return to the canonical feature branch.
- Test-harness defects stay in the temporary CI head branch.
- A new product SHA requires a fresh temporary CI branch pair and fresh evidence.
- Temporary PRs are never merged.
- Visual success never grants preview-transfer approval.

---

### Task 1: Add the project skill

**Files:**
- Create: `.agents/skills/vercel-deployment-playwright-e2e/SKILL.md`

- [ ] Add intent-based frontmatter that triggers when deployed Vercel visual verification is requested and no directly controlled browser is available.
- [ ] Document exact inputs, temporary branch/PR architecture and branch isolation.
- [ ] Add protection-secret handling without committing share tokens.
- [ ] Add deterministic state-changing Playwright requirements, canvas discipline and overlay persistence checks.
- [ ] Add evidence JSON, screenshot, trace, video, diagnostics, artifact inspection and user presentation requirements.
- [ ] Add failure classification, rerun ownership and cleanup rules.

### Task 2: Make routing automatic and mandatory

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai/WEB_CHAT_START.md`
- Modify: `docs/ai/SKILLS_INDEX.md`
- Modify: `docs/ai/TASK_ROUTER.md`
- Modify: `docs/ai/repo-context.json`

- [ ] State that user intent is enough and the skill name is not required.
- [ ] Route direct controlled browser availability to `real-wargame-local-preview`.
- [ ] Route unavailable direct browser to mandatory `vercel-deployment-playwright-e2e`.
- [ ] Add machine-readable skill and auto-load fields.

### Task 3: Integrate the skill into visual policy and delivery

**Files:**
- Modify: `.agents/skills/real-wargame-local-preview/SKILL.md`
- Modify: `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md`
- Modify: `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`
- Modify: `docs/orchestration/RESULT_TEMPLATE.md`

- [ ] Correct the stale local-preview instruction that still prefers direct work in preview.
- [ ] Define the exact decision point after user approval.
- [ ] Require temporary CI-only branches and PR when direct browser is unavailable.
- [ ] Require artifact download, evidence inspection and screenshot presentation.
- [ ] Extend reporting with target URL, source SHA, CI branches/PR, run/artifact identity, failure class and cleanup status.

### Task 4: Verify the documentation contract

**Files:**
- Review all modified files.

- [ ] Confirm all canonical entry points use mandatory automatic wording.
- [ ] Confirm no text permits committing share tokens to temporary branches.
- [ ] Confirm application fixes cannot be made on CI branches.
- [ ] Confirm a product commit change invalidates previous CI evidence.
- [ ] Validate `repo-context.json` as JSON.
- [ ] Compare the feature branch with `real-wargame-preview` and report unavailable executable checks honestly.