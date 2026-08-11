# Polygon Metrics Report Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the accepted Polygon Metrics/Report prototype by simplifying Report navigation to `Обзор / Измерения / Хронология`, preserve all accepted metrics/report-block behavior, store the exact accepted HTML in the Polygon subproject, update canonical subproject status, and transfer the verified commit into `real-wargame-preview` after the user's explicit GO.

**Architecture:** Keep the autonomous accepted HTML as the executable UX reference; do not promote it to simulation truth. The change is intentionally narrow: remove `Карта` and `Данные` from Report top-level navigation while retaining export/data support already reachable elsewhere, then record the prototype as the accepted Metrics reference in Polygon documentation. Work remotely on an isolated feature branch created from exact `real-wargame-preview` HEAD; do not touch `main` and do not deploy.

**Tech Stack:** Autonomous HTML/CSS/JavaScript prototype; repository documentation JSON/Markdown; GitHub contents API; local Node/Python/Chromium checks for the exact HTML artifact.

## Global Constraints

- Base branch: `real-wargame-preview` at `e212fcfbc2d6aa3cdee1c829fd3cf55a2310cfda`.
- Feature branch: `feature/20260811-polygon-metrics-report`.
- Do not modify `main`.
- Do not deploy to Vercel; transfer permission does not imply deployment permission.
- Preserve accepted `Редактор юнита`, `Редактор карты`, `Программа`, Program Anchors, all specialized Metrics groups, left-panel measurement cards, readable Report typography, and 8 analytical block types.
- Do not add Map as an analytical block.
- Report top navigation must contain exactly `Обзор`, `Измерения`, `Хронология`.
- Raw/LLM export remains available through `Экспорт`; table data remains available as an analytical block.

---

### Task 1: Streamline Report navigation and verify the exact artifact

**Files:**
- Source: local accepted `/mnt/data/polygon-metrics-constructor-v17-report-blocks.html`
- Create: local `/mnt/data/polygon-metrics-constructor-v18-report-streamlined.html`
- Test: local `/mnt/data/metrics_v4/test_metrics_report_v18_streamlined.py`

**Interfaces:**
- Consumes: accepted v17 Report shell and v17 report-block layer.
- Produces: v18 HTML with only the three approved Report top tabs.

- [ ] **Step 1: Write the failing regression test**

The test must assert the Report tab source contains `overview/Обзор`, `measurements/Измерения`, `timeline/Хронология`, and does not expose `map/Карта` or `data/Данные` in the top navigation array.

- [ ] **Step 2: Run the test against v17 and verify RED**

Run:

```bash
python /mnt/data/metrics_v4/test_metrics_report_v18_streamlined.py /mnt/data/polygon-metrics-constructor-v17-report-blocks.html
```

Expected: FAIL because v17 still exposes `Карта` and `Данные` as top-level Report tabs.

- [ ] **Step 3: Create v18 with the minimal navigation change**

Replace the Report tab registry:

```js
[['overview','Обзор'],['measurements','Измерения'],['timeline','Хронология'],['map','Карта'],['data','Данные']]
```

with:

```js
[['overview','Обзор'],['measurements','Измерения'],['timeline','Хронология']]
```

and make `body()` normalize legacy `map`/`data` state back to `overview` rather than rendering hidden top-level pages.

- [ ] **Step 4: Verify GREEN and regressions**

Run the new test, JavaScript syntax extraction/check, the existing v17 static/browser verification, and a focused browser smoke that opens Report and clicks all three tabs. Confirm there is no horizontal overflow at 1280×800.

- [ ] **Step 5: Compute artifact identity**

Record exact byte size and SHA-256 of v18 for canonical documentation.

---

### Task 2: Store the accepted Metrics prototype and update Polygon canonical status

**Files:**
- Create: `docs/subprojects/polygon-prototype/prototypes/polygon-metrics-constructor-v18-report-streamlined.html`
- Create: `docs/subprojects/polygon-prototype/ACCEPTED_METRICS_V18.md`
- Modify: `docs/subprojects/polygon-prototype/subproject.json`
- Modify: `docs/subprojects/polygon-prototype/STATUS.md`
- Modify: `docs/subprojects/polygon-prototype/SUBPROJECT.md`
- Modify: `docs/subprojects/polygon-prototype/JOURNAL.md`
- Modify: `docs/subprojects/index.json`

**Interfaces:**
- Consumes: exact verified v18 artifact identity.
- Produces: repository-owned accepted Metrics UX reference and synchronized current-status documentation.

- [ ] **Step 1: Commit the exact v18 HTML artifact to the feature branch**

Store the complete UTF-8 file without reconstruction or minification.

- [ ] **Step 2: Add `ACCEPTED_METRICS_V18.md`**

Document acceptance date, filename, size, SHA-256, scope of accepted Metrics work, Report navigation (`Обзор / Измерения / Хронология`), 8 report block types, and the boundary that this prototype is UX/reference data collection UI rather than simulation truth.

- [ ] **Step 3: Update canonical Polygon metadata**

Set `updated_at` to `2026-08-11`; mark `Метрики` as accepted alongside Unit/Map/Program; change next step to remaining `Серия`, `Журнал`, and unfinished common shell; add the accepted Metrics document/artifact to `main_files` and `must_read_first`; remove the obsolete safety statement saying Metrics is not ready while keeping Series/Journal not-ready.

- [ ] **Step 4: Synchronize generated status representations manually in remote-only mode**

Mirror the intended `subproject.json` values into `STATUS.md` and the Polygon entry in `docs/subprojects/index.json`. Update `SUBPROJECT.md` and append a dated journal entry describing the accepted Metrics work.

- [ ] **Step 5: Review the feature-branch diff**

Use base-to-head comparison and verify no unrelated files, no `main`, no deployment configuration, and no simulation/runtime source changes are included.

---

### Task 3: Transfer the accepted feature commit into preview

**Files:** no additional product files; Git refs only.

**Interfaces:**
- Consumes: verified feature-branch HEAD and the user's explicit transfer permission from the current conversation.
- Produces: `real-wargame-preview` fast-forwarded to the same verified commit.

- [ ] **Step 1: Resolve fresh heads before transfer**

Verify `real-wargame-preview` has not moved away from the task base unexpectedly and resolve exact feature HEAD.

- [ ] **Step 2: Fast-forward `real-wargame-preview` to feature HEAD**

Use a non-force ref update only.

- [ ] **Step 3: Verify transferred files on `real-wargame-preview`**

Fetch the accepted document/artifact metadata and confirm the preview branch points to the feature commit.

- [ ] **Step 4: Report without deployment claims**

Report feature branch, current commit, checks run, no performance impact (autonomous docs prototype only), deployment not requested/not run, preview touched yes, main touched no.
