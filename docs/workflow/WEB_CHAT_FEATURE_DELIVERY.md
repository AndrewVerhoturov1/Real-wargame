# Web Chat Feature Delivery Workflow

This is the canonical implementation, automatic Vercel Preview, live-test and optional visual-verification workflow for `Real-Wargame`.

## 1. Start a task

Resolve the exact current remote head of:

```text
real-wargame-preview
```

Record it as `base_commit` and create:

```text
feature/YYYYMMDD-short-kebab-slug
```

Do not implement directly on preview or main.

## 2. Implement on one feature branch

Web Chat owns the complete product cycle:

- inspect relevant repository context;
- implement the feature or fix;
- add or update focused regression tests;
- prepare a visual scenario when the change is visible;
- commit and push the feature branch;
- keep all later product fixes on the same feature branch.

Do not create a new product branch for each live-test defect.

## 3. Communication with the user

Use simple Russian, as with an intelligent high-school student.

- Put the practical result first.
- Avoid unnecessary English terms and abbreviations.
- Explain unavoidable technical terms once in plain Russian.
- Use clickable links.
- Show useful screenshots directly when available.
- Put long commit hashes, workflow IDs and diagnostics after the useful summary.
- Do not ask the user to operate Git or a terminal when the agent can do it.

## 4. Required application pages

Every production build and every Vercel deployment must contain both pages:

```text
/                     → index.html
/ai-node-editor.html  → ai-node-editor.html
```

The Vite build uses both HTML files as explicit inputs. `npm run build` must fail if either output file is missing.

The AI Node Editor is not optional. A deployment that serves only the game page is incomplete.

## 5. Focused non-browser checks

Before declaring a branch ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused subsystem smoke tests
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

The production build includes the deployment-page check.

For documentation/generated state:

```bash
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

Do not run Chromium, Playwright, broad integration matrices, GitHub Actions, unjustified performance workflows or duplicate builds by default.

If Node commands are unavailable, report that honestly. A small non-browser Actions check is only an optional fallback with user approval.

## 6. Push and automatic Vercel Preview

The repository uses one permanent Vercel project connected to GitHub.

After a push to the feature branch:

1. Vercel automatically detects the commit;
2. Vercel creates or updates the branch Preview;
3. wait for status `Ready`;
4. identify the deployed branch and commit when possible;
5. prepare both live links.

Required links:

```text
game_preview: <branch-preview>/
ai_node_editor_preview: <branch-preview>/ai-node-editor.html
```

Codex is not a required deployment step. Do not ask Codex or the user to redeploy after later pushes.

Do not create a separate Vercel project for every feature branch. Never delete the permanent Git-connected project during normal delivery.

## 7. Readiness report

Start with a compact practical block:

```text
Статус: готово к проверке / сборка не готова
Что изменилось: <one short paragraph>
Игра: <clickable URL>
Редактор ИИ: <clickable URL>/ai-node-editor.html
Ветка: <branch>
Коммит: <short hash>
Что проверить: <short task-specific checklist>
```

Then report only relevant technical details:

```text
base_commit:
current_commit:
checks_run:
not_checked:
deployment_status:
deployed_commit:
preview_touched: no
main_touched: no
```

Do not make the user search for URLs inside logs or raw Vercel output.

## 8. Human live test

The user opens both Vercel Preview links.

Game baseline:

1. application loads;
2. canvas renders;
3. relevant unit/editor state can be selected;
4. changed interaction works;
5. actual state changes, not only a label;
6. pause/resume works when relevant;
7. no new visible artifacts appear.

AI Node Editor baseline:

1. `ai-node-editor.html` loads;
2. the graph/editor interface appears;
3. the task-relevant editor section opens;
4. controls react and save/update when relevant;
5. no obvious broken styles or missing modules appear.

Do not require full-project manual regression for every focused change.

## 9. Same-branch correction loop

When the user reports a product defect, Web Chat:

1. returns to the same feature branch;
2. reproduces the issue;
3. adds or updates focused regression coverage when practical;
4. fixes product code;
5. reruns focused checks;
6. commits and pushes the same branch;
7. waits for automatic Vercel update;
8. reports the new commit and the same two branch links.

No Codex re-entry or manual Vercel redeploy is required.

## 10. Optional visual verification

Visual execution is manual-only and requires explicit user intent. The user does not need to name a skill.

Examples:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

When intent is explicit, do not ask again. Automatically choose a route.

### Direct controlled browser available

Read and use:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Direct controlled browser unavailable

Read and use:

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

## 11. Deployed Vercel CI route

The fallback skill creates two temporary CI-only branches from the exact product SHA:

```text
ci/<scenario>-base-<timestamp>-<short-sha>
ci/<scenario>-head-<timestamp>-<short-sha>
```

Base contains only the temporary PR workflow. Head contains only temporary Playwright configuration/scenario. The temporary PR runs head against base and is never merged.

Product branch, preview and main must not contain CI harness files.

Secrets:

- try a clean public URL first;
- prefer a Vercel automation bypass secret stored in GitHub Actions secrets;
- never commit a token or protected URL to any branch, PR text, log or report.

Required evidence normally includes:

```text
evidence.json
successful milestone PNGs
failure screenshot when applicable
trace.zip
failure video when applicable
Playwright report
console/page/network diagnostics
```

## 12. Visual failure ownership

Classify before edits.

### Environment

Deployment, protection, browser or Actions infrastructure. Fix only the environment/CI layer.

### Test harness

Selector, coordinates, timeout or assertion. Fix only the temporary CI head branch.

### Application

Actual product behavior. Fix only the canonical feature branch, rerun focused checks and wait for the updated automatic Preview.

New product SHA invalidates previous acceptance evidence. Create fresh CI branches and fresh evidence.

Never fix product code on CI branches.

## 13. Evidence presentation

After a visual run:

1. verify workflow conclusion and exact source;
2. download and inspect the artifact;
3. read `evidence.json`;
4. open and inspect key PNGs;
5. inspect trace when needed;
6. show the most useful screenshots directly in the response;
7. provide clickable links to both application pages, the workflow run and the full artifact;
8. explain the result in simple Russian;
9. close the temporary PR without merge;
10. delete temporary CI branches when supported or report the limitation.

A green workflow alone is insufficient.

## 14. Transfer into real-wargame-preview

Transfer is forbidden until the user gives explicit GO for the exact tested feature commit.

Before transfer, Web Chat:

1. confirms the approved commit;
2. checks whether the feature branch must be updated from current preview;
3. resolves conflicts on the feature branch;
4. reruns focused checks required by the final diff;
5. transfers the accepted result into `real-wargame-preview`;
6. reports the resulting preview commit.

PR may be used only when explicitly requested or technically required.

## 15. Post-transfer deployment check

After transfer:

1. wait for the automatic `real-wargame-preview` Vercel deployment;
2. verify deployment status `Ready`;
3. open the preview game page `/`;
4. open `/ai-node-editor.html`;
5. confirm both pages represent the transferred commit when identity is available;
6. report both clickable links to the user.

Transfer is not complete from the user's perspective until both pages are available or the failure is reported.

## 16. Cleanup

After the accepted preview deployment works:

1. delete the feature branch unless the user asks to keep it;
2. close any temporary CI PR without merge;
3. delete temporary CI branches when supported;
4. remove old temporary deployment links from the final user summary;
5. if an old separate temporary Vercel project exists, delete it only after the replacement preview game and AI Node Editor both work.

Never delete the permanent Git-connected Vercel project.

Old Preview deployments inside the permanent project may remain in deployment history or be removed by Vercel deployment-retention settings.

## 17. Main branch

`main` is outside normal feature workflow.

Never write, retarget a PR, merge or enable auto-merge without separate explicit user approval and `MAIN_GO_APPROVED_BY_USER: yes` where applicable.

## 18. Final report

Put this user-facing block first:

```text
Статус:
Что сделано:
Игра:
Редактор ИИ:
Что проверено:
Что осталось:
```

Technical fields may follow:

```text
feature_branch:
approved_feature_commit:
preview_commit:
transfer_method:
checks_run:
game_preview:
ai_node_editor_preview:
deployment_status:
deployed_commit:
live_test_status:
visual_qa_status:
feature_branch_cleanup:
legacy_temporary_vercel_project_cleanup:
permanent_vercel_project_touched: no
preview_touched:
main_touched:
```

Distinguish local checks, Vercel deployment, human live testing, direct browser and GitHub Actions evidence. Never claim one as another.
