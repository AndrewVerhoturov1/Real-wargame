# Web Chat Start

Короткий вход для ChatGPT или другого внешнего web-chat с GitHub-доступом.

## 1. Facts that must not be guessed

- Repository: `AndrewVerhoturov1/Real-wargame`.
- Working branch: `real-wargame-preview`.
- Stable branch: `main`.
- Canonical launcher: `Run-Real-Wargame-Lab.bat`.
- Stack: Vite + TypeScript + PixiJS **7**.
- This is not a Godot project.
- Canonical development names are English.
- Russian is the default human-facing language and must be complete.

The machine-readable source is:

```text
 docs/ai/repo-context.json
```

## 2. Minimal reading route

Read only:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant project skill from `docs/ai/SKILLS_INDEX.md`.

Do not read all journals, plans, screenshots, reports or skills by default.

## 3. Choosing a subproject

- Soldier AI, node editor, GraphRunner, Runtime, Blackboard, awareness or front context → `ai-single-unit-editor`.
- Map, camera, terrain, line of sight, objects or the RTS foundation → `real-wargame-start` as maintenance context, then follow the active AI task if the change supports soldier behavior.
- GitHub delivery, documentation integrity, agent rules or task handoff → `github-collaboration`.
- `repo-migration` is historical and is not a current source of rules.

Use `docs/ai/TASK_ROUTER.md` for the detailed route.

## 4. Branch and delivery contract

Default delivery:

```text
bounded task
→ direct commit/push to real-wargame-preview
→ checks
→ report to the human
```

Fallback when direct push is impossible or unsafe:

```text
temporary branch
→ Pull Request into real-wargame-preview
→ checks and review
→ transfer to preview
→ close temporary branch
```

For the current feature branch or a user-requested isolated task, keep changes on that branch until the user explicitly asks to transfer them.

Never:

- write to `main` without explicit human GO;
- merge a PR without explicit human GO;
- enable auto-merge;
- claim a local PC run when only GitHub Actions ran;
- claim visual success without opening the fresh PNG artifact;
- publish `.env`, tokens, private keys or personal data.

## 5. GitHub search limitation

GitHub code search may omit newly created preview files or resolve the default branch. When an exact path is known, fetch it directly with the explicit ref instead of concluding that the file does not exist.

## 6. Local and browser verification

For launch, screenshots, Playwright, visual QA or terminal-free instructions, read first:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

A valid visual claim requires the real application, a real browser, fresh PNG files, inspected key frames and commit-SHA matching.

## 7. PixiJS work

Read first:

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

The general PixiJS collection is v8-oriented. Real-Wargame remains on PixiJS 7 unless an explicit migration task says otherwise.

## 8. AI runtime work

Read first:

```text
.agents/skills/real-wargame-ai-runtime/SKILL.md
```

Keep these boundaries:

- `AiGraphRunner` is the immediate pure evaluator;
- `AiGraphRuntime` owns resumable execution state;
- `AiGameBridge` adapts pure AI to the game;
- core AI does not import PixiJS, DOM or localStorage;
- cancellation must not delete a newer player order.

## 9. Documentation changes

Current status is edited only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run:

```text
npm run docs:sync
```

Do not manually edit files marked `GENERATED FILE`.

## 10. Required final report

```text
branch: ...
commit/pr: ...
transfer_path: direct push / PR fallback / isolated branch only / not changed
changed_files: ...
checks_run: ...
not_checked: ...
manual_checks_needed: ...
risks: ...
main_touched: no / explicit approved change
```

Explain the result in simple Russian. The user is not required to work with Git or the terminal.
