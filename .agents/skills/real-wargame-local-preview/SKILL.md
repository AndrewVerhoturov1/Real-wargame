---
name: real-wargame-local-preview
description: "Use this skill whenever the user or task asks to run Real-Wargame locally, open the preview build, capture screenshots, show the game in chat, verify the visible PixiJS/Vite game screen, inspect a GitHub Actions screenshot artifact, or prepare terminal-free launch instructions. Triggers: run game, launch locally, preview, screenshot, screenshots, show me the game, open the game, Playwright, GitHub Actions artifact, local check, живой запуск, запусти игру, локально запустить, скриншоты, покажи игру."
license: MIT
---

# Real-Wargame local preview and screenshot workflow

Use this skill before any task that asks to launch Real-Wargame, show screenshots, verify a visible game screen, or prepare user-friendly local launch instructions.

The project is **Vite + TypeScript + PixiJS**, not Godot. Do not suggest Godot commands for this repository.

## Core rules

1. Work in `real-wargame-preview` first. Do not change `main` unless the user explicitly approves a merge.
2. If a check is run through GitHub Actions, say it was a CI/browser check, not a local PC check.
3. If a check is run on the user's PC or in a local checkout, say exactly which local command or `.bat` was used.
4. Do not ask the user to type terminal commands when a `.bat`, GitHub Actions artifact, or agent-run command can do the job.
5. Never claim screenshots were captured until the PNG artifact is downloaded or otherwise inspected.

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
playwright.config.ts
tests/preview-screenshots.spec.ts
docs/manual-test/PREVIEW_SCREENSHOTS.md
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

Expected launcher:

```text
Run-Real-Wargame.bat
```

The launcher should:

1. run from the repository root;
2. check `npm`;
3. run `npm install` if `node_modules` is missing;
4. start `npm run dev`;
5. open `http://127.0.0.1:5173/` in the browser;
6. avoid requiring the user to type Git or terminal commands.

If the local preview folder may be stale, first update/sync `Real-wargame-preview` from `origin/real-wargame-preview` using the repository's preview workflow. Do not tell the user that a GitHub push automatically updated their PC.

### Path B — remote screenshot check through GitHub Actions

Use when the user says “show me screenshots here”, “try it yourself”, “launch and show”, or when a browser screenshot is enough.

Current workflow:

```text
.github/workflows/preview-screenshots.yml
```

Current test:

```text
tests/preview-screenshots.spec.ts
```

Expected artifact:

```text
real-wargame-preview-screenshots
```

Expected PNGs:

```text
01-initial.png
02-selected-unit.png
03-move-order.png
04-after-movement.png
05-zoomed-map.png
```

The workflow opens the Vite app in Chromium with Playwright and uploads screenshots from `artifacts/screenshots/`.

#### Triggering the workflow

Preferred triggers:

1. a push to `real-wargame-preview` after a real preview change;
2. a PR whose base is `real-wargame-preview`.

If only a smoke trigger is needed and no real code change is required:

1. create a temporary branch from `real-wargame-preview`;
2. add or edit a clearly temporary smoke note under `docs/manual-test/`;
3. open a draft PR into `real-wargame-preview`;
4. wait for `Preview screenshots`;
5. download the artifact;
6. close the temporary PR without merging unless the user explicitly wants it kept.

Do not leave a smoke PR open without explaining why.

#### Reading the workflow result through GitHub tools

Use the GitHub Actions tools in this order when available:

```text
fetch_commit_workflow_runs
fetch_workflow_run_jobs
fetch_workflow_run_artifacts
download_workflow_artifact
```

If the workflow is still `queued` or `in_progress`, keep checking until the screenshots step succeeds or fails. If it fails, inspect the job steps and logs before changing files.

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
5. inspect `02-selected-unit.png` and `03-move-order.png`.

Example from the 2026-07-08 preview smoke: the preview scene had one `soldier_1` at grid cell `32,20`, so the test clicked `boardPoint(32, 20)`.

### 3. Browser install is slow

`npx playwright install --with-deps chromium` can take time in GitHub Actions. Do not assume it is stuck merely because that step runs longer than the others.

### 4. Artifact exists but screenshots are visually wrong

Download and inspect the PNGs. A successful workflow only means the browser/test ran; it does not prove the visual result is correct.

## Reporting format

When reporting a local/visual run, include:

```text
Branch: <branch>
Run type: local / GitHub Actions / reconstructed preview
Run id or PR: <id/link if available>
Build: passed / failed / not run
Screenshot capture: passed / failed
Artifact: <name/id if available>
Screenshots inspected: yes/no
What is visible:
- 01-initial.png: ...
- 02-selected-unit.png: ...
- 03-move-order.png: ...
Risks / not checked: ...
```

For the user, keep the explanation simple and show the PNGs or artifact link whenever possible.
