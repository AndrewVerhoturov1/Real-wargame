# Agent Start Here

This compatibility entry remains for old links. The canonical short contract is:

```text
AGENTS.md
```

A GitHub-aware Web Chat then reads:

```text
docs/ai/WEB_CHAT_START.md
docs/ai/repo-context.json
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/orchestration/ORCHESTRATION_PROTOCOL.md
docs/subprojects/index.json
docs/subprojects/<active-id>/STATUS.md
```

Choose only the relevant skill from:

```text
docs/ai/SKILLS_INDEX.md
```

Important facts:

```text
working branch: real-wargame-preview
stable branch: main
feature branch pattern: feature/YYYYMMDD-short-kebab-slug
launcher: Run-Real-Wargame-Lab.bat
stack: Vite + TypeScript + PixiJS 8
```

Every implementation task starts on a temporary feature branch created from the exact current `real-wargame-preview` head. Web Chat owns implementation and all later fixes on that same branch.

Codex is the orchestrator and independent reviewer/tester/operator. In orchestrated mode it prepares the Web Chat handoff, verifies the exact pushed SHA and returns actionable fixes. Codex does not write product code or merge/retarget branches; after explicit user GO it may transfer the exact accepted commit into `real-wargame-preview`.

Transfer into `real-wargame-preview` requires explicit user GO for the exact tested commit. Never change or merge to `main` without a separate explicit human GO.

Visual GitHub Actions verification runs only after explicit user approval and is not complete without the exact feature SHA, the real browser, fresh PNGs and inspected key frames.

Current status is edited only in canonical JSON and regenerated with:

```text
npm run docs:sync
```
