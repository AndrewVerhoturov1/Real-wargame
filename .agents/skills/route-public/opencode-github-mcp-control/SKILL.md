---
name: opencode-github-mcp-control
description: Use when GitHub work is explicitly requested, or when Route W / Web Zworker Auto needs OpenCode-mediated publication of the minimum repository context to externally-readable GitHub URLs.
---

# OpenCode GitHub MCP Control

## Purpose

Use only for explicit GitHub tasks.

This skill is conditional. Codex MUST NOT read it for ordinary local repo work.

This skill does not authorize Codex to use GitHub directly.

It authorizes only this route:

Codex -> mcp__opencode.* -> OpenCode -> GitHub MCP

Direct Codex-side GitHub MCP/tools/connectors are forbidden.

## Preconditions

Codex MUST already have read `opencode-mcp-windows-control`.

GitHub is explicit-only except for the narrow Route W context-sync exception
defined below.

Do not use GitHub MCP, `gh`, PRs, issues, pushes, merges, or remote writes
unless the user explicitly requested a GitHub task.

## Web-route GitHub exceptions

### Route W / manual ZIP context sync

When the main routing skill has deliberately selected Route W / Web Zworker
Auto, publishing the minimum required context to GitHub is considered an
explicit GitHub task for that workflow.

Allowed only for:

- creating or updating a temporary context branch;
- pushing files required by the Web route;
- reading raw URLs from that branch;
- optionally deleting the temporary context branch after completion.

Still forbidden:

- direct Codex-side GitHub tools;
- local `gh` by default;
- pushing secrets;
- broad repo writes;
- merging;
- unrelated commits;
- `main` branch writes unless explicitly approved.

GitHub operations must remain OpenCode-mediated.
Codex direct GitHub tools are still forbidden.

### Route X GitHub branch/PR delivery and verification

GitHub is explicit-only by default.

Exception: when Route X is selected by the dispatcher or explicitly invoked by the user, the OpenCode-mediated GitHub operations required by the Route X contract are considered explicit for that workflow.

Allowed through OpenCode-mediated GitHub MCP:

- inspect repository metadata needed for the Route X prompt;
- verify the reported branch;
- verify the reported Pull Request;
- read PR files/diff/commits/check metadata;
- confirm PR state, base branch, merge status, and auto-merge status when available;
- complete the one intended branch + PR workflow if the Route X contract explicitly requires it.

Still forbidden:

- direct Codex-side GitHub tools;
- local `gh` by default;
- direct writes to `main`;
- merge;
- auto-merge;
- unrelated commits;
- duplicate PRs for the same task;
- secrets, `.env`, tokens, private paths, or private machine data in GitHub context.

## Skill-authoring / editing and GitHub

Skill-authoring and skill-editing tasks are NOT Route D by default. They choose
their working route by work type (A/X/W/C; R/Q/D only on explicit user
request). This skill does not require Route D for skill work.

Route L may be used for a skill task only under its strict conditions
(already-known explicit files and at most one obvious micropatch plus one known
safe non-destructive check); otherwise Route A is the default for skill tasks.
No working route here creates a broad GitHub write exception by itself.

If a skill task changes skill files in a collaborative GitHub repository, the work must still preserve:

- one task -> one delivery to `real-wargame-preview` (direct push or PR);
- no direct writes to `main`;
- no merge without explicit human permission;
- no auto-merge;
- no secrets or private local data in published context.

If the working route needs GitHub branch/PR delivery through the automated web route, apply the Route X GitHub exception only within the normal Route X contract.

If the task only prepares wording or a manual prompt package, do not perform GitHub writes unless separately authorized by the active route.

## Preview-policy enforcement in read-only PR review

When performing read-only PR review for the `Real-wargame` collaborative project, the reviewer MUST enforce the permanent preview policy:

- The default delivery is a **direct commit/push to `real-wargame-preview`** by external GitHub-aware chats. PRs are the **fallback** when direct push is impossible.
- The default target for any delivery (push or PR) is `real-wargame-preview`, not `main`.
- Any delivery (push or PR) targeting `main` directly from a task branch or external executor is a **preview-policy violation**, unless the PR body or the task context explicitly records `MAIN_GO_APPROVED_BY_USER: yes` or equivalent explicit user approval.
- If a violation is detected, the review MUST:
  1. flag it as a preview-policy violation;
  2. recommend retargeting to `real-wargame-preview` or transferring the changes to the permanent preview branch;
  3. explicitly state that `main` can only be targeted after the user has tested the preview result and given explicit GO.
- Do NOT merge or close the PR based on this flag alone. Report the violation and let the user decide.

This enforcement applies to any read-only PR review where the repository uses the two-folder preview scheme (`Real-wargame` / `Real-wargame-preview`).

### Local readiness distinction

When reviewing a GitHub push or PR for the two-folder preview scheme, the review MUST distinguish:

- **GitHub-delivered**: changes exist in remote `real-wargame-preview` — confirmed by GitHub facts.
- **Locally-ready**: local `Real-wargame-preview` folder is synced from `origin/real-wargame-preview` and matches the delivered commit — required before local human testing.

After external push/PR delivery is confirmed, recommend local preview sync. A "GitHub-delivered" status alone is not "locally-ready".

## Route

Use:

```text
Codex -> mcp__opencode.* -> OpenCode -> GitHub MCP
```

Do not use local `gh` by default.

## Model

For GitHub tasks through this skill, use the explicit default model:

- providerID: `deepseek`
- modelID: `deepseek-v4-flash`

Do not call `opencode_provider_models` or switch models unless that exact
provider/model is rejected, unavailable, or the user explicitly requests a
different model.

## Direct GitHub tool ban

Codex MUST NOT call GitHub tools directly.

Forbidden examples:

- `mcp__codex_apps__github.*`;
- direct GitHub connector tools;
- local `gh`;
- direct GitHub API calls;
- any non-OpenCode GitHub read/write path.

This applies to:

- authenticated user checks;
- repository root listing;
- file reads;
- README reads;
- issue reads;
- pull request reads;
- branch reads;
- all GitHub write actions.

All GitHub operations must be requested from OpenCode through one bounded
`opencode_ask` or `opencode_run` task, unless the GitHub skill explicitly
defines a narrow OpenCode-mediated preflight/status check.

If Codex has already used direct GitHub tools in the current task, it MUST mark
the result as a route violation and repeat the GitHub step through OpenCode if
the user wants a valid skill test.

## Mandatory preflight

For explicit GitHub tasks, preflight should be minimal and bounded.

Preflight must not become a mixed route.

If Codex checks OpenCode/GitHub MCP status through OpenCode, the later GitHub
read/write work must still be done through OpenCode.

Codex MUST NOT do:

OpenCode preflight -> direct Codex GitHub reads

That is a route violation.

Allowed preflight:

1. `opencode_setup` when needed to confirm the OpenCode route is ready.
2. `opencode_mcp_status` or equivalent status check to confirm `github:
   connected`.
3. One tiny real read-only GitHub probe.
4. OpenCode server version check when version/stale-route risk is relevant.

Model discovery is NOT required for GitHub read-only tasks when this skill's
explicit default model is used.

Codex MUST NOT call `opencode_provider_models` for GitHub tasks merely because
the OpenCode tool description recommends provider discovery.

Call `opencode_provider_models` only if:

- the default provider/model is missing or rejected;
- the user explicitly asks for a different provider/model;
- the task is specifically about provider/model diagnosis.

## GitHub safety

- protect `main`;
- no push unless explicitly allowed;
- no PR unless explicitly allowed;
- no merge unless explicitly allowed;
- no issue/PR writes unless explicitly allowed;
- no secrets in files, issues, comments, logs, or reports;
- no tokens printed;
- no broad repo writes.

## Read-only tasks

Read-only GitHub tasks may include:

- authenticated user check;
- repository root listing;
- file read;
- issues list;
- pull requests list;
- workflows list;
- PR file/diff read.

When performing a read-only PR review for a repository with the permanent
preview policy (two-folder scheme), enforce the preview-policy checks as
described above.

## Write tasks

Write tasks require explicit user permission and bounded scope.

Allowed only when explicitly requested:

- create issue;
- comment issue;
- close issue;
- create branch;
- create file in branch;
- create PR;
- comment PR;
- close PR without merge.

No merge by default.

## Budget notes

For a simple GitHub read-only task, target preflight is:

- setup/status if needed;
- GitHub connected check;
- one read-only GitHub probe;
- one bounded OpenCode GitHub task.

Avoid extra discovery calls. `opencode_provider_models` is a budget warning
unless specifically justified by a model/provider blocker.

## Output

Return compact evidence:

```text
TASK_STATUS: COMPLETED / PARTIAL / BLOCKED / FAILED / NEEDS_CODEX_DECISION
```

Route:
- ...

GitHub route used:
- OpenCode-mediated yes/no

direct Codex-side GitHub tools used:
- yes/no

local `gh` used:
- yes/no

GitHub writes performed:
- yes/no

route violation:
- yes/no

Preview policy:
- base branch check: pass / violation
- recommendation: <retarget / transfer / etc.>

Preflight:
- ...

Actions:
- ...

GitHub objects:
- ...

Safety:
- ...

For GitHub tasks, OpenCode/Codex final report MUST include:

- GitHub route used: OpenCode-mediated yes/no;
- direct Codex-side GitHub tools used: yes/no;
- local `gh` used: yes/no;
- GitHub writes performed: yes/no;
- route violation: yes/no.

## Regression smoke

- GitHub read-only must use OpenCode-mediated route;
- Route W context sync uses OpenCode-mediated GitHub work rather than direct Codex GitHub tools;
- the Route W exception allows only temporary context-branch publication and raw URL retrieval;
- Route X has its own explicit GitHub exception for branch/PR delivery and verification;
- Route D does not create a broad GitHub write exception by itself;
- skill-authoring/editing tasks are not D by default; they choose their working route (L only under strict conditions, else A), and GitHub remains governed by this skill;
- direct Codex-side GitHub tools are forbidden even for read-only;
- OpenCode preflight followed by direct Codex GitHub reads is a route violation;
- valid GitHub route proof must say: direct Codex-side GitHub tools used: no;
- preview-policy enforcement in read-only PR review must flag `codex/* -> main` as a violation unless MAIN_GO is recorded.
