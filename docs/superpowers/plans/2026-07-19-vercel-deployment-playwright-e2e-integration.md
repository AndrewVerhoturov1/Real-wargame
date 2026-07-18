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

- [x] Add intent-based frontmatter that triggers when deployed Vercel visual verification is requested and no directly controlled browser is available.
- [x] Document exact inputs, temporary branch/PR architecture and branch isolation.
- [x] Add protection-secret handling without committing share tokens.
- [x] Add deterministic state-changing Playwright requirements, canvas discipline and overlay persistence checks.
- [x] Add evidence JSON, screenshot, trace, video, diagnostics, artifact inspection and user presentation requirements.
- [x] Add failure classification, rerun ownership and cleanup rules.

### Task 2: Make routing automatic and mandatory

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai/WEB_CHAT_START.md`
- Modify: `docs/ai/SKILLS_INDEX.md`
- Modify: `docs/ai/TASK_ROUTER.md`
- Modify: `docs/ai/repo-context.json`

- [x] State that user intent is enough and the skill name is not required.
- [x] Route direct controlled browser availability to `real-wargame-local-preview`.
- [x] Route unavailable direct browser to mandatory `vercel-deployment-playwright-e2e`.
- [x] Add machine-readable skill and auto-load fields.

### Task 3: Integrate the skill into visual policy and delivery

**Files:**
- Modify: `.agents/skills/real-wargame-local-preview/SKILL.md`
- Modify: `docs/workflow/VISUAL_QA_APPROVAL_POLICY.md`
- Modify: `docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md`
- Modify: `docs/orchestration/RESULT_TEMPLATE.md`

- [x] Correct the stale local-preview instruction that still preferred direct work in preview.
- [x] Define the exact decision point after user approval.
- [x] Require temporary CI-only branches and PR when direct browser is unavailable.
- [x] Require artifact download, evidence inspection and screenshot presentation.
- [x] Extend reporting with target URL, source SHA, CI branches/PR, run/artifact identity, failure class and cleanup status.

### Task 4: Verify the documentation contract

**Files:**
- Review all modified files.

- [x] Confirm all canonical entry points use mandatory automatic wording.
- [x] Confirm no text permits committing share tokens to temporary branches.
- [x] Confirm application fixes cannot be made on CI branches.
- [x] Confirm a product commit change invalidates previous CI evidence.
- [x] Validate `repo-context.json` as JSON.
- [x] Compare the feature branch with `real-wargame-preview` and report unavailable executable checks honestly.

## RED/GREEN process evidence

### Baseline RED

Before this change:

- only `real-wargame-local-preview` was registered for visual work;
- its core rules still said to work in `real-wargame-preview` first;
- no canonical entry point required the deployed-Vercel CI skill by user intent;
- no rule separated test-harness fixes from application fixes across CI and product branches;
- no machine-readable automatic fallback existed.

Therefore a future Web Chat could legally miss the supplied skill unless the user named it explicitly.

### GREEN

After this change:

- the new skill frontmatter matches visual/screenshot/browser/Playwright requests for deployed Vercel Preview when direct browser is unavailable;
- `AGENTS.md`, `WEB_CHAT_START.md`, `SKILLS_INDEX.md`, `TASK_ROUTER.md`, the local-preview skill, visual policy and canonical delivery workflow all contain the same mandatory automatic route;
- `repo-context.json` encodes auto-load, branch isolation and evidence invalidation;
- report template requires run/artifact/product identity, evidence inspection and cleanup.

## Verification result

```text
repo-context JSON parse: passed
schemaVersion: 3
automatic Vercel visual fallback: true
feature branch vs real-wargame-preview: ahead
behind_by: 0
merge base: 0ead877ea6ab04025e494c363769245a30207141
new project skill fetched from branch: passed
mandatory routing fetched from AGENTS.md: passed
mandatory routing fetched from SKILLS_INDEX.md: passed
secret-in-branch permission: absent; explicit prohibition present
application fixes on CI branch: explicitly prohibited
new product SHA reuses old evidence: explicitly prohibited
GitHub Actions: not run; this task defines the workflow skill but does not execute visual verification
Playwright/browser: not run
local npm/docs commands: not run; no local checkout/network-capable git environment available
subagent pressure scenarios: not run; no subagent execution tool available
```
