---
name: real-wargame-local-preview
description: "Use this skill whenever the user or task asks to run Real-Wargame locally, open the preview build, capture screenshots, show the game in chat, verify the visible PixiJS/Vite game screen, inspect a GitHub Actions screenshot artifact, or prepare terminal-free launch instructions. Triggers: run game, launch locally, preview, screenshot, screenshots, show me the game, open the game, Playwright, GitHub Actions artifact, local check, visual QA, реальный запуск, живой запуск, запусти игру, локально запустить, скриншоты, покажи игру, проверь глазами, суррогат не считается."
license: MIT
---

# Real-Wargame local preview and screenshot workflow

Use this skill before any task that asks to launch Real-Wargame, show screenshots, verify a visible game/editor screen, or prepare user-friendly local launch instructions.

The project is **Vite + TypeScript + PixiJS**, not Godot. Do not suggest Godot commands for this repository.

## Hard rule: no surrogate preview

A surrogate preview is **forbidden**.

Do **not** treat any of the following as a successful visual run:

```text
reading HTML/CSS/TS files only;
rendering a reconstructed or simplified HTML page;
opening a hand-written mockup instead of the real Vite app;
inspecting code and claiming what the screen should look like;
using screenshots from an old run after new UI changes;
checking only workflow status without downloading/inspecting PNGs;
claiming success because Playwright tests exist but were not run;
claiming success because a PR/workflow was created but remains queued/in_progress.
```

A successful preview check requires a **real application run**:

```text
real repo checkout/ref;
npm install/npm ci;
Vite app served;
real browser/Chromium opened by Playwright or user's PC browser;
real route opened, for example / or /ai-node-editor.html;
PNG screenshots captured from that real browser;
PNG screenshots downloaded or otherwise inspected after capture.
```

If the task asks for screenshots, visual QA, or “try it yourself”, do not stop at a surrogate. Keep working through the available real-run paths until one succeeds or until all practical paths are explicitly exhausted and reported.

## Core rules

1. Work in `real-wargame-preview` first. Do not change `main` unless the user explicitly approves a merge.
2. If a check is run through GitHub Actions, say it was a CI/browser check, not a local PC check.
3. If a check is run on the user's PC or in a local checkout, say exactly which local command or `.bat` was used.
4. Do not ask the user to type terminal commands when a `.bat`, GitHub Actions artifact, or agent-run command can do the job.
5. Never claim screenshots were captured until the PNG artifact is downloaded or otherwise inspected.
6. Never claim a visual issue is fixed until at least one real screenshot run has been completed after the fix, or clearly state that it still needs manual visual verification.
7. If GitHub Actions is used only as a visual QA harness, close any temporary PR/branch after the needed screenshots are captured, unless the user asks to keep it.
8. If the user explicitly says screenshots are not needed, do not create a temporary screenshot PR or run screenshot workflows just for routine verification. Use code review, static smoke tests, build/status checks, and clearly say that visual verification was skipped by request.

## Screenshot discipline

Use screenshots only when they materially answer the user's request or when a visual/UI change cannot be trusted without seeing it.

Do **not** spend time triggering screenshot workflows for every ordinary code/data change. For non-visual changes, prefer:

```text
npm/build/smoke checks;
engine smoke;
static editor smoke;
GitHub code search for removed/renamed node types;
manual check instructions.
```

If the user later says screenshots are optional or unnecessary:

```text
stop new screenshot-trigger work;
do not open new temporary visual-QA PRs;
finish/close already-created temporary PRs when safe;
report that the change is not visually verified after that point.
```

If screenshots are still required, every screenshot claim must include whether PNGs were actually downloaded/inspected.

## Read first

For local/visual preview tasks, read only the minimum needed context:

```text
AGENTS.md
README.md
package.json
index.html
src/main.ts
src/data/units/test_units.json
.github/workflows/preview-screenshots.yml
.github/workflows/preview-policy.yml
playwright.config.ts
tests/preview-screenshots.spec.ts
docs/manual-test/PREVIEW_SCREENSHOTS.md
```

For AI Node Editor visual tasks, also read:

```text
ai-node-editor.html
src/ai-node-editor/main.ts
src/ai-node-editor/ai-node-editor.css
src/ai-node-editor/ai-node-editor-authoring.css
src/ai-node-editor/ai-node-editor-visual-fix.css
src/ai-node-editor/human-node-ui.ts
src/ai-node-editor/human-node-ui.css
scripts/local_ai_engine.mjs
scripts/ai_engine_core.mjs
Run-AI-Node-Editor.bat
docs/manual-test/AI_NODE_EDITOR_STAGE_4.md
```

If the visual issue concerns rendering, also read the specific renderer file, for example:

```text
src/rendering/PixiMapRenderer.ts
src/rendering/PixiUnitRenderer.ts
src/rendering/PixiOrderRenderer.ts
src/rendering/PixiOverlayRenderer.ts
src/rendering/terrainStyle.ts
```

## Launch paths

### Path A — user-friendly local launch on the user's PC

Use when the user wants to play/check the game personally.

Expected launcher for the tactical board:

```text
Run-Real-Wargame.bat
```

Expected launcher for AI Node Editor:

```text
Run-AI-Node-Editor.bat
```

The launcher should:

1. run from the repository root;
2. check `npm`;
3. run `npm install` if `node_modules` is missing;
4. start the needed local service, for example `npm run dev` and, for AI Node Editor, `npm run engine:dev`;
5. open the correct real route in the browser, for example `http://127.0.0.1:5173/` or `http://127.0.0.1:5173/ai-node-editor.html`;
6. avoid requiring the user to type Git or terminal commands.

If the local preview folder may be stale, first update/sync `Real-wargame-preview` from `origin/real-wargame-preview` using the repository's preview workflow. Do not tell the user that a GitHub push automatically updated their PC.

### Path B — remote screenshot check through GitHub Actions

Use when the user says “show me screenshots here”, “try it yourself”, “launch and show”, “проверь глазами”, or when a browser screenshot is enough.

Current screenshot workflow:

```text
.github/workflows/preview-screenshots.yml
```

Current visual-policy workflow may also run screenshot QA:

```text
.github/workflows/preview-policy.yml
```

Current test:

```text
tests/preview-screenshots.spec.ts
```

Expected artifact names may include:

```text
real-wargame-preview-screenshots
real-wargame-visual-qa-screenshots
```

Expected PNGs for tactical board and AI Node Editor may include:

```text
01-initial.png
02-real-relief-overlay.png
03-selected-unit.png
04-layers-tab-knowledge-overlay.png
05-alt-line-of-sight.png
06-move-order.png
07-editor-mode.png
08-ai-editor-initial-compact.png
09-ai-editor-palette-open.png
10-ai-editor-node-added.png
11-ai-editor-fit-view.png
12-ai-editor-drag-link-created.png
13-ai-editor-context-menu.png
14-ai-editor-auto-check-result.png
15-universal-threshold-danger-interface.png
16-universal-threshold-tooltip-after-hover.png
17-universal-threshold-changed.png
18-universal-threshold-saved.png
19-existing-stress-uses-universal-threshold.png
20-existing-stress-universal-threshold-changed.png
```

The workflow must open the real Vite app in Chromium with Playwright and upload screenshots from `artifacts/screenshots/`.

#### Triggering the workflow

Preferred triggers:

1. a push to `real-wargame-preview` after a real preview change;
2. a PR whose base is `real-wargame-preview`.

If only a smoke trigger is needed and no real code change is required:

1. create a temporary branch from `real-wargame-preview`;
2. add or edit a clearly temporary smoke note under `docs/manual-test/` or update the screenshot test only if that change itself is useful;
3. open a draft PR into `real-wargame-preview`;
4. if draft PRs do not trigger the desired workflow, mark it ready for review or create a normal temporary PR with a clear “do not merge” body;
5. wait for the real screenshot workflow;
6. download the artifact;
7. inspect the PNGs;
8. close the temporary PR without merging unless the user explicitly wants it kept;
9. delete any temporary trigger file that was accidentally committed to `real-wargame-preview`.

Do not leave a smoke PR open without explaining why.

#### Reading the workflow result through GitHub tools

Use the GitHub Actions tools in this order when available:

```text
fetch_commit_workflow_runs
fetch_workflow_run_jobs
fetch_workflow_job_steps
fetch_workflow_job_logs
fetch_workflow_run_artifacts
download_workflow_artifact
```

If the workflow is still `queued` or `in_progress`, keep checking until the screenshots step succeeds or fails. If it fails, inspect the job steps and logs before changing files.

A queued workflow is not success. A created PR is not success. A green status is not enough unless the PNG artifact exists and has been inspected.

## Known failure modes and fixes

### 1. Build fails before screenshots

For screenshot capture, `npm run build` is useful but should not block the visual run. The workflow may use:

```yaml
- name: Check production build without blocking screenshots
  continue-on-error: true
  run: npm run build
```

This lets the Playwright screenshot step run even if TypeScript build validation fails. In the report, clearly say whether the build passed or failed.

### 2. Screenshots show the map but not selection/order

The click target in `tests/preview-screenshots.spec.ts` probably no longer matches `src/data/units/test_units.json`.

Fix sequence:

1. read `src/data/units/test_units.json` on the same branch being tested;
2. find the current unit coordinates;
3. update the Playwright test's click coordinates;
4. rerun the workflow;
5. inspect the selected-unit and move-order PNGs.

Example from the 2026-07-08 preview smoke: the preview scene had one `soldier_1` at grid cell `32,20`, so the test clicked `boardPoint(32, 20)`.

### 3. Browser install is slow

`npx playwright install --with-deps chromium` can take time in GitHub Actions. Do not assume it is stuck merely because that step runs longer than the others.

### 4. Artifact exists but screenshots are visually wrong

Download and inspect the PNGs. A successful workflow only means the browser/test ran; it does not prove the visual result is correct.

If the PNGs show a real problem, fix the code and rerun the real screenshot workflow. Do not stop at “workflow passed”.

### 5. GitHub Actions screenshot workflow is queued too long

A queued run is not a completed visual check. Options:

1. wait and poll again;
2. inspect whether another workflow, such as `Preview Policy`, can run the same real Playwright screenshot test;
3. if a temporary PR was used only to trigger a run, keep it clearly marked and close it after the artifact is captured;
4. report the exact run state if all practical routes are exhausted.

Do not replace this with an HTML surrogate.

### 6. AI Node Editor visual QA

For AI Node Editor, a valid screenshot run should prove at least:

```text
/ai-node-editor.html opens in the real Vite app;
local AI engine is running on 127.0.0.1:8787;
canvas and real graph nodes are visible;
+ Add node opens the real palette;
a new node can be added;
Fit/zoom/pan controls are visible;
drag-link through node port can be exercised or captured;
context menu opens from a real node;
Auto 4-5 produces Point 4 OK and Point 5 OK in a real browser screenshot.
```

### 7. Stale AI Node Editor localStorage

The browser may keep an old graph in localStorage even after the repository graph was changed. This can make old nodes or old parameters appear after a correct code update.

Fix sequence:

```text
manual: press Reset in AI Node Editor;
Playwright: use page.addInitScript(() => window.localStorage.clear()) before page.goto('/ai-node-editor.html');
code: if a helper module reads graph storage before main.ts writes it, bootstrap graph storage from src/data/ai/soldier_default_survival_graph.json in ai-node-editor.html before loading the helper module.
```

Always mention this risk when changing bundled AI graph data or node types.

### 8. Language-dependent UI selectors

The AI Node Editor can show Russian or English labels. Playwright selectors must handle both, especially after the human UI language toggle changes text.

Prefer selectors like:

```ts
page.getByRole('button', { name: /\+ Add node|\+ Добавить ноду/ })
page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ })
```

Do not assume a button remains English after `human-node-ui.ts` applies the selected language.

### 9. Range sliders and hover can be flaky

Hovering directly over `<input type="range">` may be unstable because the browser thumb position and element geometry differ. If testing tooltips, hover a stable wrapper such as `.human-control` that contains the slider.

For changing slider values in Playwright, set the value and dispatch an input event:

```ts
await page.locator('.human-threshold-slider').evaluate((element) => {
  const input = element as HTMLInputElement;
  input.value = '45';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
```

### 10. Human UI helper can read graph storage too early

`human-node-ui.ts` reads graph/node data from localStorage to render human panels. If Playwright clears localStorage before opening the editor, the helper can see an empty graph unless storage is bootstrapped.

Current expected fix: `ai-node-editor.html` should load bundled graph JSON and populate `real-wargame.ai-node-editor.graph.v5` before loading `human-node-ui.ts`, while `main.ts` remains the owner of the real editor state.

### 11. Temporary visual-QA branches and trigger files

It is easy to create too many temporary PRs or accidentally commit a trigger file to `real-wargame-preview` while trying to start a workflow.

Rules:

```text
create the temporary branch first;
verify the branch exists before create_file;
write trigger files only to the temporary branch;
if a trigger lands in real-wargame-preview by mistake, delete it immediately;
close old queued/failed temporary PRs after a newer run supersedes them;
state clearly which PR/run is the active one.
```

### 12. GitHub connector / CI limitations

The GitHub connector may not expose every local operation. If direct local checkout or internet access is unavailable, use repository files plus GitHub Actions rather than pretending to have run local commands.

If `fetch_commit_workflow_runs` only returns PR-triggered runs, use the PR head commit and the PR workflow run. If direct push runs are not visible through the connector, do not infer success from absence of results.

## Reporting format

When reporting a local/visual run, include:

```text
Branch: <branch>
Run type: local / GitHub Actions / user PC
Run id or PR: <id/link if available>
Build: passed / failed / not run / continue-on-error failed
Screenshot capture: passed / failed / skipped by user request
Artifact: <name/id if available>
Screenshots inspected: yes/no/not requested
What is visible:
- 01-initial.png: ...
- 08-ai-editor-initial-compact.png: ...
- 12-ai-editor-drag-link-created.png: ...
- 14-ai-editor-auto-check-result.png: ...
Surrogate used: no / yes, and if yes it is not counted as success
Risks / not checked: ...
```

For the user, keep the explanation simple and show the PNGs or artifact link whenever possible, unless the user said screenshots are not needed.
