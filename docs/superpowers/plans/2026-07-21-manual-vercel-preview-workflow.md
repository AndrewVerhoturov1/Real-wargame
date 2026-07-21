# Manual Vercel Preview Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually dispatched, exact-SHA, prebuilt Vercel Preview pipeline that never uses Vercel as the test runner and never creates diagnostic projects.

**Architecture:** A shared isolated process runner executes the Preview gate before any Vercel command. GitHub Actions then links only to the secret-backed permanent project, performs one `vercel build`, validates the output, and publishes it once with `vercel deploy --prebuilt`.

**Tech Stack:** Node.js 24, npm, TypeScript, Vite 5, GitHub Actions, Vercel CLI 56.4.1.

## Global Constraints

- Work only on `feature/20260721-manual-vercel-preview-workflow` based on `real-wargame-preview` SHA `90a08769cf80c1a57edf57867b8d4f347ac5f622`.
- Do not change or deploy `main` or `real-wargame-preview`.
- Do not run GitHub Actions or create a real Vercel deployment.
- Preserve `vercel.json` automatic Git deployment disablement.
- Use only `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` from GitHub Secrets.
- Use the permanent Vercel project `repo`; never create a project.

---

### Task 1: Isolated Preview gate

**Files:**
- Create: `scripts/lib/isolated_process_runner.mjs`
- Create: `scripts/preview_smoke_scenarios.mjs`
- Create: `scripts/test_preview_smokes.mjs`
- Create: `scripts/verify_preview.mjs`
- Create: `scripts/isolated_process_runner_smoke.mjs`

**Interfaces:**
- Produces `runIsolatedChecks(checks, options)` returning `{ passed, results }`.
- Every result contains `name`, `command`, `status`, `exitCode`, `durationMs`, `stdout`, and `stderr`.
- `verify_preview.mjs --report <path>` writes the exact executed-check report.

- [ ] Write the runner contract smoke with pass, exit-code failure, and a child that prints `passed` but leaves `setInterval()` alive.
- [ ] Run the contract and confirm it fails before the runner exists.
- [ ] Implement detached child execution, output capture, explicit timeout, process-tree termination and exit code `124` for timeout.
- [ ] Define the existing Preview matrix as individual scenario files rather than aggregate imports.
- [ ] Implement `test_preview_smokes.mjs` and `verify_preview.mjs`.
- [ ] Run the runner contract and Preview gate where repository dependencies are available.

### Task 2: Separate npm commands and deployment artifacts

**Files:**
- Modify: `package.json`
- Modify: `scripts/deployment_pages_smoke.mjs`
- Create: `scripts/write_deployment_source.mjs`

**Interfaces:**
- `typecheck` runs only `tsc --noEmit`.
- `test:preview` runs only isolated Preview smoke scenarios.
- `verify:preview` runs the complete non-build gate.
- `build:app` runs only `vite build`.
- `verify:deployment-pages -- --root <dir>` validates both HTML files and `deployment-source.json` when `--require-source` is supplied.
- `build` runs `build:app` then checks local `dist` pages.

- [ ] Add a page-check contract for an alternate root and required metadata.
- [ ] Implement argument parsing in `deployment_pages_smoke.mjs`.
- [ ] Implement `write_deployment_source.mjs` to merge the gate report into the public metadata file.
- [ ] Replace the overloaded `build` script with explicit commands without removing any historical smoke command.
- [ ] Run the focused contract scripts.

### Task 3: Manual GitHub Actions Preview workflow

**Files:**
- Create: `.github/workflows/manual-vercel-preview.yml`
- Create: `scripts/manual_vercel_preview_workflow_smoke.mjs`

**Interfaces:**
- Inputs: `ref`, `expected_sha`, `allow_main`, optional `skip_checks` and `skip_reason`.
- Outputs: workflow summary with ref, SHA, checks, skipped checks, deployment ID, URL and status.

- [ ] Write textual/YAML contract assertions first.
- [ ] Require only `workflow_dispatch`; reject `main` unless `allow_main=true`.
- [ ] Checkout exact input ref and compare HEAD to expected SHA before `npm ci`.
- [ ] Use Node 24, npm cache and `npm ci`.
- [ ] Run `npm run verify:preview` before the first authenticated Vercel command.
- [ ] Use `npx vercel@56.4.1 pull`, verify `.vercel/project.json` against secrets and project name `repo`, then run one `vercel build`.
- [ ] Write metadata, validate `.vercel/output/static`, deploy once with `vercel deploy --prebuilt`, inspect deployment identity, and write the summary.
- [ ] Confirm no project-create, push, pull-request or automatic deployment trigger exists.

### Task 4: Emergency fallback and policy contracts

**Files:**
- Modify: `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`
- Modify: `.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-package.json`
- Modify: `.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-deploy-build.mjs`
- Modify: `.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-vercel.json`
- Modify: `docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md`
- Modify: `scripts/manual_vercel_deploy_skill_smoke.mjs`

- [ ] Update contract smoke expectations first.
- [ ] Make GitHub Actions and exact local checkout the primary routes.
- [ ] State that Vercel is publication, not TDD/debugging.
- [ ] Restrict exact-source bootstrap to emergency fallback, Node 24, minimal gate and permanent project only.
- [ ] State one checked SHA normally creates one deployment; retries require a new SHA, infrastructure failure, or new explicit command.
- [ ] Preserve explicit reporting of skipped checks and separate transfer/deploy permissions.
- [ ] Run contract smoke.

### Task 5: Verification and report

**Files:**
- Modify only files required by failed current contracts; do not weaken tests silently.

- [ ] Run Node syntax checks for every new `.mjs` file.
- [ ] Run isolated-runner smoke, deployment policy smoke, workflow smoke and page smoke fixtures.
- [ ] Validate workflow structure without dispatching it.
- [ ] Compare feature branch to `real-wargame-preview` and confirm `main`/preview are untouched.
- [ ] Inspect Vercel projects read-only and report permanent project `repo` plus temporary diagnostic projects; do not delete them.
- [ ] Commit all implementation changes and report exact branch, commit, checks and deployment status `not run`.
