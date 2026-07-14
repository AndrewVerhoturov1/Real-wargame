# Real-Wargame Agent Contract

This file is the canonical short contract for GitHub-aware web chats, ordinary ChatGPT collaboration, Codex and OpenCode.

## 1. Project facts

```text
repository: AndrewVerhoturov1/Real-wargame
working branch: real-wargame-preview
stable branch: main
canonical launcher: Run-Real-Wargame-Lab.bat
stack: Vite + TypeScript + PixiJS 7
```

This is not a Godot project.

Machine-readable repository state:

```text
docs/ai/repo-context.json
```

## 2. Minimal start

Read in this order:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant skill from `docs/ai/SKILLS_INDEX.md`.

Detailed web-chat route:

```text
docs/ai/WEB_CHAT_START.md
```

Task-to-file route:

```text
docs/ai/TASK_ROUTER.md
```

Do not read every skill, journal, plan, report or historical handoff by default.

### Parallel ordinary ChatGPT chats

When the user explicitly wants to coordinate several ordinary ChatGPT chats without Codex, use:

```text
docs/orchestration/CHAT_WORKFLOW.md
docs/orchestration/ORCHESTRATOR_PROMPT.md
docs/orchestration/WORKER_PROMPT.md
docs/orchestration/INTEGRATOR_PROMPT.md
```

This chat-only route does not use Q/R/X/W or other letter modes. Workers are free to inspect and change any relevant part of the project in their own result space. During a parallel campaign, one integrator assembles the selected result into the shared `real-wargame-preview` state.

## 3. Branch policy

For a single bounded GitHub-aware implementation chat, default completed work goes to:

```text
real-wargame-preview
```

Preferred delivery for that single-chat case:

```text
direct commit/push to real-wargame-preview
```

Fallback when direct push is impossible, conflicted or deliberately isolated:

```text
temporary task branch
→ Pull Request into real-wargame-preview
→ transfer result
→ close temporary branch
```

For an active parallel chat-only campaign, worker results may be delivered as complete files, patches or isolated branches/PRs. Workers do not independently combine their results in the shared preview; the designated integrator performs the final assembly and delivery.

If the user explicitly requests an isolated branch and says not to transfer yet, keep all work on that branch and report `transfer_path: isolated branch only`.

Never:

- write to `main` without explicit human GO;
- open or retarget a PR to `main` without documented `MAIN_GO_APPROVED_BY_USER: yes`;
- merge without explicit human GO;
- enable auto-merge;
- leave a temporary branch or QA PR open without an explicit reason.

## 4. Development and language

Canonical development language is English for:

- file names;
- TypeScript identifiers, types, functions and interfaces;
- serialized data keys;
- technical comments;
- canonical labels/descriptions;
- test names and commit messages.

Every human-facing feature must have a complete Russian version. Russian is the default interface language. Use the established English base + `*Ru` overlay contract where applicable.

The user must not need to edit code, JSON, technical keys or run terminal commands for normal use.

Full language rules:

```text
docs/ai/DEVELOPMENT_LANGUAGE_RULES.md
```

## 5. Skill routing

### Visual launch, screenshots or Playwright

```text
.agents/skills/real-wargame-local-preview/SKILL.md
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

### PixiJS, canvas, renderers, camera, pointer events or performance

```text
.agents/skills/real-wargame-pixijs/SKILL.md
```

Real-Wargame uses PixiJS 7. Do not copy PixiJS 8 APIs into the project without an explicit migration task.

### Soldier AI, Blackboard, Utility, stateful Runtime, Bridge or node editor

```text
.agents/skills/real-wargame-ai-runtime/SKILL.md
```

General index:

```text
docs/ai/SKILLS_INDEX.md
```

## 6. Architecture boundaries

Read:

```text
docs/architecture/OVERVIEW.md
docs/architecture/MODULE_MAP.md
```

Hard boundaries:

- core simulation and AI do not import PixiJS;
- `AiGraphRunner` is a pure immediate evaluator;
- `AiGraphRuntime` owns resumable execution state;
- `AiGameBridge` adapts pure AI to the live game;
- renderers display state and do not become the source of truth;
- subjective soldier knowledge must not reveal the objective world;
- heavy awareness, relief or overlay work must not be recomputed every frame without evidence and design.

## 7. Current-status documentation

Edit current state only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Then run:

```text
npm run docs:sync
```

Files marked `GENERATED FILE` must not be edited manually.

## 8. Verification honesty

Never claim a check that was not run.

A GitHub Actions run is not a local run on the user's PC.

### Visual QA approval gate

For user-visible changes, visual QA is **required to be prepared**, but it is **not run automatically**.

Before asking the user, the agent must:

- finish the implementation;
- prepare or update the relevant Playwright scenario;
- define the key PNG files and what each should prove;
- run the focused smoke checks and production build that do not require a browser;
- report the remaining visual risks.

Then ask exactly once:

```text
Визуальная проверка подготовлена. Запустить её сейчас?
```

Do not start the real browser, Playwright screenshot workflow or local visual run until the user explicitly approves it.

An earlier explicit instruction such as `проверь визуально`, `сделай скриншоты`, `запусти браузерную проверку` or an equivalent clear request already counts as approval. Do not ask again.

If the user declines or does not approve, the change may still be delivered unless the task explicitly makes visual QA a release gate. Report it as implemented but not visually verified.

A visual check is complete only after:

- the real Vite application ran in a real browser;
- fresh PNG files were created after the change;
- artifact commit SHA matches the reported commit;
- changed/key PNG files were opened and inspected.

For non-visual changes use the focused smoke checks and production build required by the task route.

The canonical detailed policy is:

```text
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

## 9. Specialized and legacy collaboration references

The default multi-chat route is:

```text
docs/orchestration/CHAT_WORKFLOW.md
```

The following documents remain available only when a task explicitly concerns Codex, the older external-worker process or its compatibility:

```text
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/ZWORKER_MODES.md
docs/ai/R_INIT_WORKFLOW.md
docs/ai/PR_REVIEW_CHECKLIST.md
```

R, Q, X/r-init and related letter modes are not part of ordinary chat-only orchestration. Do not route a normal multi-chat request through them unless the user explicitly asks for the legacy workflow.

## 10. Required report

Every implementation report includes:

```text
branch: ...
commit/pr: ...
transfer_path: direct push / PR fallback / isolated branch only / file package / patch / not changed
changed_files: ...
checks_run: ...
visual_qa_prepared: yes / no / not applicable
visual_qa_approval: approved / declined / pending / not applicable
visual_qa_run: passed / failed / not run / not applicable
not_checked: ...
manual_checks_needed: ...
risks: ...
main_touched: no / explicit approved change
```

Explain the result to the user in simple Russian. Do not ask the user to manage Git or terminal commands when the agent can do it.
