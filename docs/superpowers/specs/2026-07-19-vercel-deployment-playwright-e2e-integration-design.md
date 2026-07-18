# Automatic Vercel Deployment Playwright E2E Skill Integration Design

## Goal

Make `vercel-deployment-playwright-e2e` the mandatory automatic route whenever the user asks for visual verification of the current feature branch's Vercel Preview and the Web Chat cannot directly control a browser that can open that deployment.

The user does not need to name the skill. Phrases such as `проверь визуально`, `запусти визуальную проверку`, `сделай скриншоты`, `проверь через Playwright` or equivalent intent are sufficient.

## Position in the canonical workflow

The skill is used only after:

1. Web Chat implemented and pushed the canonical feature branch;
2. focused non-browser checks were reported;
3. Codex exposed the branch as a branch-linked Vercel Preview;
4. the user explicitly requested visual verification, either earlier or at the current step;
5. the current Web Chat determined that no directly controlled browser is available for the target deployment.

It does not replace the human live test, does not grant preview-transfer approval and does not involve Codex after the deployment URL has been returned.

## Automatic routing rule

```text
user requests visual verification
→ Web Chat checks whether it can directly control a real browser against target_url
→ direct browser available: use real-wargame-local-preview direct-browser route
→ direct browser unavailable: MUST read and use vercel-deployment-playwright-e2e
```

The route must be repeated in `AGENTS.md`, `WEB_CHAT_START.md`, `SKILLS_INDEX.md`, `TASK_ROUTER.md`, `VISUAL_QA_APPROVAL_POLICY.md`, `WEB_CHAT_FEATURE_DELIVERY.md` and the local-preview skill.

## Isolation model

The GitHub Actions route uses two temporary CI-only branches created from the exact product commit represented by the Vercel deployment:

```text
ci/<scenario>-base-<timestamp>-<short-sha>
ci/<scenario>-head-<timestamp>-<short-sha>
```

The base branch adds only the temporary PR-triggered workflow. The head branch adds only the temporary Playwright config and scenario. A temporary PR from head to base starts the run. The PR is never merged.

The canonical feature branch, `real-wargame-preview` and `main` are not modified by CI harness files.

## Exact-product identity

Both temporary CI branches start from the same exact feature commit. The run records:

- canonical feature branch;
- expected product SHA;
- Vercel target URL without secret query data;
- temporary base/head branch names;
- PR number;
- workflow run ID and head SHA;
- artifact ID and digest when available.

If the deployed application cannot expose or prove its build SHA, the final report must say that deployment-to-source identity was not independently proven. A green test must not be described as exact-SHA acceptance in that case.

## Failure ownership

Failures are classified before changing anything:

- `environment`: browser install/start, deployment unavailable, protection secret invalid;
- `test-harness`: selector, coordinates, timing or assertion defect;
- `application`: actual product behavior or runtime failure.

A test-harness defect is fixed only in the temporary CI head branch and rerun in the same temporary PR.

An application defect is fixed only in the canonical feature branch. That creates a new product commit and a new Vercel deployment. The old temporary PR is closed and a fresh base/head CI pair is created from the new exact product SHA. Old evidence is never reused for the new product commit.

## Deployment protection and secrets

Secrets must never be committed to any branch, including temporary CI branches.

Preferred order:

1. open the normal public Preview URL;
2. use `VERCEL_AUTOMATION_BYPASS_SECRET` from GitHub Actions secrets and send `x-vercel-protection-bypass`;
3. if only a Vercel share URL is available, store the complete protected URL in a GitHub Actions secret such as `VERCEL_SHARE_URL`; never put the token in YAML, PR text, branch files, logs or the final report.

## Evidence contract

The workflow always uploads:

- `evidence.json`, including the last reached stage even on failure;
- successful milestone PNGs;
- failure screenshot when applicable;
- Playwright trace;
- retained-on-failure video;
- Playwright report and error context;
- console, page-error and request-failure diagnostics.

The Web Chat must download and inspect the artifact. A green workflow alone is insufficient. The user receives a contact sheet when useful, direct links to key full-size screenshots, the complete artifact and the workflow run link.

## Cleanup

After the final result:

1. close the temporary PR without merge;
2. delete temporary CI branches when supported;
3. report any branch cleanup that could not be performed;
4. preserve the canonical feature branch for same-branch product fixes or explicit preview transfer;
5. do not transfer anything into `real-wargame-preview` without separate explicit user GO.

## Success criteria

- the skill is discoverable by user intent, not only by name;
- mandatory routing is stated in every canonical entry point;
- the real deployed Vercel URL is opened in Chromium;
- a real state-changing scenario is executed;
- evidence is downloaded and visually inspected;
- failures are classified before edits;
- CI-only changes never enter product branches;
- temporary PR is closed without merge;
- visual success does not imply preview-transfer approval.