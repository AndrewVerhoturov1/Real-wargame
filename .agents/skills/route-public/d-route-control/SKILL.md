---
name: d-route-control
description: Use when the user explicitly requests Route D (work with the native models of Codex itself, direct Codex use, or an explicit Route D request). Do not load automatically for skill tasks; skills use normal route choice by work type.
---

# Route D control

## Purpose

Route D is the native Codex model route. When the user explicitly requests it,
the work is performed by the native models of Codex itself instead of being
delegated to OpenCode, ChatGPT Web, MiniMax jobs, or the job-wrapper transport.

Special ComfyUI MCP rule: every direct interaction with the registered
`comfyui-mcp` server is also classified as Route D. This includes tool and
skill discovery, `list_packs` / `skill_list`, skill reads, workflow operations,
and read-only verification. Route A/OpenCode/DeepSeek MUST NOT interact with,
proxy, or verify `comfyui-mcp`.

Route D is NOT a skill-authoring gate. Skill creation, editing, review, and
routing-contract tasks use normal route selection by work type. Route D applies
to a task only when the user separately asks for native Codex models, direct
Codex use, or Route D itself.

## Mandatory trigger

Codex MUST select Route D ONLY when the user explicitly requests one of:

- work with the native models of Codex itself;
- using Codex directly;
- Route D by name.

The `comfyui-mcp` special rule above is an automatic D trigger for that MCP
only, even without a separate Route D phrase in the user's request.

Without one of these explicit requests, Codex MUST NOT select Route D for any
task, including skill-authoring, skill-editing, or routing-contract work.

Route L (the automatic narrow direct-native-Codex micropatch route for
already-known explicit files) is NOT a D trigger. L never implies an explicit
D request, never softens D's explicit-user-only rule, and never causes
`d-route-control` to load.

An explicit Route D request is required for each phase in which native Codex
models are used. If the user requests native Codex models only for one phase,
Route D governs that phase only; other phases keep their normal route.

## Boundary (what D does and does not change)

Choosing Route D changes the model and transport only: Codex performs the
requested phase directly with its own native models.

Route D does NOT override any safety rule:

- the ban on unconfirmed access to local files still applies;
- a separate explicit user permission is still required for each exact local
  Codex action (read, search, list, inspect, edit, delete, archive, verify);
- GitHub restrictions still apply: direct Codex-side GitHub tools remain
  forbidden, and GitHub work stays OpenCode-mediated;
- no silent fallback to the old bridge or local work shortcuts;
- the existing batch economy rules, stop rules, and fallback bell route
  (Route B) still apply;
- a request to edit a skill, config, script, doc, or repo file is not by itself
  permission for local Codex work.

Route D is not R and not Q. R and Q are manual user-controlled external request
modes. Route D is an explicit user-chosen native Codex route.

## Relation to other routes

Skill tasks keep normal route selection by work type:

- Route A for simple reading, checking, reconnaissance, and tiny mechanical edits;
- Route L for at most one obvious micropatch in one already-known explicit file plus one known safe non-destructive check;
- Route X for branch + PR / preview delivery in collaborative GitHub repositories;
- Route W when the desired output is a ZIP or X is inappropriate;
- Route C for bounded hard local implementation/repair;
- R/Q only on explicit manual user request.

The exception is `comfyui-mcp`: its direct calls always use Route D, never
Route A.

Route D applies only to the part of the task for which the user explicitly
asked for native Codex models. It does not convert other phases to Route D.

## Forbidden use

Through Route D, Codex MUST NOT:

- auto-select D without an explicit user request;
- treat D as a mandatory gateway for skill-authoring, skill-editing, or skill
  verification;
- treat automatic Route L micro-actions as Route D or as an explicit D request;
- access local files without explicit permission for that exact action;
- use direct Codex-side GitHub tools or connectors;
- perform Git writes (add/commit/push/merge/PR) without explicit permission;
- silently fall back to OpenCode, Web, MiniMax, job-wrapper, or the old bridge
  to satisfy a Route D request without the user's agreement;
- skip the separate permission step for specific local actions.

## Execution contract

When Route D is explicitly requested:

1. Confirm the exact scope of the D request (which phase or part).
2. Perform that phase directly with Codex's own native models.
3. Respect all safety rules and permission requirements listed in the boundary.
4. If a local action is needed, stop and ask the user for permission for that
   exact action before performing it.
5. Keep output compact and report evidence; do not claim verification that did
   not happen.

If the D phase prepares a Route W prompt or any other external-agent handoff,
Codex itself MUST select the relevant skills and construct the `Required Skills
Manifest` before the handoff. The native Codex phase MUST provide the external
agent with the skill names, externally readable `SKILL.md` links, reasons,
`required`/`conditional` status, and reading order. It MUST NOT delegate skill
discovery to the external agent or treat the external agent's guess as a
substitute for the manifest.

## Stop / completion conditions

A Route D phase is complete when the explicitly requested native Codex work
produced the requested result and all safety boundaries held.

Route D is BLOCKED when:

- no explicit user request for native Codex models / direct Codex / Route D
  exists (do not select D);
- a local action needs permission that was not granted (stop and ask);
- the requested work cannot proceed under the safety rules.

When a route decision for a D phase is unclear, stop and ask the user rather
than guessing.

## Verification rules

After a Route D phase, report:

- what was performed with native Codex models;
- which local actions were permitted (if any) and with which exact user approval;
- which GitHub/remote actions were performed and through which allowed route;
- evidence only for checks that actually ran.

Do not claim local verification, GitHub verification, file edits, or runtime
checks unless they actually happened.
