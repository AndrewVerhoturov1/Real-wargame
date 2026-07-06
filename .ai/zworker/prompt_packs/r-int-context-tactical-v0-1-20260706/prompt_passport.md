# Zworker Passport

**Request ID:** ZWORKER-20260706-135505-request-id-r-int-context-tactical-v0-1-20260706

**Goal:** Request ID: r-int-context-tactical-v0-1-20260706

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

**Prompt file:** `D:\Codex+opencode_new\Proect_C_O\Real-wargame\.ai\zworker\prompt_packs\r-int-context-tactical-v0-1-20260706\prompt.md`

**Manual:** https://raw.githubusercontent.com/AndrewVerhoturov1/codex-token-monitor/main/docs/zworker_external_agent_manual.md

**Repo navigation:** https://raw.githubusercontent.com/AndrewVerhoturov1/codex-token-monitor/main/docs/zworker_repo_navigation.md

**Files linked:** - https://github.com/AndrewVerhoturov1/Real-wargame/pull/2
https://github.com/AndrewVerhoturov1/Real-wargame/compare/main...codex/patch-pack-subproject-context
https://github.com/AndrewVerhoturov1/Real-wargame/tree/codex/patch-pack-subproject-context
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/AGENTS.md
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/SUBPROJECT.md
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/subproject.json
https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/main/docs/subprojects/github-collaboration/JOURNAL.md

**Human next step:** Copy prompt.md to external chat, download ZIP, return ZIP to Codex/OpenCode.
