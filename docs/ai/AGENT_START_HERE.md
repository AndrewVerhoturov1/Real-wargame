# Agent Start Here

This compatibility entry remains for old links. The canonical short contract is now:

```text
AGENTS.md
```

A GitHub-aware web chat then reads:

```text
docs/ai/WEB_CHAT_START.md
docs/ai/repo-context.json
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
launcher: Run-Real-Wargame-Lab.bat
stack: Vite + TypeScript + PixiJS 7
```

Never change or merge to `main` without explicit human GO. Never claim visual verification without the real browser, fresh PNGs and inspected key frames.

Current status is edited only in canonical JSON and regenerated with:

```text
npm run docs:sync
```
