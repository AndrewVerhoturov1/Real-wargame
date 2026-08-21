---
name: routing-reminder
description: >
  Concise extract / reminder of opencode-mcp-windows-control routing.
  NOT the source of truth - opencode-mcp-windows-control wins on any conflict.
  Triggers only when explicitly requested as a routing reminder, or when another
  instruction directs you to read this reminder before a repo/workspace step.
---

# Routing Reminder

This file is only a short reminder.
If anything conflicts with the main dispatcher, `opencode-mcp-windows-control`
wins.

## 1. Per-phase declaration

Each bounded phase starts with:

```text
PHASE:
ROUTE:
WHY:
STOP BEFORE:
```

## 2. Route meanings

| Route | Meaning |
|---|---|
| **R** | Manual `/zworker`. User-controlled, ZIP result. Codex does not auto-select. |
| **Q** | Manual GitHub-aware external request. User-controlled, branch+PR result. Codex does not auto-select. |
| **A** | OpenCode Flash. Reconnaissance, reading, context packs, prompt shaping, verification, simple safe edits. |
| **L** | Automatic narrow direct-native-Codex route on ready bounded context: read named known files, explain a provided fragment/summary, choose a route from `context_pack`, limited classification, final X/W/Q prompt preparation, or one obvious one-file micropatch with its narrow check. Any active native Codex model; no Luna/Terra/Sol check. Not D. |
| **D** | Native Codex model route. Also the mandatory direct route for every `comfyui-mcp` interaction, including `list_packs` / `skill_list`; Route A MUST NOT interact with that server. This special case is selected automatically by the MCP task. |
| **X** | Automatic Q-like route. Default for non-simple work in collaborative GitHub repos. Returns direct push to preview (or PR fallback) + report + terminal marker. |
| **W** | Automatic R-like ZIP route. Use when X is unsuitable or repo is not collaborative. Returns ZIP with answer.md. |
| **C** | MiniMax jobs. Hard local verification, repair, and bounded heavy local work. |
| **A-journal** | Documentary subtype of Route A for session-level artifacts. |

Manual vs automatic:

- R (manual /zworker) → W (automated ZIP route).
- Q (manual GitHub-aware) → X (automated GitHub branch/PR route).

Codex does not automatically select R, Q, or D. Route L is automatic only for
its ready bounded context and listed narrow actions; it is never a D phase and
does not soften D's explicit-only rule.

Exception: every `comfyui-mcp` task is Route D. Route A/OpenCode/DeepSeek MUST
NOT call, inspect, proxy, or verify `comfyui-mcp`.
When both A and L fit the same ready bounded phase, choose L; if L's conditions
are not proven, choose A.

### Route W skill manifest rule

Before a W prompt is sent to the manual or automated ChatGPT Web executor,
Codex MUST add a `Required Skills Manifest` to the prompt. It must contain all
skills Codex believes may be relevant, with:

- exact skill name;
- externally readable `SKILL.md` link, preferably pinned to a commit;
- reason the skill may be needed;
- `required` or `conditional` status;
- reading order when relevant.

The prompt MUST require the executor to read all required skills, conditionally
read the others, and return `skills_read`, `skills_skipped`, and
`skills_unavailable` in `answer.md`. If a required skill cannot be opened, the
executor must stop and report the blocker. The executor must not silently
invent or apply rules from unlisted skills.

Never publish private paths, secrets, `.env`, or private skill contents. If a
needed skill is local-only, publish a safe externally readable copy through
the approved context-sync route or include only its non-secret rules directly
in the W prompt and mark the URL unavailable.

### Route X skill manifest rule

Before an X prompt is sent to the GitHub-aware external executor, Codex MUST
add a `Required Skills Manifest` to the prompt. It must contain all skills
Codex believes may be relevant, with:

- exact skill name;
- externally readable `SKILL.md` link, preferably pinned to a commit;
- reason the skill may be needed;
- `required` or `conditional` status;
- reading order when relevant.

The prompt MUST require the executor to read all required skills, conditionally
read the others, and return `skills_read`, `skills_skipped`, and
`skills_unavailable` in the final report / terminal block. If a required skill
cannot be opened, the executor must stop and report the blocker. The executor
must not silently invent or apply rules from unlisted skills.

The X executor receives only externally accessible safe links. Never publish
private paths, secrets, `.env`, or private skill contents. If a needed skill is
local-only, publish a safe externally readable copy through the approved
context-sync route or include only its non-secret rules directly in the prompt
and mark the URL unavailable.

### Route Q skill manifest rule

Before a manual Q prompt is handed to the GitHub-aware external executor, Codex
MUST add a `Required Skills Manifest` to the prompt. It must contain all skills
Codex believes may be relevant, with:

- exact skill name;
- externally readable `SKILL.md` link, preferably pinned to a commit;
- reason the skill may be needed;
- `required` or `conditional` status;
- reading order when relevant.

The prompt MUST require the executor to read all required skills, conditionally
read the others, and return `skills_read`, `skills_skipped`, and
`skills_unavailable` in the final report and PR description when applicable. If
a required skill cannot be opened, the executor must stop and report the
blocker. The executor must report newly discovered relevant skills instead of
silently applying their rules.

Route Q is a manual mode; its source of truth is the dispatcher
(`opencode-mcp-windows-control`), not this reminder.

## 3. Preferred route chain

```text
Route A -> Route L (only for listed narrow actions on ready bounded context) -> GitHub sync (if needed) -> Route D (only on explicit user request for native Codex models) -> Route X/Route W -> Route A -> Route C (if needed) -> Codex decision
```

Interpretation:

1. Route A gathers bounded context.
2. Route L may read named known files, explain ready context, choose a route or classify from a sufficient A extract, prepare X/W/Q, or make and narrowly verify one obvious one-file micropatch. If context is not ready and bounded, use Route A.
3. GitHub sync publishes the minimum safe context when Web needs fresher data.
4. Route D is used for explicitly requested native Codex work. The special
   `comfyui-mcp` rule above also forces Route D for all direct MCP interaction.
5. Route X or Route W performs the strong external reasoning phase.
6. Route A verifies the result.
7. Route C is used only if Route A cannot finish hard local repair.

## 4. GitHub-before-Web rule

Before Route W or Route X, the required repository context must already be
available through externally readable GitHub/raw URLs.

If the needed context exists only locally or is newer than GitHub:

1. Route A gathers the minimum context.
2. OpenCode-mediated GitHub sync publishes only the minimum safe files.
3. Route W or Route X uses that published context.
4. Never publish secrets or `.env`.

Route X starts from GitHub-visible state. Do not create a separate context branch for Route X by default — it must preserve one task → one delivery (direct push to preview or PR).

## 5. Collaborative GitHub routing

Source of truth (defined in `opencode-mcp-windows-control`):
1. Primary: workspace `AGENTS.md` when it explicitly declares the collaboration contract (one task → direct commit/push to preview or PR).
2. Secondary: active `SUBPROJECT.md` or `subproject.json` when they explicitly declare the same contract.
3. Fallback: if absent or unclear, treat as non-collaborative for X/W routing. Do not guess.

When the repository IS collaborative:

- **D** for explicitly requested native Codex work and for every direct
  `comfyui-mcp` interaction; A is forbidden for that MCP.
- **A** for simple/fast work.
- **L** only for its listed narrow actions on ready bounded context; otherwise return to A.
- **X** for all non-simple work expected as direct push to preview (or PR fallback).
- **W** only when X is unavailable or ZIP is the natural result.
- **C** for bounded local hard repair.

Route W must not replace X merely because the task is medium or complex.

## 6. Permanent preview formula

For the `Real-wargame` project (two-folder scheme):

1. The permanent preview branch is `real-wargame-preview`. Do not create ad-hoc preview branches with `preview/` or `r-init/` prefixes.
2. Default delivery: external GitHub-aware chats commit/push finished changes directly into `real-wargame-preview`. PRs are fallback when direct push is impossible.
3. All changes target `real-wargame-preview` first. The user tests in the local `Real-wargame-preview` folder.
4. `main` is changed only after explicit user GO.
5. Task branches (if used) are cleaned up after transfer to `real-wargame-preview`. If left open, the report must include «Временная ветка оставлена открытой, потому что ...».
6. R-init for this project uses the permanent `real-wargame-preview` branch, not ad-hoc preview branches.
7. After external push/PR delivery to `real-wargame-preview`, Codex/OpenCode MUST sync the local preview folder (`Real-wargame-preview`) from `origin/real-wargame-preview` before reporting readiness for local human testing. GitHub push does not update the user's PC.

Refer to:
- `docs/workflow/LOCAL_TWO_FOLDER_WORKFLOW.md`
- `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`
- `docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md`

## 7. Batch economy

- Batch independent same-type actions.
- Prefer one bounded OpenCode task over many tiny calls.
- Use the standard prompt frame: `MODE / GOAL / SCOPE / MUST DO / MUST NOT / STOP BEFORE / OUTPUT / BUDGET`.

## 8. Hard bans

Without explicit permission:

- no local Codex repo inspection by default;
- no Route L search, broad reading, medium/large implementation, architecture, dependencies, network, servers/watch, secrets, Git/GitHub, cleanup, or X/W/C/report duties;
- no silent fallback to local Codex work;
- no old Windows bridge;
- no direct Codex-side GitHub tools;
- no broad Git writes;
- no secrets or `.env` in Web/GitHub;
- no repeated check/wait loops as the normal workflow.

## 9. Roles

- **OpenCode** prepares, reads, edits, and verifies in bounded scope.
- **Web (Route X/W)** performs the strong external reasoning phase.
- **Route L** performs only its listed narrow direct-native-Codex actions on ready bounded context; edits remain at most one obvious patch plus one known check.
- **Route D** runs native Codex model work on explicit request and is the
  mandatory direct route for `comfyui-mcp`.
- **Route C** handles hard local repair.
- **Codex** routes, judges, and explains.

## 10. Final answer

In the final answer, always include the actual route chain used.

Format:

```text
Routes used: A -> L -> X/W -> A -> C   (L only for one known-file micropatch; D only on explicit request)
```
