# Shared Game Editors and Combat Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent mode strip with a common modal menu, create one mountable game-editor platform, add the missing authoritative tuning editors and expose the same editors from Combat Lab without duplicated state.

**Architecture:** Work proceeds in two waves. Wave 1 establishes the shared shell/overlay contract and the shared editor platform on separate branches. The orchestrator integrates both into the acceptance branch and publishes an exact Wave 2 Foundation SHA. Wave 2 adds new tuning editors and Combat Lab integration in parallel. A final compiler branch integrates Wave 2, fixes integration defects, runs the canonical gate, performs performance/design/browser audits and returns one candidate commit to the orchestrator.

**Tech Stack:** TypeScript 5, Vite 5, PixiJS 8, DOM APIs, existing profile registries, Node smoke/contract scripts, Playwright/Chromium only after explicit visual approval already granted for this task.

## Global Constraints

- Repository: `AndrewVerhoturov1/Real-wargame`.
- Final target branch: `feature/20260731-combat-lab-user-acceptance-fixes`.
- Never modify `main` or `real-wargame-preview`.
- Never deploy from worker branches.
- Never create a second composition root, Combat Lab draft, visual controller, batch pipeline, simulation loop or graph storage.
- Preserve simulation ownership and deterministic profile revision semantics.
- Core modules must not import DOM, browser storage or editor modules.
- Hidden editors perform no recurring work.
- Quick parameters remain experiment-local overrides.
- Add failing regression coverage before implementation changes.
- Do not weaken existing tests or performance thresholds.
- Worker branches are append-only after publication; no force-push.
- Every worker reports `READY FOR ORCHESTRATOR`, `BLOCKED` or `FAIL` with exact commands and commit SHAs.

---

## File and ownership map

### Worker 1: common shell and overlay

Primary ownership:

- `src/shared/AppShellMenu.ts`
- `src/shared/app-shell-menu.css` or a focused replacement style module
- `src/shared/app-overlay/AppOverlayCoordinator.ts`
- `src/shared/app-overlay/AppModalLayer.ts`
- shell contract tests in `scripts/`

Worker 1 must not modify game-editor registries, Combat Lab workspace tabs or profile editors.

### Worker 2: shared game-editor platform and current editors

Primary ownership:

- `src/game-editors/GameEditorTypes.ts`
- `src/game-editors/GameEditorRegistry.ts`
- `src/game-editors/GameEditorWorkspace.ts`
- `src/game-editors/createDefaultGameEditorRegistry.ts`
- `src/game-editors/game-editor-workspace.css`
- `src/ai-node-editor/AiEditorSectionRegistry.ts`
- existing editor integration/panel modules under `src/ai-node-editor/`
- `ai-node-editor.html` only for required module/style entry cleanup
- registry and editor-host contract tests

Worker 2 must not modify Combat Lab workspace code or add new gameplay profile domains.

### Worker 3: new authoritative tuning editors

Primary ownership:

- new core profile modules for perception, soldier archetypes and wound/suppression tuning
- their normalization, registry, runtime snapshot and storage adapters
- new editor panels/definitions under `src/game-editors/editors/`
- focused runtime migration tests and editor contract tests

Worker 3 must not modify the common menu, Combat Lab layout or batch runtime.

### Worker 4: Combat Lab integration

Primary ownership:

- `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`
- `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`
- new `src/combat-lab/game-editors/` integration modules
- selected-unit profile links in the existing parameters presentation
- Combat Lab UI/interaction contract tests

Worker 4 consumes the common overlay and game-editor registry. It must not copy editor panels or profile values.

### Final compiler

Primary ownership:

- integration conflict resolution;
- cross-cutting styles and composition entrypoints;
- combined regression corrections;
- performance/design/browser evidence;
- final canonical gate.

The compiler does not redesign accepted interfaces unless integration proves an explicit contradiction. Any contract change must be documented in the final report.

---

## Wave 0: orchestration preparation

- [x] **Step 1: Record the approved design**

Create `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`.

- [x] **Step 2: Create this implementation plan**

Create `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`.

- [ ] **Step 3: Add four worker prompts and one compiler prompt**

Create the exact files listed in the launch section below.

- [ ] **Step 4: Verify the orchestration-only branch diff**

Run or remotely inspect:

```bash
git diff --check 6220ba65de584239612600ae2ec025363137e09f..HEAD
git diff --name-only 6220ba65de584239612600ae2ec025363137e09f..HEAD
```

Expected: only planning/specification/prompt Markdown files.

- [ ] **Step 5: Publish the Wave 1 Foundation SHA**

The exact acceptance-branch HEAD after all orchestration files are committed is the Wave 1 Foundation SHA. Both Wave 1 workers must verify it before changes.

---

## Wave 1: parallel foundations

### Task 1: Worker 1 — common menu and overlay coordinator

**Interfaces:**

- Produces one common overlay coordinator with deterministic `Escape` priority.
- Produces a modal layer helper used later by Combat Lab.
- Preserves existing mode navigation and shutdown behavior.

- [ ] **Step 1: Write failing shell contract tests**

Tests must prove:

- one compact menu trigger exists;
- the permanent mode strip is absent;
- menu opens and closes;
- current mode is marked;
- `Escape` opens the menu only when no higher layer is active;
- `Escape` closes the highest registered layer first;
- focus returns to the trigger;
- background becomes non-interactive while modal is open;
- listener teardown is symmetric.

- [ ] **Step 2: Run focused tests and record expected failure**

Use the exact new shell smoke command plus existing UI contract commands that touch `installAppShellMenu`.

- [ ] **Step 3: Implement the overlay coordinator and modal layer**

Required public behavior:

```ts
interface AppOverlayHandle {
  readonly priority: number;
  close(): void;
  destroy(): void;
}

interface AppOverlayCoordinator {
  openModal(options: AppModalOptions): AppOverlayHandle;
  registerDismissLayer(options: DismissLayerOptions): () => void;
  hasOpenLayer(): boolean;
  destroy(): void;
}
```

The implementation may refine names but must preserve one coordinator and one document-level keyboard listener.

- [ ] **Step 4: Convert AppShellMenu to the modal representation**

Preserve the three mode routes and exit behavior. Remove permanent top-offset compensation from the modes.

- [ ] **Step 5: Verify desktop and reduced-width layout contracts**

No permanent strip may reserve 54–104 pixels above the application.

- [ ] **Step 6: Run focused tests and TypeScript**

Minimum:

```bash
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run editor:smoke
npm run build
```

Run the new shell contract command explicitly.

- [ ] **Step 7: Commit and report**

Suggested commit structure:

```text
test(shell): define common overlay and escape contract
feat(shell): replace permanent mode strip with modal menu
```

### Task 2: Worker 2 — shared game-editor platform

**Interfaces:**

- Produces typed definitions, a registry and a mountable workspace.
- Migrates all nine existing editor capabilities.
- Makes the AI editor consume the shared platform.
- Does not mount editors in Combat Lab.

- [ ] **Step 1: Write failing registry and host contracts**

Tests must prove:

- no duplicate IDs;
- deterministic group/order sorting;
- explicit host mounting;
- surface-specific activation;
- route activation for the graph in Combat Lab;
- `beforeClose` refusal;
- idempotent teardown;
- no global host query inside migrated editor modules;
- all nine existing editor IDs registered exactly once.

- [ ] **Step 2: Implement the shared types and registry**

Create focused files under `src/game-editors/` and keep them independent from Combat Lab.

- [ ] **Step 3: Implement the reusable workspace host**

The workspace owns active installation lifecycle. Switching sections must call `beforeClose`, deactivate/destroy the previous installation and mount the next into the supplied host.

- [ ] **Step 4: Migrate old editor integrations**

Convert page-global installers into explicit definitions/installations. Preserve current validation, persistence and import/export behavior.

- [ ] **Step 5: Restore the existing environment profile editor to the visible registry**

Use the existing `EnvironmentProfileEditorPanel` and storage/runtime foundation. Do not create a replacement.

- [ ] **Step 6: Rebuild AI editor navigation on the shared registry**

Remove duplicate application actions that are now owned by the common game menu. Preserve graph workspace, palette, inspector and graph storage.

- [ ] **Step 7: Run focused editor checks**

Minimum:

```bash
npm run typecheck
npm run editor:smoke
npm run graph-v2:smoke
npm run movement-profiles:smoke
npm run combat-catalog-editor:smoke
npm run attention-profiles:smoke
npm run directional-terrain:smoke
npm run environment-materials:smoke
npm run build
```

Also run the new game-editor registry/host contract command.

- [ ] **Step 8: Commit and report**

Suggested commit structure:

```text
test(editors): define shared registry and lifecycle contract
refactor(editors): mount existing editors through one platform
```

---

## Wave 1 integration checkpoint

The orchestrator performs this checkpoint after both workers return `READY FOR ORCHESTRATOR`.

- [ ] **Step 1: Verify each worker started at the Wave 1 Foundation SHA**

Reject branches with an unrelated base or changes outside ownership.

- [ ] **Step 2: Review worker diffs independently**

Confirm Worker 1 did not introduce editor/platform code and Worker 2 did not introduce a second overlay/menu.

- [ ] **Step 3: Integrate Worker 1, then Worker 2 into the acceptance branch**

Resolve only genuine composition/style conflicts. Do not squash away meaningful regression commits after published review has begun.

- [ ] **Step 4: Run Wave 1 foundation checks**

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run editor:smoke
npm run combat-lab-ui-contract:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Run both new focused contract commands.

- [ ] **Step 5: Publish exact Wave 2 Foundation SHA**

Worker 3, Worker 4 and the final compiler all use this exact commit as their base.

---

## Wave 2: parallel product integration

### Task 3: Worker 3 — new tuning editors

**Consumes:** shared game-editor interfaces from the Wave 2 Foundation SHA.

**Produces:** three versioned authoritative profile domains and three registered editor definitions.

- [ ] **Step 1: Inventory current authoritative inputs**

Map every proposed field to an existing runtime consumer. Record the mapping in tests or focused architecture documentation inside the branch. Remove fields with no current consumer.

- [ ] **Step 2: Write failing core profile tests**

For each domain prove:

- versioned serialization;
- normalization and clamping;
- built-in fallback;
- revision change only for semantic changes;
- immutable runtime snapshot;
- no DOM/browser-storage import in core;
- existing runtime behavior remains unchanged under the built-in profile.

- [ ] **Step 3: Implement perception profiles and migrate consumers atomically**

Do not create editor-only values. Preserve subjective knowledge and deterministic cadence.

- [ ] **Step 4: Implement soldier archetypes as references**

Archetypes reference existing profile/loadout IDs and authoritative base unit fields. They do not copy entire profile values.

- [ ] **Step 5: Implement wound/suppression profiles and migrate existing constants atomically**

Cover only mechanics currently implemented by the Stage 6–9 runtime and existing suppression system.

- [ ] **Step 6: Add storage adapters and editor panels**

Use shared editor definitions. Hidden panels must unsubscribe and stop all timers.

- [ ] **Step 7: Add the three definitions to the default registry**

Groups:

```text
perceptionProfiles → soldier
soldierArchetypes → soldier
conditionProfiles → combat
```

- [ ] **Step 8: Run focused core/editor checks**

Minimum:

```bash
npm run typecheck
npm run perception:smoke
npm run perception-performance:smoke
npm run combat-foundation:smoke
npm run infantry-combat-stage9:verify
npm run editor:smoke
npm run performance-contract:smoke
npm run build
```

Run every new profile/editor smoke explicitly.

- [ ] **Step 9: Commit and report**

Use one test/contract commit and one or more domain commits. Do not combine unrelated domains into an unreviewable single patch.

### Task 4: Worker 4 — Combat Lab shared editor access

**Consumes:** common overlay coordinator and shared registry from the Wave 2 Foundation SHA.

**Produces:** one new Combat Lab tab and one overlay integration that discovers editor definitions dynamically.

- [ ] **Step 1: Write failing Combat Lab contracts**

Tests must prove:

- one `settings` workspace host/tab;
- grouped catalogue comes from the shared registry;
- no copied editor markup or profile values;
- embedded editor mounts in the modal overlay;
- route editor uses the graph route with a return target;
- close refusal preserves an unsaved editor;
- closing destroys the installation;
- selected-unit source-profile links open the correct editor/profile;
- quick parameters remain experiment-local;
- no second workspace root, draft, visual controller or batch client.

- [ ] **Step 2: Extend workspace hosts and tabs**

Add `settings` with label `Настройка игры`. Preserve existing persisted-tab normalization and current tabs.

- [ ] **Step 3: Implement the grouped catalogue**

Use registry metadata. Do not hardcode duplicated lists for current and future editors.

- [ ] **Step 4: Implement the large modal editor workbench**

Use the common overlay coordinator and shared editor workspace. The map remains present but inert behind the modal.

- [ ] **Step 5: Implement graph route and return target**

Use the existing AI editor route and graph storage. Do not create an embedded graph canvas in Combat Lab.

- [ ] **Step 6: Add source-profile links to selected-unit parameters**

Links use stable profile IDs and registry open requests. They do not copy profile values into the experiment draft.

- [ ] **Step 7: Prove lifecycle and runtime isolation**

Opening, switching and closing editors must not start a simulation loop, reset a run or alter batch ownership.

- [ ] **Step 8: Run focused Combat Lab checks**

Minimum:

```bash
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run combat-lab-scenario-system:verify
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Run every new settings-tab/overlay contract explicitly.

- [ ] **Step 9: Commit and report**

Suggested commits:

```text
test(combat-lab): define shared game-editor access contract
feat(combat-lab): open shared editors from the settings workspace
```

---

## Final compiler task

The compiler starts from the exact Wave 2 Foundation SHA, verifies that Worker 1 and Worker 2 changes are ancestors, then integrates Worker 3 and Worker 4.

- [ ] **Step 1: Verify branch identities**

Record:

```text
wave2_foundation_sha
worker3_head
worker4_head
```

Reject moved or rewritten published branches.

- [ ] **Step 2: Review complete diffs before integration**

Check ownership, forbidden architecture, duplicate registries, duplicate overlay roots, core DOM imports and test weakening.

- [ ] **Step 3: Integrate Worker 3, then Worker 4**

The registry should make this order low-conflict. Resolve definition-list and style conflicts without copying implementations.

- [ ] **Step 4: Add or strengthen cross-cutting regression tests**

At minimum cover:

- menu `Escape` while a Combat Lab editor overlay is open;
- new editors visible in both AI editor and Combat Lab catalogue;
- graph route return;
- repeated open/close without subscription accumulation;
- quick-parameter/global-profile separation;
- built-in profile compatibility preserving representative simulation output.

- [ ] **Step 5: Run focused matrix**

```bash
npm run typecheck
npm run editor:smoke
npm run graph-v2:smoke
npm run perception:smoke
npm run perception-performance:smoke
npm run movement-profiles:smoke
npm run environment-materials:smoke
npm run combat-catalog-editor:smoke
npm run attention-profiles:smoke
npm run directional-terrain:smoke
npm run combat-lab-ui-contract:smoke
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run combat-lab-scenario-system:verify
npm run infantry-combat-stage9:verify
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run long-task-classification:smoke
npm run build
```

If an exact script name changed in the Wave 2 Foundation, use its current canonical replacement and record the mapping.

- [ ] **Step 6: Run the canonical Preview gate**

```bash
npm ci --no-audit --no-fund
npm run verify:preview -- --report <absolute-report-file>
```

No skipped checks are allowed.

- [ ] **Step 7: Perform the justified performance audit**

Reason: shared editor mounting, modal lifecycle and Combat Lab integration can create hidden recurring DOM work, listener leaks and main-thread stalls.

Measure at least:

- initial opening cost of each editor;
- switching cost;
- repeated open/close listener/subscription stability;
- frame-time sample with Combat Lab map visible and editor overlay open;
- no application-owned LongTasks;
- no hidden-editor polling;
- no simulation-step regression under built-in profiles.

Use existing repository performance harnesses and thresholds. Do not weaken enforcement.

- [ ] **Step 8: Perform browser/design audit**

Already authorized for this implementation. Check real interactions at:

```text
1440×900
1366×768
1100×760
1920×1080
```

Capture menu, every editor group, Combat Lab settings catalogue, an embedded editor overlay, graph route return, unsaved close refusal and reduced-width behavior. Record console/page/request errors.

- [ ] **Step 9: Commit integration corrections**

Do not amend published worker commits. Add explicit compiler correction commits.

- [ ] **Step 10: Return compiler report**

Required status: `READY FOR ORCHESTRATOR`, `BLOCKED` or `FAIL`.

The report must include:

```text
wave2_foundation_sha:
worker3_head:
worker4_head:
compiler_head:
commits_added:
conflicts_resolved:
root_causes_fixed:
regression_tests_added_or_updated:
focused_checks:
canonical_preview_gate:
production_build:
performance_audit:
browser_qa:
console_errors:
known_remaining_issues:
feature_branch_touched: false
preview_branch_touched: false
main_touched: false
deployment_created: false
```

---

## Launch files

- `docs/subprojects/infantry-combat-prototype-v1/SHARED_GAME_EDITORS_EXECUTOR_01_SHELL_PROMPT.md`
- `docs/subprojects/infantry-combat-prototype-v1/SHARED_GAME_EDITORS_EXECUTOR_02_PLATFORM_PROMPT.md`
- `docs/subprojects/infantry-combat-prototype-v1/SHARED_GAME_EDITORS_EXECUTOR_03_TUNING_PROMPT.md`
- `docs/subprojects/infantry-combat-prototype-v1/SHARED_GAME_EDITORS_EXECUTOR_04_COMBAT_LAB_PROMPT.md`
- `docs/subprojects/infantry-combat-prototype-v1/SHARED_GAME_EDITORS_COMPILER_PROMPT.md`

## Final handoff

After the compiler returns `READY FOR ORCHESTRATOR`, the orchestrator:

1. reviews the compiler branch and exact gate report;
2. fast-forwards or otherwise non-destructively transfers the compiler candidate into `feature/20260731-combat-lab-user-acceptance-fixes`;
3. verifies exact remote HEAD;
4. performs the user-authorized exact-source Preview deployment through the permanent Vercel project;
5. checks `/`, `/ai-node-editor.html`, `/combat-lab.html` and `/deployment-source.json`;
6. performs published browser QA;
7. returns the acceptance update with the new Preview URL.
