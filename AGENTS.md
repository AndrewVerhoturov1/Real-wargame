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

Machine-readable state:

```text
docs/ai/repo-context.json
```

Canonical delivery route:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## 2. Communication with the user

The user must be addressed in simple Russian, as an intelligent high-school student.

Mandatory rules:

- put the practical result first;
- use ordinary Russian words;
- avoid unnecessary English terms and abbreviations;
- when a technical English term is unavoidable, explain it once in simple Russian;
- do not overload the user with internal process, long hashes or raw diagnostics before the useful result;
- do not require the user to operate Git or a terminal when the agent can do it;
- use clickable links;
- when screenshots exist, show the most useful screenshots directly and provide the full artifact separately.

## 3. Minimal reading route

Read in this order:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant skill from `docs/ai/SKILLS_INDEX.md`.

For runtime-affecting work also read:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

Do not read every journal, plan or historical handoff by default.

## 4. Canonical feature route

Every implementation task follows:

```text
user task
→ resolve the exact current real-wargame-preview head
→ create one feature branch from that exact commit
→ implement, test, commit and push on the feature branch
→ Vercel automatically creates or updates the branch Preview
→ report direct links for the game and AI Node Editor
→ user performs live testing
→ fix reported product defects on the same feature branch
→ explicit user GO for the exact accepted commit
→ transfer the accepted result into real-wargame-preview
→ wait for the new preview deployment
→ verify both required pages
→ clean up the feature branch and any legacy temporary Vercel project
```

Codex is not a required deployment step. It may be used as an optional coding or analysis helper only when the user chooses it. Do not make Codex a delivery gate.

## 5. Required deployed pages

Every local production build, Vercel Preview and production deployment must contain:

```text
/                     → index.html
/ai-node-editor.html  → ai-node-editor.html
```

`npm run build` must fail when either page is missing.

A branch is not ready for live testing until both links are available or the deployment failure is reported honestly.

## 6. Vercel policy

Use one permanent Vercel project connected to the GitHub repository.

Mandatory rules:

- every push to a non-production branch creates or updates a Preview deployment automatically;
- do not create a separate Vercel project for each feature branch;
- do not delete the permanent Git-connected project during normal work;
- do not ask the user or Codex to redeploy after every push;
- verify the deployment commit when exact identity matters;
- report both the game URL and the AI Node Editor URL.

Cleanup after accepted transfer:

1. transfer the accepted commit into `real-wargame-preview` only after explicit user GO;
2. wait until the `real-wargame-preview` deployment is Ready;
3. open `/` and `/ai-node-editor.html`;
4. delete the feature branch unless the user asks to keep it;
5. if an old separate temporary Vercel project exists, delete it only after both replacement pages work;
6. never delete the permanent Git-connected Vercel project.

Old Preview deployments may be removed manually or by Vercel deployment-retention settings.

## 7. Branch policy

```text
base: real-wargame-preview
head: feature/YYYYMMDD-short-kebab-slug
```

Mandatory rules:

- do not implement directly on `real-wargame-preview`;
- do not push unaccepted product work to preview;
- keep all product fixes on the same feature branch;
- do not create a new feature branch for every reported defect;
- do not transfer before explicit user GO;
- do not write to `main` without separate explicit human GO;
- do not open or retarget a PR to `main` without `MAIN_GO_APPROVED_BY_USER: yes`;
- do not merge without explicit human GO;
- do not enable auto-merge.

A PR is not the default feature-delivery route. Use it only when the user requests review/transfer or repository protection makes it necessary.

## 8. Focused non-browser verification

Before reporting a branch ready for live testing, run the smallest sufficient matrix:

```text
TypeScript check
+ focused smoke tests for the changed subsystem
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

The production build already verifies both required HTML pages.

Do not run by default every smoke test, broad matrices, Chromium, Playwright, unjustified performance workflows, GitHub Actions or duplicate builds.

When local Node commands are unavailable, report that honestly. A small non-browser Actions check is an optional fallback only with user approval.

## 9. User-facing readiness report

Start with this practical block:

```text
Статус:
Что изменилось:
Игра: <clickable URL>
Редактор ИИ: <clickable URL>/ai-node-editor.html
Ветка:
Коммит:
Что проверить:
```

Then add only the technical detail that is useful for the current decision.

Do not start with long hashes, workflow IDs or internal terminology.

## 10. Human live test

The user opens both branch Preview pages and checks task-specific behavior.

Baseline:

1. the game page loads;
2. the canvas renders;
3. the changed game behavior works;
4. `ai-node-editor.html` loads;
5. the editor controls needed by the task work;
6. no new visible artifacts appear;
7. no new obvious errors appear.

Do not require a full-project manual regression for every focused change.

## 11. Same-branch correction loop

When the user reports a product defect:

1. stay on the same feature branch;
2. reproduce the problem;
3. add or update focused regression coverage when practical;
4. fix product code there;
5. rerun focused checks;
6. commit and push the same branch;
7. let Vercel update automatically;
8. report the new exact commit and the same two Preview links.

## 12. Optional visual verification

Visual/browser/screenshot/Playwright execution requires explicit user intent. The user does not need to name a skill.

Examples that count as approval:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь живой Vercel Preview
```

Route selection:

```text
direct controlled browser available
→ use .agents/skills/real-wargame-local-preview/SKILL.md

direct controlled browser unavailable
→ use .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

The deployed-Vercel CI route must use temporary `ci/**` branches and a temporary PR that is never merged. Product fixes stay on the canonical feature branch. New product SHA invalidates previous visual acceptance evidence.

Never commit Vercel share tokens, bypass secrets or protected URLs containing secrets.

Canonical visual policy:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## 13. Visual evidence presentation

A green workflow alone is not visual proof.

When visual evidence exists:

- inspect `evidence.json`;
- open and inspect key PNGs;
- show the most useful screenshots directly to the user;
- provide clickable links to the Preview, workflow run and complete artifact;
- explain failures in simple Russian;
- place raw IDs and detailed diagnostics after the practical result.

Visual success does not grant transfer permission. Transfer still requires separate explicit user GO for the exact accepted commit.

## 14. Transfer into real-wargame-preview

Before transfer:

1. confirm the exact approved feature commit;
2. check whether the feature branch must be updated from current preview;
3. resolve conflicts on the feature branch;
4. rerun focused checks required by the final diff;
5. transfer the accepted result;
6. report the resulting preview commit;
7. wait for automatic Vercel deployment;
8. verify `/` and `/ai-node-editor.html`;
9. perform cleanup described in section 6.

## 15. Main branch

`main` is outside normal feature work.

Never write, retarget a PR, merge or enable auto-merge without separate explicit user approval.

## 16. Architecture and performance boundaries

- core simulation and pure AI do not import PixiJS or DOM;
- renderers display state and are not gameplay truth;
- subjective knowledge does not reveal objective hidden state;
- UI layers do not own gameplay computation;
- full-map scans, queues and recurring work are bounded;
- asynchronous results use exact identity and stale-result rejection.

For runtime-affecting work use:

```text
.agents/skills/real-wargame-performance/SKILL.md
docs/performance/PERFORMANCE_PRINCIPLES.md
```

## 17. Current-status documentation

Edit current state only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run `npm run docs:sync`. Do not edit generated files manually except when reproducing the exact generator output in an environment where generation cannot run.

## 18. Prohibited legacy routes

Do not reintroduce:

- direct product implementation in preview;
- PR-first feature development;
- mandatory Codex deployment;
- a separate Vercel project per feature branch;
- deletion of the permanent Git-connected Vercel project;
- automatic browser checks on every push;
- product fixes on temporary CI branches;
- committed Vercel secrets;
- reuse of visual evidence after product SHA changes;
- transfer before explicit user GO.

## 19. Required final report

The practical user-facing summary comes first. Technical fields may follow when relevant:

```text
feature_branch:
base_commit:
current_commit:
checks_run:
game_preview:
ai_node_editor_preview:
deployment_status:
live_test_status:
visual_qa_status:
preview_transfer_approval:
preview_touched:
main_touched:
feature_branch_cleanup:
legacy_temporary_vercel_project_cleanup:
```

Explain the result in simple Russian.
