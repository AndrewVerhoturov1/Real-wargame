# Zworker Prompt

**Request ID:** ZWORKER-20260706-135505-request-id-r-int-context-tactical-v0-1-20260706

## Read first

- Zworker manual: https://raw.githubusercontent.com/AndrewVerhoturov1/codex-token-monitor/main/docs/zworker_external_agent_manual.md
- Repo navigation: https://raw.githubusercontent.com/AndrewVerhoturov1/codex-token-monitor/main/docs/zworker_repo_navigation.md

## Task

Request ID: r-int-context-tactical-v0-1-20260706

Project: AndrewVerhoturov1/Real-wargame
Mode: R-INT (manual zworker)

Goal:
Analyze the current integration candidates and return an R-INT review ZIP that helps Codex decide whether and how to consolidate them.

Current candidates:
1. PR #2: codex/tactical-board-prototype-v0-1 -> codex/patch-pack-subproject-context
2. Branch: codex/patch-pack-subproject-context -> eventual integration into main

Important note:
Local uncommitted changes in docs/ai about R-INT are process/governance context only and are NOT integration candidates for this request.

What to do:
- Read the provided repository and GitHub sources.
- Build a compact candidate matrix.
- Build a compact conflict matrix.
- Review whether PR #2 is consistent with the base branch context/handoff.
- Recommend the safest integration order toward main.
- Identify major risks, unknowns, and local verification that Codex/human must do before any merge.

What not to do:
- Do not claim local test execution.
- Do not invent unpublished local context.
- Do not suggest writing directly to main.
- Do not require auto-merge.

Return format:
Return a ZIP with answer.md at the root.
answer.md must contain:
- candidate matrix
- conflict matrix
- recommended integration order
- review findings and risks
- explicit list of what still requires local Codex/OpenCode verification
If you need more context, ask for exact missing files or URLs in answer.md.

## Context from Codex/OpenCode

Codex reconcilation result: real integration candidates are A) PR #2 on codex/tactical-board-prototype-v0-1 targeting codex/patch-pack-subproject-context, and B) the branch codex/patch-pack-subproject-context itself as a staging branch that later has to be integrated into main. A trivial PR #1 exists but is not relevant. Local uncommitted docs/ai R-INT changes on main are governance/process context only and are not part of the integration target for this request.

## Files to read

- https://github.com/AndrewVerhoturov1/Real-wargame/pull/2
https://github.com/AndrewVerhoturov1/Real-wargame/compare/main...codex/patch-pack-subproject-context
https://github.com/AndrewVerhoturov1/Real-wargame/tree/codex/patch-pack-subproject-context
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/AGENTS.md
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/SUBPROJECT.md
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/subproject.json
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/JOURNAL.md

## Result

Return a ZIP archive.
The ZIP must contain `answer.md` at the root.
Add any other files you think are useful for completing the task.
Write `answer.md` in clear Russian unless the task says otherwise.

## If something is missing

Ask for the exact file, command output, or clarification.
Do not invent local git/test/runtime state.
