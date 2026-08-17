# Polygon Six-X Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать шесть X-веток в один технически цельный preview-кандидат и закрыть два отсутствующих integration seam.

**Architecture:** Сохраняются все существующие product owners. Интеграция добавляет только wiring между уже реализованными right-panel views, context-menu routes и существующими shell/editor APIs; `main.ts` сводится без нового runtime.

**Tech Stack:** TypeScript, Vite, PixiJS 8, DOM UI, GitHub Actions.

## Global Constraints

- База: `real-wargame-preview @ 8292bf25bf241712901090fcb565dded939e7a08`.
- Не менять исходные executor branches.
- Не merge в `real-wargame-preview`.
- Не deploy до отдельной команды пользователя.
- Не создавать второй runtime, selection store, renderer, command path или editor registry.
- Browser/screenshot QA отложена; кодовые проверки обязательны.

---

### Task 1: Compose six executor results

**Files:** все changed files PR #283–#288.

- [ ] Перенести КАРТУ.
- [ ] Перенести ПЕШКУ.
- [ ] Перенести ПУЛЬС.
- [ ] Перенести ЛИНЗУ.
- [ ] Перенести РЕДАКТОРЫ.
- [ ] Перенести КОНТЕКСТ.
- [ ] Разрешить только реальные merge conflicts, не переписывая domain logic.

### Task 2: Add failing integration contract for right panel

**Files:**
- Create: `scripts/polygon_six_x_integration_smoke.mjs`
- Modify after RED: `src/combat-lab/main.ts` and/or focused integration helper.

**Interfaces:**
- Consumes: `CombatLabRightPanelSeam`, `PolygonRightPanelLiveView`.
- Produces: mounted LIVE Info/Attention/Memory using the same seam/state/selection.

- [ ] Добавить source-level smoke, который требует импорта/монтажа ЛИНЗЫ из интеграционного entry path.
- [ ] Запустить CI и подтвердить RED на отсутствии hook.
- [ ] Добавить минимальный hook.
- [ ] Повторно запустить smoke до GREEN.

### Task 3: Add failing integration contract for entity routes

**Files:**
- Modify: `scripts/polygon_six_x_integration_smoke.mjs`
- Modify after RED: existing context installation/wiring entry point.

**Interfaces:**
- Consumes: `EntityContextMenu` callbacks `openPanel`/`openEditor`, right-panel seam, existing editor-open API.
- Produces: real navigation callbacks for Unit/Info/Attention/Memory/Edit.

- [ ] Расширить smoke требованиями реальных callbacks.
- [ ] Подтвердить RED на отсутствующем wiring.
- [ ] Передать callbacks без DOM selectors/fake fallback.
- [ ] Подтвердить GREEN.

### Task 4: Verify combined candidate

**Files:** no product changes unless a test identifies a concrete integration defect.

- [ ] `git diff --check` equivalent in CI.
- [ ] `npm run typecheck`.
- [ ] `npm run build`.
- [ ] Existing focused smoke for map/unit/live-unit/LINZA/editors/context where available.
- [ ] New `polygon_six_x_integration_smoke.mjs`.
- [ ] Record exact final SHA and remaining non-visual blockers.

### Task 5: Publish integration PR

- [ ] Open one PR from `feature/20260817-polygon-six-x-integration` to `real-wargame-preview`.
- [ ] Do not merge or enable auto-merge.
- [ ] Report exact SHA, checks and whether the branch is ready for preview deployment.