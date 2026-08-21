---
name: opencode-mcp-windows-control
description: Use before any repo or workspace task to route Codex through the correct OpenCode path, enforce no-local-work safety, and load conditional OpenCode skills only when the route or task type requires them.
---

# OpenCode Direct MCP Control

## Purpose

Codex MUST read this skill before any repo/workspace action.

This skill applies to any filesystem-backed engineering task, not only Git repositories.

This includes repositories, workspaces, project folders, scripts, config files,
documentation files, Codex/OpenCode skills, skill scripts, tests, reports, and
local tool files.

This skill is the mandatory dispatcher for:

- route selection;
- forbidden fallbacks;
- batch economy;
- OpenCode task shaping;
- conditional skill loading;
- stop rules.

Keep this skill short. Rare route details belong in conditional skills.

## Skill-first and no local filesystem work

If the task touches local files, project files, skill files, scripts, configs,
docs, reports, tests, or tool files, OpenCode is required by default.

Codex MUST NOT read, search, list, inspect, edit, delete, archive, or verify
local files by itself unless the user explicitly allows one specific local
Codex action in the current task.

Before and after reading this skill, Codex MUST NOT inspect the target repo or
workspace locally with filesystem listing, reading, or search tools, and MUST
NOT use local Git inspection such as `status`, `diff`, `log`, or `show` as a
fallback.

Forbidden by default:

- no local repo/workspace inspection by Codex;
- no filesystem listing/reading/search as fallback;
- no local Git inspection as fallback;
- no old Windows bridge;
- no silent fallback to local work.

Allowed exceptions:

- reading this skill file;
- editing this skill locally is allowed only when the user explicitly says in the
  current task that Codex may perform that exact local action without OpenCode;
- non-repo files outside this workflow when the task is not repo/workspace
  inspection or modification.

Boundary escalation rule:

- if Codex believes local Codex work is needed for the next step, Codex MUST
  stop before that local action and ask the user for permission for that one
  exact action;
- if Codex wants to use OpenCode outside the repo/workspace scope governed by
  this skill, or outside the routes, exceptions, or stop rules defined here,
  Codex MUST stop and ask the user for explicit permission before using
  OpenCode.

If OpenCode is required but unavailable or blocked, Codex MUST stop unless the
user explicitly changes the workflow.

## Batch economy rules

Codex MUST reduce unnecessary model launches.

Main rule:

```text
Same-type and independent actions MUST be batched.
Risky or decision-dependent actions MUST be separate steps.
```

Before reading, searching, checking, calling a tool, or delegating to
OpenCode, Codex MUST decide:

```text
1. Which sources or actions are needed.
2. Which of them are independent.
3. Which actions can be executed as one batch.
4. Where a decision boundary exists.
5. What is the smallest useful result needed.
```

Codex MUST:

- read related skills, notes, and docs as one source batch when they are
  already predictable;
- batch independent tool actions when the tool supports it;
- prefer one bounded OpenCode task over many small calls;
- use one preflight batch before normal repo work;
- use one result-check batch after edits or delegated work;
- summarize long logs instead of pulling full logs into context.

A second source batch is ALLOWED ONLY if a new reason appeared.

Default log rule:

```text
Inspect relevant tail only.
Search ERROR/WARN/FAIL.
Identify first real error.
Return compact summary.
```

Before acting, Codex MUST self-check:

```text
1. Can this be batched?
2. Is there a decision boundary?
3. Will long output enter context?
4. Can OpenCode do this cheaper as one bounded task?
5. If OpenCode is unavailable, will I stop instead of using a fallback?
```

## Roles

Codex:

- understands the task;
- chooses the route;
- shapes the OpenCode prompt;
- decides risky steps;
- reviews evidence;
- gives the final user answer.

OpenCode:

- searches, reads, and maps repo/workspace state;
- performs allowlisted edits inside scope;
- discovers commands;
- executes only commands selected by Codex;
- returns compact evidence.

## Default workflow

Prefer one bounded OpenCode task over many micro-calls.

Default flow:

1. Codex splits the user request into meaningful phases.
2. If route choice requires repo facts, the first repo-facing phase MUST be Route A
   reconnaissance. Codex must not gather those facts locally.
3. Codex chooses the best route for the first phase.
4. Codex loads conditional skills only when a phase requires them.
5. Codex executes the phase through the selected route.
6. At the next phase boundary, Codex re-evaluates the route.
7. Codex stops or continues with the next route in the route chain.

Use separate decision loops only for writes, tests/builds, cleanup, Git/GitHub
actions, or other risk-increasing steps.

## Per-phase route planning

Before every meaningful action boundary, Codex MUST decide which route is best
for the next phase.

Meaningful phases include:

- skill loading;
- repo/workspace exploration;
- file reading;
- context gathering;
- planning;
- code implementation;
- code modification;
- verification;
- test/lint/build execution;
- report handoff;
- cleanup;
- GitHub work;
- recovery after route failure.

Codex MUST NOT assume that the route used for exploration should also be used
for implementation.

Exploration and implementation may use different routes in the same user task.

Verification may use a different route than implementation.

Route changes are allowed only at phase boundaries and must have a reason.

The first phase may be route planning from the user request only.

Codex may draft a provisional route chain from the prompt, but MUST NOT inspect
the repository locally to confirm it.

When repo evidence is needed, Codex MUST insert a Route A reconnaissance phase
before deciding the implementation route.

Before each phase, Codex MUST internally answer:

```text
PHASE:
ACTION TYPE:
BEST ROUTE:
WHY THIS ROUTE:
CONDITIONAL SKILL NEEDED:
STOP BOUNDARY:
BUDGET:
```

This route decision may be kept compact, but it must guide the next action.

If the route decision changes from the previous phase, Codex must know why.

## Pre-route repository reconnaissance

Codex MUST NOT inspect the repository or workspace locally in order to choose a
route.

Route selection starts from:

- the user request;
- this routing skill;
- already loaded explicit task context;
- previously returned OpenCode evidence from the current task.

If Codex needs repository facts before choosing the implementation route, that
fact-gathering is itself a meaningful phase and MUST use Route A.

Default pre-route repo reconnaissance:

- route: Route A / standard OpenCode MCP;
- mode: `context_pack`;
- purpose: gather only the minimum facts needed to choose the next route;
- no edits;
- no Git writes;
- compact output.

Codex MUST NOT use local filesystem listing, reading, search, or local Git
inspection as a route-selection shortcut.

Forbidden route-selection shortcuts:

- `ls`;
- `dir`;
- `Get-ChildItem`;
- `find`;
- `rg`;
- `grep`;
- `cat`;
- `Get-Content`;
- local `git status`;
- local `git diff`;
- local `git log`;
- reading repo files directly through Codex tools.

If route choice depends on repo structure, file locations, existing commands,
or current changed files, Codex MUST ask OpenCode for a bounded Route A
`context_pack` or `verify_pack` first.

## Manual modes vs automatic routes

This system has two different layers.

Manual external request modes (user-controlled, not selected by Codex):

- R = manual `/zworker`.
- Q = manual GitHub-aware external request.

Explicit user-requested modes (selected only on direct user request):

- Route D = work with the native models of Codex itself (direct Codex use).

Special routing rule for ComfyUI:

- Every interaction with the `comfyui-mcp` server, including discovery,
  `tools/list`, `list_packs` / `skill_list`, skill reads, workflow calls, and
  verification, MUST use Route D directly.
- Route A MUST NOT call, inspect, proxy, or otherwise interact with
  `comfyui-mcp`. Do not route this MCP through OpenCode or DeepSeek.
- For this special case, Route D is the direct Codex-to-`comfyui-mcp`
  transport even when the user did not separately repeat "Route D".

Automatic Codex routes:

- Route A = simple/fast OpenCode route.
- Route L = automatic narrow direct-native-Codex micropatch route over
  already-known explicit context (see Route L section below).
- Route X = automatic GitHub-aware branch/PR route.
- Route W = automatic R-like ZIP route.
- Route C = bounded local hard implementation/repair route.

Codex does not automatically select R, Q, or D. Route L is automatic but is
never a D phase; D stays explicit-user-only and L does not soften it.

If the user explicitly asks for manual `/zworker`, use R.
If the user explicitly asks for a manual GitHub-aware external request, prepare Q.
If the user explicitly asks to work with native Codex models, to use Codex
directly, or for Route D, use Route D for that part.
If Codex itself automates the ZIP Web route, use Route W.
If Codex itself automates the GitHub branch/PR Web route, use Route X.
If the exact files and one obvious micropatch (plus one already-known safe
non-destructive check) are already known in the task, use Route L.

Relation between manual and automatic:

- R (manual ZIP) → W (automated ZIP route).
- Q (manual GitHub-aware) → X (automated GitHub branch/PR route).
- D (explicit native Codex) is not L; L is an automatic narrow native Codex
  micropatch route, not a D phase, and never implies an explicit D request.

## Collaborative GitHub repository routing

### Source of truth for collaborative-repo status

Whether a repository is treated as collaborative GitHub development is determined by, in priority order:

    1. **Primary**: workspace `AGENTS.md` when it explicitly declares the GitHub collaboration contract (e.g. one task → one delivery — branch + PR or direct preview push per project contract).
    2. **Secondary**: active subproject docs (`SUBPROJECT.md` or `subproject.json`) when they explicitly declare the same delivery contract for the active scope.
3. **Fallback**: if the marker is absent or unclear, treat the repository as **non-collaborative** for X/W routing purposes. Do not guess.

### Routing defaults for collaborative repositories

When the repository IS collaborative GitHub development, use this default split:

- Route A: simple, fast, low-risk work.
- Route L: one obvious micropatch in one already-known explicit file, plus at
  most one already-known safe non-destructive check. It is automatic, narrow,
  and never a D phase.
- Route X: all non-simple work in collaborative repositories, delivered to the project-defined target (direct push to preview or PR per contract).
- Route W: only when Route X is unavailable, inappropriate, or the result must be a ZIP.
- Route C: bounded local hard implementation/repair when required context is local-only or Route X cannot see it.
- Route D: only when the user explicitly requests native Codex models / direct Codex / Route D. Never auto-selected. Skill tasks use normal route choice by work type.
- After external GitHub delivery, the local preview folder must be pulled/synced from `origin/real-wargame-preview` before any claim of local test readiness. GitHub push does not update the user's PC.

In a collaborative GitHub repository, Route W must not replace Route X merely because the task needs strong reasoning.
For non-simple collaborative repository work, Route X is the default strong route.

D is not auto-selected. Skill tasks keep the normal A/X/W/C split; D applies only when the user explicitly asks for native Codex models or Route D.

## Route selection policy

Codex MUST choose the best execution route for each meaningful phase of the
user task, not one route for the whole user task.

A single user request may require a route chain.

Examples:

- repo exploration -> Route A;
- file reading / context_pack -> Route A;
- one obvious micropatch in one already-known explicit file -> Route L;
- GitHub/context sync for Web -> GitHub skill through OpenCode;
- native Codex model work explicitly requested by the user -> Route D;
- direct `comfyui-mcp` interaction -> Route D (special rule above; Route A is
  forbidden);
- strong external web/chat with direct GitHub branch/PR delivery -> Route X;
- automated ZIP route when X is unsuitable -> Route W / Web Zworker Auto;
- hard local verification or repair after Web/OpenCode work -> Route C / minimax-m2.5 via ollama_5_round_robin through OpenCode Jobs;
- diff / changed-file verification -> Route A;
- GitHub work -> GitHub skill through OpenCode;
- cleanup -> cleanup skill;
- long report -> report handoff skill;
- direct-route failure recovery -> Route B.

Do not choose one route for the whole task when different phases need different
tools.

### Route A: standard OpenCode MCP / DeepSeek

Default route for ordinary small and low-risk repo/workspace work:

```text
Codex -> mcp__opencode.* -> OpenCode -> deepseek/deepseek-v4-flash
```

Route A is the default for investigation, reading, mapping, verification, and
small low-risk edits.

Route A is also the required route for repository reconnaissance needed to
choose later routes.

Model order for Route A:

1. Primary: `deepseek/deepseek-v4-flash`
2. Fallback 1: `opencode/deepseek-v4-flash-free`
3. Fallback 2: `opencode/mimo-v2.5-free`

Confirmed terminal failure, quota exhaustion, explicit model error, or
confirmed empty/no-content result on Route A triggers fallback chain:

```text
Fallback 1: opencode/deepseek-v4-flash-free -> Fallback 2: opencode/mimo-v2.5-free
```

If the entire fallback chain also fails, returns no usable content, or is unavailable,
Codex MUST stop and explain the blocker to the user.

Route A SHOULD be used for:

- repo search;
- multi-file reading;
- `context_pack`;
- broad prompt shaping for later routes;
- broad request/context packaging;
- project mapping;
- config/log/error analysis;
- safe command discovery;
- diff summary;
- changed-file verification;
- `verify_pack`;
- ZIP unpack review and safe local handoff verification;
- selected local checks and tests after Codex decision;
- tiny obvious edits with no new logic;
- where a feature should live;
- which files are relevant;
- UI/backend and tiny/medium classification when it requires exploration or
  broader evidence than a sufficient Route A extract;
- which commands are safe;
- what changed after another route acted.

For ordinary small tasks, this route is mandatory.

Route A SHOULD NOT be used for medium or larger code implementation merely
because it was used for the earlier exploration phase.

### Route A — Session Journal Tool (documentary subtype)

The Session Journal Tool is a documentary subtype of Route A for recording
session-level documentation artifacts.

v1 conditions:
- invocation: by Codex decision only, NOT an automatic post-hook;
- requires `subproject_id` — if no subproject is active, Codex MUST ask
  the user before proceeding;
- requires `opencode_session_id` obtained via `opencode export`;
- without a valid `opencode export`, v1 is **BLOCKED** — Codex MUST NOT
  proceed.

### Route B: job-wrapper fallback bell route

Use `mcp__opencode_jobs.opencode_job_run_and_wait` only as bounded recovery
when the standard route has already shown a real problem in the current task:

- timeout;
- empty or no text answer;
- busy or stuck session;
- missing final answer;
- check/wait spiral would otherwise be needed.

Fallback bell route MUST NOT become the new default route.
After a fallback attempt, the next new OpenCode task MUST start again with the standard `mcp__opencode.*` route.
Codex MUST NOT begin future tasks with the fallback route merely because it was used before.

### Route W: automated R-like ZIP route

Route W is the automated counterpart of manual R-mode.

Use Route W when Codex should automate ChatGPT Web and receive a ZIP with `answer.md` and optional repo-relative files.

Route W is:

```text
Codex -> ChatGPT Web via Playwright/browser automation -> ZIP with answer.md/files -> Route A or Route C for local follow-up
```

Route W is appropriate when:

- the repository is not marked as collaborative GitHub development;
- Route X is unavailable or inappropriate;
- the desired result is a ZIP, not a Pull Request;
- the external executor should work from published raw/GitHub context rather than direct GitHub branch/PR delivery.

Route W MUST NOT be used for:

- local-only files or facts that are not safely publishable;
- secrets;
- `.env`;
- quick `git status` / repo inspection;
- simple file reading or search;
- test execution;
- dependency installation;
- server/watch commands;
- tiny 1-3 line edits;
- cases where Web latency is not justified.

In a collaborative GitHub repository, Route W is not the default strongest route. Route X is the default for non-simple work that should end as branch + PR.

Route D is not a precondition for Route W. Skill tasks choose a route by work type; D applies only when the user explicitly asks for native Codex models.

Before using Route W, Codex MUST read `zworker-auto`.

### Route W — required skill manifest

Before constructing or sending a Route W prompt, Codex MUST prepare a
`Required Skills Manifest` for every skill that Codex believes may be needed
for the task. The manifest MUST be included in the prompt itself, not kept
only in Codex notes.

For each candidate skill, include:

- exact skill name;
- externally readable `SKILL.md` URL (prefer a raw GitHub URL pinned to the
  relevant commit; use a branch URL only when no commit URL is available);
- why the skill may be needed;
- status: `required` or `conditional`;
- reading order when one skill depends on another.

The Route W prompt MUST instruct the external ChatGPT executor to:

- open and read every `required` skill before doing the task;
- read each `conditional` skill when its condition becomes true;
- report `skills_read`, `skills_skipped`, and `skills_unavailable` in
  `answer.md`;
- stop and report a blocker when a required skill cannot be opened;
- report any additional skill it discovers as potentially relevant instead of
  silently inventing or applying its rules.

Codex MUST NOT publish private local paths, secrets, `.env` files, or
non-public skill contents. If a relevant skill exists only locally, Codex MUST
either publish a safe copy through the approved GitHub/context-sync route or
include the necessary non-secret rules directly in the prompt and mark the
skill URL as unavailable. Listing a link is not evidence that the skill was
read.

### Route X: automatic GitHub-aware branch/PR route

Route X is the automated counterpart of manual Q-mode.

Use Route X when Codex should automate a strong external web/chat executor that works through GitHub and returns:

- branch;
- Pull Request;
- report;
- terminal completion marker.

Route X is:

```text
Codex -> ChatGPT Web via browser automation -> branch + PR + report + terminal marker -> OpenCode GitHub verification
```

In a repository marked as collaborative GitHub development, Route X is the default route for non-simple work.

Route X MUST preserve:

- one task -> one delivery to the collaborative repo's defined delivery target (Real-wargame: direct push to `real-wargame-preview` preferred, PR fallback; other repos define per AGENTS.md contract);
- no direct `main` writes;
- no merge without human permission;
- no auto-merge;
- authoritative truth order: PR diff/branch/commits first, report second;
- a unique terminal completion marker in the final assistant message;
- a separate OpenCode-mediated GitHub verification step after the terminal marker;
- no claim of local verification unless it actually happened.
- R-init preview-доставка использует Route X как транспорт: Route X работает с постоянной веткой real-wargame-preview, прямой push/обновление preview по умолчанию (без PR), r-init-control управляет .bat-лаунчером, чеклистом, GO/NO-GO и merge-handoff.

Route X MUST NOT be used for:

- local-only files or facts that are not safely publishable;
- secrets;
- `.env`;
- quick repo inspection or simple file reads;
- test execution;
- dependency installation;
- server/watch commands;
- tiny 1-3 line edits where Route A is enough;
- cases where Web latency is not justified.

Route D is not a precondition for Route X. Route X is chosen by work type; D applies only when the user explicitly asks for native Codex models.

Before using Route X, Codex MUST read `x-route-control`.

### Route X — required skill manifest

Before constructing or sending a Route X prompt, Codex MUST prepare a
`Required Skills Manifest` for every skill that Codex believes may be needed
for the task. The manifest MUST be included in the prompt itself, not kept
only in Codex notes.

For each candidate skill, include:

- exact skill name;
- externally readable `SKILL.md` URL (prefer a raw GitHub URL pinned to the
  relevant commit; use a branch URL only when no commit URL is available);
- why the skill may be needed;
- status: `required` or `conditional`;
- reading order when one skill depends on another.

The Route X prompt MUST instruct the external GitHub-aware executor to:

- open and read every `required` skill before doing the task;
- read each `conditional` skill when its condition becomes true;
- report `skills_read`, `skills_skipped`, and `skills_unavailable` in the
  final report / terminal block;
- stop and report a blocker when a required skill cannot be opened;
- report any additional skill it discovers as potentially relevant instead of
  silently inventing or applying its rules.

The X executor works through GitHub and MUST receive only externally accessible
safe links. Codex MUST NOT publish private local paths, secrets, `.env` files,
or non-public skill contents. If a relevant skill exists only locally, Codex
MUST either publish a safe copy through the approved GitHub/context-sync route
or include the necessary non-secret rules directly in the prompt and mark the
skill URL as unavailable. Listing a link is not evidence that the skill was
read.

The manifest does not change the Route X contract: one task -> one delivery
(branch + PR or direct preview push), the separate OpenCode-mediated GitHub
verification, and the unique terminal completion marker still apply.

### Route Q — required skill manifest

Route Q is a manual user-controlled GitHub-aware external request mode. It is
not auto-selected, and its source of truth is this dispatcher; it has no
dedicated control skill.

When the user explicitly selects Route Q, the Q task pack/prompt MUST contain a
`Required Skills Manifest` for every skill the manual GitHub-aware executor may
need for the task. The manifest MUST be included in the prompt itself, not kept
only in Codex notes.

For each candidate skill, include:

- exact skill name;
- externally readable `SKILL.md` URL (prefer a raw GitHub URL pinned to the
  relevant commit; use a branch URL only when no commit URL is available);
- why the skill may be needed;
- status: `required` or `conditional`;
- reading order when one skill depends on another.

The Route Q prompt MUST instruct the manual GitHub-aware executor to:

- open and read every `required` skill before doing the work;
- read each `conditional` skill when its condition becomes true;
- report `skills_read`, `skills_skipped`, and `skills_unavailable` in the
  final report and in the PR description when applicable;
- stop and report a blocker when a required skill cannot be opened;
- report any newly discovered skill it deems potentially relevant instead of
  silently inventing or applying its rules.

The Q executor works through GitHub and MUST receive only externally accessible
safe links. Codex MUST NOT publish private local paths, secrets, `.env` files,
or non-public skill contents. If a relevant skill exists only locally, Codex
MUST either publish a safe copy through the approved GitHub/context-sync route
or include the necessary non-secret rules directly in the prompt and mark the
skill URL as unavailable. Listing a link is not evidence that the skill was
read.

### Route C: minimax-m2.5 via ollama_5_round_robin through OpenCode Jobs

Use minimax-m2.5 through the `ollama_5_round_robin` profile via
`mcp__opencode_jobs.opencode_job_run_and_wait` when Route C is selected by
per-phase route planning for a bounded hard local implementation or repair
phase.

Route C is for hard local jobs, not the default strongest thinking route.

Before using Route C, Codex MUST read `opencode-deepseek-pro-jobs-control`.

Codex SHOULD select Route C when the phase needs local hands that Route A
cannot handle reliably and Route W cannot see or should not see the needed
context.

Codex MUST prefer Route C when the implementation phase has two or more of
these signals:

- complex local verification;
- hard failing tests;
- post-Web local repair;
- local context newer than GitHub and not publishable;
- a long bounded local job where Route A is too weak.

Using Route A for exploration does not authorize using Route A for the later
implementation phase.

Route C should not perform initial broad repository exploration.

If Route C implementation needs repo context, Codex MUST first gather the minimum
needed context through Route A, then pass only the bounded implementation
context to the Route C jobs run.

Route C is for:

- hard local `patch_pack` tasks;
- complex local verification and repair;
- one approved difficult bug or bounded fix;
- post-Web cleanup/repair when accepted output still needs local changes;
- medium local fixes when Web cannot see the required local context;
- long bounded local jobs where ordinary Route A is too weak but Codex should
  not work locally.

Route C MUST use only this transport and model:

```text
Codex -> mcp__opencode_jobs.opencode_job_run_and_wait -> job-wrapper -> OpenCode -> ollama_5_round_robin/minimax-m2.5
```

Route C MUST NOT silently fall back to:

- Kimi;
- `opencode/deepseek-v4-flash-free`;
- `deepseek/deepseek-v4-flash`;
- local Codex repo work;
- the old Windows bridge.

Route C MUST NOT be used for:

- initial broad repo exploration;
- vague tasks;
- repo-wide refactors;
- dependency changes;
- install/network/server/watch commands;
- secrets or `.env`;
- permanent OpenCode config edits;
- Git/GitHub write actions;
- tasks too large for one bounded run.

If the task is too large, Codex MUST split it before using Route C.

If minimax-m2.5 via ollama_5_round_robin, the jobs wrapper, or the Route C
result is unavailable, empty, off-scope, or otherwise unusable, Codex MUST stop
and explain the blocker to the user. Codex MUST NOT silently switch to Kimi,
Flash, or local Codex work.

Route A may still be used for tiny code edits when all are true:

- one small file or one obvious local change;
- no new subsystem;
- no non-trivial logic;
- no cross-file reasoning;
- no new test behavior;
- low risk and clearly bounded.

Examples:

- text label change;
- README/Markdown edit;
- simple CSS tweak;
- obvious one-line HTML tweak.

If unsure between Route A and Route C:

- choose Route A for investigation, reading, mapping, and verification;
- choose Route C for implementation, new code, non-trivial logic, or medium
  `patch_pack` work.

### Route L: narrow direct-native-Codex micropatch route (automatic)

Route L is an automatic, narrow, strictly bounded direct-native-Codex path. It
runs on any active native Codex model and requires no Luna/Terra/Sol
definition or model checks.

Route L applies ONLY when all needed context is already explicit and bounded:

- the needed input is one or more explicitly named known files, a provided
  fragment or summary, a ready `context_pack`, or a sufficient Route A extract;
- no repository search, broad reading, discovery, or complex diagnosis is
  needed;
- when the action edits a file, it is at most one obvious micropatch in one
  known explicit file, with no new subsystem or non-trivial logic.

Route L permits only these narrow actions on that ready context:

- reading one or more explicitly named known files, without search;
- explaining a provided fragment or ready summary;
- choosing the next route from a ready `context_pack`;
- limited UI/backend and tiny/medium classification from a sufficient Route A
  extract;
- final preparation of a task statement or prompt for X/W/Q;
- one obvious micropatch in one known explicit file;
- one already-known safe non-destructive check; and
- narrow verification of Route L's own micropatch, within that one check.

Route L forbids:

- recursive search, broad or unbounded reading, `context_pack` creation, and
  mechanical processing/checking of unknown scope;
- complex diagnostics;
- medium or large implementation;
- architectural decisions;
- dependencies, network, servers, watch, secrets;
- Git and GitHub operations;
- cleanup;
- the duties of routes X, W, C, GitHub, cleanup, and report.

If the context is not already known, explicit, and sufficient, Route L is not
applicable and MUST fall back to Route A for the needed reconnaissance, broad
reading, context pack, or mechanical work.

If the task grows beyond the listed narrow actions, including beyond one obvious
micropatch, Codex MUST stop treating it as Route L and re-select the best route
(A/X/C/W) for the larger phase.

If both Route A and Route L are applicable to the same ready bounded phase,
Codex MUST choose Route L. This priority applies only after L's conditions are
proven; any need for search, broad context, or a non-listed action returns the
phase to Route A.

Route L is NOT Route D. Route D remains ONLY for an explicit user request to
hand the whole task (or a phase) to native Codex models. L is automatic, is
not a D phase, and never softens D's explicit-only rule. L never triggers
`d-route-control`.

### Route D: native Codex model route (explicit user request only)

Route D performs the work with the native models of Codex itself, instead of
OpenCode, ChatGPT Web, MiniMax jobs, or the job-wrapper transport.

ComfyUI MCP exception: direct work with the registered `comfyui-mcp` server is
also Route D. This includes listing tools or skills and calling any MCP tool.
It is not delegated to Route A/OpenCode, even when the task is otherwise a
small read-only check.

Codex MUST select Route D ONLY when the user explicitly requests one of:

- work with the native models of Codex itself;
- using Codex directly;
- Route D by name.

Without one of these explicit requests, Codex MUST NOT select Route D for any
task, including skill-authoring, skill-editing, or routing-contract work.

Skill tasks keep normal route selection by work type (A/X/W/C; R/Q only on
explicit manual request). Route D applies only to the part of the task for
which the user explicitly asked for native Codex models.

Choosing Route D changes the model and transport only. It does not override any
safety rule:

- the ban on unconfirmed local filesystem access still applies;
- a separate explicit permission is still required for each exact local Codex
  action;
- GitHub restrictions still apply: direct Codex-side GitHub tools remain
  forbidden, and GitHub work stays OpenCode-mediated;
- existing stop rules, batch economy rules, and the fallback bell route
  (Route B) still apply.

Route D is not R and not Q.
R and Q are manual user-controlled external request modes.
Route D is an explicit user-chosen native Codex route.

Route L is not Route D. L is an automatic narrow direct-native-Codex
micropatch route for already-known context; using L never turns a phase into a
D phase, never implies an explicit D request, and never softens D's
explicit-only rule.

Before using Route D, Codex MUST read `d-route-control`.

## Route decision table

| Task shape | Route |
|---|---|
| User explicitly asks manual `/zworker` | R |
| User explicitly asks manual GitHub-aware external request | Q |
| User explicitly requests native Codex models / direct Codex / Route D | D |
| Direct interaction with `comfyui-mcp` (special rule) | D |
| Simple/fast/low-risk repo work | A |
| Non-simple work in collaborative GitHub repo (preview push or PR per contract) | X |
| Automated ZIP result, X unavailable/inappropriate, or non-collaborative repo | W |
| Ready bounded context: named known files, a provided fragment/summary, a ready `context_pack`, or a sufficient A extract; only L's listed narrow actions, and at most one obvious one-file micropatch | L |
| Bounded local hard implementation/repair requiring local-only state | C |

R and Q are user-controlled manual modes, not automatic Codex routes.
D is an explicit user-requested native Codex route, never auto-selected.
L is an automatic narrow route and is never a D phase; it does not soften
D's explicit-only rule.
When both A and L fit the same ready bounded phase, L has priority; if L's
conditions are not proven, choose A.

## Local Codex work exceptions

Codex local filesystem work is forbidden by default.

This applies to repositories, workspaces, project files, scripts, config files,
documentation files, Codex/OpenCode skills, skill scripts, tests, reports, and
local tool files.

Codex may read, search, list, inspect, edit, delete, archive, or verify local
files only when the user explicitly says in the current task that Codex may
perform that one exact local action without OpenCode.

This permission is single-action only.
It does not authorize local Codex work for the rest of the session.

Route L is a narrow automatic exception: with ready bounded context, Codex may
read explicitly named known files, explain a provided fragment/summary, choose
a route from a ready `context_pack`, classify UI/backend or tiny/medium from a
sufficient A extract, prepare an X/W/Q prompt, or make and narrowly verify one
obvious micropatch in one known explicit file. Route L never authorizes search,
broad reading, larger edits, complex diagnostics, or any duty of
X/W/C/GitHub/cleanup/report; those still require Route A or an explicit
single-action permission.

If Codex concludes that a local action is needed, Codex MUST stop before doing
it and ask the user for permission for that exact local action.

A request to edit a skill, config, script, doc, report, test, or repo file is
not by itself permission for local Codex work.

If OpenCode is unavailable or blocked, Codex MUST stop and report
`TASK_STATUS: BLOCKED` or `TASK_STATUS: PARTIAL` unless the user explicitly
changes the workflow and allows local Codex work.

Codex remains responsible for:

- understanding the task;
- choosing the route;
- shaping prompts;
- deciding risky steps;
- reviewing evidence;
- final user explanation.

### Codex thread/view exception

Viewing or reading another Codex thread or branch inside the Codex application
is a Codex-side application action, not repo/workspace reconnaissance.
It is allowed only as one precise local Codex action on explicit user request
and MUST NOT be used as a repo-reconnaissance shortcut or fallback.

## General plugin skill priority

This OpenCode routing skill has priority for route selection and execution
path.

General creative, brainstorming, or TDD skills MUST NOT create extra approval
gates for isolated bounded prototype tasks unless the user explicitly requested
that workflow.

For standalone throwaway prototypes, Codex may proceed with a compact design
assumption and bounded implementation unless the user explicitly asked for a
separate design approval step.

Do not load general plugin skills merely because the task is creative if doing
so would block the OpenCode route plan or add unnecessary model calls.

Conditional route skills listed in this skill have priority over general plugin
skills.

## Conditional skills

Codex MUST NOT load conditional skills by default.

Codex MUST load a conditional skill only after the route or task type requires
it.

Conditional skills:

- `opencode-zworker-control`
  Load only for `/zworker` or an explicit external worker route request. Do not load it by default.

- `zworker-auto`
  Load for `/zworker-auto` or when the main route planner deliberately selects Route W / Web Zworker Auto for a meaningful phase. Do not load it for ordinary local-only work, simple OpenCode work, manual `/zworker`, or tasks where GitHub context is not publishable.

- `x-route-control`
  Load only for `/X` or an explicit temporary X-route request. Do not load it by default or for ordinary Route W ZIP work.

- `opencode-deepseek-pro-jobs-control`
  Load only when Route C (minimax-m2.5 via ollama_5_round_robin through OpenCode Jobs) is deliberately selected.

- `opencode-kimi-runtime-launch`
  Load only for `/kimifree` or an explicit Kimi request.

- `opencode-github-mcp-control`
  Load only for explicit GitHub tasks or for the narrow Route W GitHub context-sync exception.

- `opencode-report-handoff`
  Load only for long workspace report workflows.

- `opencode-cleanup-control`
  Load only for cleanup planning or cleanup execution.

- `d-route-control`
  Load only when the user explicitly requests Route D (native Codex models / direct Codex / Route D by name). Do not load it for ordinary routes, manual `/zworker`, skill tasks without an explicit D request, or automatic Route L micro-actions (L is not D).

Route L has no separate control skill: its short eligibility and boundary rules
stay in this dispatcher to avoid an extra routing delay.

- `r-init-control`
  Загружать только для R-init интеграции, когда нужен полный preview-цикл: постоянная ветка real-wargame-preview, прямой push/обновление preview по умолчанию (без PR), .bat-лаунчер, чеклист, GO/NO-GO, merge-handoff. Не загружать для обычной Route X доставки без r-init-контракта.

Codex MUST read all needed conditional skills as one source batch.

Codex MUST NOT read conditional skills merely because they exist.

## OpenCode task modes

`context_pack`

- read, search, map, summarize;
- no edits;
- compact output only.

`patch_pack`

- make a small allowlisted edit;
- return changed files, diff summary, checks, and risks.

`verify_pack`

- verify current state, diff, or checks;
- no edits unless explicitly allowed.

## OpenCode task formulation

Every delegated OpenCode work request MUST be formulated as one bounded batch
task using this structure.
This does not apply to narrow status, check, recovery, readback, or discovery
calls explicitly allowed by this skill.

```text
MODE:
GOAL:
SCOPE:
MUST DO:
MUST NOT:
STOP BEFORE:
OUTPUT:
BUDGET:
```

Requirements:

- `MODE` MUST be one of `context_pack`, `patch_pack`, or `verify_pack`;
- `GOAL` MUST state the concrete result;
- `SCOPE` MUST bound files, paths, or decision area;
- `MUST DO` MUST list the minimal required actions;
- `MUST NOT` MUST ban unsafe extras and drift;
- `STOP BEFORE` MUST define the decision boundary;
- `OUTPUT` MUST require compact evidence;
- `BUDGET` MUST bound calls, checks, or artifacts.

### Explicit Codex thread id tracking

When Codex delegates a task to OpenCode through `mcp__opencode_jobs.opencode_job_run_and_wait`
and Codex knows its own active thread id, Codex MUST pass the thread id as
`codex_thread_id` parameter. This makes the OpenCode session title traceable
back to the originating Codex thread (pattern:
`codex-thread-<thread_id>-codex-job-<job_id>`).

When Codex does NOT know or does not have an active thread id, Codex MUST NOT
forge or fabricate one. The parameter is simply omitted, and the job runs without
thread-scoped traceability.

The `codex_thread_id` value is also persisted in `opencode_launch.json` under the
`codex_thread_id` key for post-hoc audit.

Forbidden vague tasks:

```text
study the repo
fix everything
continue until done
do whatever is needed
run all checks
clean up as needed
```

## OpenCode-only categories

The following categories are OpenCode-only by default even when the target is
not a Git repository.

The following repo/workspace tasks are OpenCode-only:

- skill file reading/editing;
- skill script reading/editing;
- local config/script/doc/test/report file work;
- local tool file work;
- repo search and multi-file reading;
- project mapping and entry point discovery;
- `TODO`/`FIXME` audit;
- folder structure, relation/import, config, log, and error analysis;
- safe test/lint/build discovery;
- selected safe test/lint/build execution after Codex decision;
- draft Markdown docs and context packs;
- simple allowlisted edits, diff summary, and changed-file verification;
- workspace-local report handoff;
- cleanup planning and cleanup execution after Codex decision;
- `.gitignore` candidate analysis;
- read-only Git verification.

## OpenCode route policy

Allowed delegation paths:

```text
Primary route:
Codex -> mcp__opencode.* -> OpenCode

Fallback bell route:
Codex -> mcp__opencode_jobs.opencode_job_run_and_wait -> job-wrapper -> OpenCode
```

Do not use for repo tasks:

- `opencode-new-request-windows.ps1`;
- `opencode-runner-windows.ps1`;
- the old request-runner bridge;
- manual shell invocation of `opencode`.

For ordinary OpenCode repo/workspace tasks, Codex MUST use standard
`mcp__opencode.*` first.

If the standard route succeeds and returns useful content, Codex MUST NOT call
the job-wrapper route.

When fallback bell route is used:

- make one bounded fallback attempt;
- do not open a manual `check`/`wait` spiral around it;
- treat it as recovery for the current failed direct-route attempt only.

The fallback bell route is recovery for the current failed direct-route attempt only. It does not change the default route for later tasks. Every new ordinary OpenCode task starts with standard `mcp__opencode.*`.

Fresh-session discovery rule:

- if the fallback tool is not already callable when it is actually needed,
  Codex MUST do exactly one targeted `tool_search` for `opencode_job_run_and_wait`
  or `opencode_jobs`;
- if discovery succeeds, use the discovered fallback route;
- only if that single discovery step fails may Codex report the route unavailable.

Codex MUST NOT use repeated `check`/`wait` loops as the normal waiting method.

## Call budget and hard cap

For ordinary tasks:

- OpenCode/MCP calls target: `2-4`;
- hard cap: `6`.

The hard cap is a stop rule, not advice.

If the hard cap is reached before the task succeeds, stop and report
`TASK_STATUS: PARTIAL` or `TASK_STATUS: BLOCKED`.

Timeout recovery limit:

1. one check or status call;
2. one short wait;
3. one result or readback attempt.

If still unresolved, stop.

Do not call by default:

- `opencode_setup`;
- `opencode_provider_models`;
- extra `tool_search`.

For ordinary Route A tasks, `opencode_provider_models` is not part of the normal
path.

For conditional GitHub tasks, `opencode_setup` and GitHub MCP status/preflight
may be allowed by `opencode-github-mcp-control`, but `opencode_provider_models`
still remains forbidden unless the model discovery rule below allows it.

## Status protocol

OpenCode should return exactly one valid `TASK_STATUS` near the start of the
meaningful answer:

```text
TASK_STATUS: COMPLETED
TASK_STATUS: FAILED
TASK_STATUS: PARTIAL
TASK_STATUS: BLOCKED
TASK_STATUS: BLOCKED_PERMISSION
TASK_STATUS: NEEDS_CODEX_DECISION
```

Protocol goal:

- one valid status;
- near the start;
- no contradictory second status;
- short summary and evidence after status.

Functional result has priority over protocol perfection.

If the task is completed, the repo/workspace is safe, and the result is useful,
that is a functional pass.

Bad, late, or missing `TASK_STATUS`, extra chatter, minor formatting issues, or
pre-existing untracked files are protocol/process warnings, not automatic
failure.

Fail only when the task is not completed, the result is unclear, the
repo/workspace was damaged, a forbidden action was performed, the old bridge
was used, or a required blocker prevented completion.

## Default DeepSeek model

Default model order for Route A:

1. Primary: `deepseek/deepseek-v4-flash`
2. Fallback 1: `opencode/deepseek-v4-flash-free`
3. Fallback 2: `opencode/mimo-v2.5-free`

## Model discovery rule

For Route A / standard OpenCode MCP, Codex MUST use the skill-default model order:

1. Primary: `deepseek/deepseek-v4-flash`
2. Fallback 1: `opencode/deepseek-v4-flash-free`
3. Fallback 2: `opencode/mimo-v2.5-free`

Codex MUST NOT call `opencode_provider_models` merely to confirm or rediscover
this default model.

`opencode_provider_models` is ALLOWED ONLY when:

- `opencode_setup` or a required status/preflight indicates the default provider
  is missing or unavailable;
- the selected route explicitly requires a non-default provider/model;
- the user explicitly asks to inspect or change models;
- there is a confirmed model/provider error and Codex is diagnosing that exact
  blocker.

General MCP tool recommendations to discover providers/models do not override
this skill-default model rule.

Fallback model chain for Route A after confirmed terminal failure, quota exhaustion, explicit
model error, or confirmed empty/no-content result:

1. Fallback 1: `opencode/deepseek-v4-flash-free`
2. Fallback 2: `opencode/mimo-v2.5-free`

If the entire fallback chain also fails or returns no usable content, Codex
MUST stop and explain the blocker to the user.

OpenCode must not ask the human user for permission:

- if a scope or risk decision is needed -> `TASK_STATUS: NEEDS_CODEX_DECISION`;
- if blocked by permission policy -> `TASK_STATUS: BLOCKED_PERMISSION`.

## Long report trigger only

For long outputs, OpenCode should write a workspace-local report artifact
instead of pasting a huge report into chat.

Before detailed long-report handoff, Codex MUST read
`opencode-report-handoff`.

Default report directory remains:

```text
<workspace>\_opencode_reports\
```

Do not use `external_directory` or Codex attachment paths by default.

## GitHub trigger only

GitHub is explicit-only except for the narrow Route W context-sync exception
defined below.

Before any GitHub task, Codex MUST read `opencode-github-mcp-control`.

GitHub route is OpenCode-mediated only.

For any GitHub task, "GitHub MCP" means:

Codex -> mcp__opencode.* -> OpenCode -> GitHub MCP

Codex MUST NOT use direct Codex-side GitHub tools or connectors, including but
not limited to tools named like:

- `mcp__codex_apps__github.*`;
- `github.*`;
- direct GitHub connector actions;
- local `gh`;
- direct GitHub API calls.

This ban applies even for read-only GitHub tasks.

A successful OpenCode preflight is not enough. The actual GitHub read/write
operation MUST also be performed through OpenCode.

Using direct Codex-side GitHub tools is a route violation, even if the action is
read-only and the result is correct.

No GitHub MCP, `gh`, PR, issue write, push, merge, or remote write action is
allowed unless the user explicitly requested a GitHub task and the GitHub
skill allows it.

Exception: the skill-edit commit/push obligation (see Git write restrictions
section) creates a narrow exception for skill-file edits within the completion
phase of a task that modified skills.

## Published GitHub Context Rule

Before Route W / Web Zworker Auto, Codex MUST ensure that all required repo
context is available through externally-readable GitHub/raw URLs.

If required files or changes exist only locally, or local state is newer than
GitHub, Codex MUST use OpenCode to prepare and publish the minimum required
context before invoking Route W.

Preferred method:

- create or update a temporary context branch: `zworker-context/<request-id>`;
- push only the files or context required by the Web phase;
- put raw GitHub URLs from that branch into the zworker prompt.

Safety rules:

- do not push secrets;
- do not push `.env`;
- do not push unrelated files or broad repo writes;
- do not write to `main` unless explicitly approved;
- use temporary branches when they are sufficient.

If the context cannot be safely published, Route W is blocked for that part
and Codex MUST continue with Route A / Route C locally or stop with a clear
blocker.

## Cleanup trigger only

Cleanup requires a decision loop.

Before cleanup planning or cleanup execution, Codex MUST read
`opencode-cleanup-control`.

Default rule:

```text
OpenCode proposes cleanup plan -> Codex selects approved paths -> OpenCode deletes/archives only selected paths.
```

Codex MUST NOT delete/archive repo paths locally.
OpenCode MUST NOT decide on its own what to delete/archive.

## Test/lint/build loop

Test/lint/build loop:

1. OpenCode discovers possible commands and rates safety.
2. Codex selects one safe command or refuses execution.
3. OpenCode executes only the selected command.

Without a separate Codex decision, do not run:

- install commands;
- network commands;
- server or watch commands;
- commands requiring secrets;
- commands that write external directories;
- Git write commands.

## Git write restrictions

Local Git writes are forbidden by default:

- `git add`;
- `git commit`;
- `git push`;
- `git merge`;
- `git rebase`;
- `git reset`;
- `git clean`;
- pull requests;
- remote/GitHub write actions.

### Skill-edit commit/push obligation

When the current task edits any skill file (*SKILL.md*, skill scripts, or
skill-pack files governed by this routing framework), those changes are not
considered complete until the commit and push to GitHub have been prepared or
executed.

Codex MUST include commit/push of skill changes in the mandatory completion
phase, unless:

- the user explicitly forbids remote write in the current task;
- the GitHub/remote route is blocked or unavailable;
- the user has explicitly changed the workflow to allow local-only skill edits
  without GitHub sync.

This is a narrow exception to the general Git write restriction: it applies
only to skill-file edits and only within the completion phase of a task that
modified skills.

This obligation does not authorize general repo Git writes, unrelated commits,
or PRs outside the skill scope.

## User-facing compact output

Codex must keep user-facing output compact.

OpenCode output should also stay compact:

- no progress messages;
- no long logs;
- no huge report restatements in chat when a file artifact exists.

Route reminder:

```text
Small work -> standard OpenCode MCP / DeepSeek (Route A).
Route A model order: deepseek/deepseek-v4-flash -> opencode/deepseek-v4-flash-free -> opencode/mimo-v2.5-free.
Route A fallback chain failed -> stop and explain the blocker.
Direct MCP failed in current task -> one job-wrapper fallback attempt.
Next new task -> standard OpenCode MCP again.
Manual /zworker -> R (user-controlled, Codex does not auto-select).
Manual GitHub-aware external request -> Q (user-controlled, Codex does not auto-select).
Native Codex model work -> Route D (explicit user request only, never auto-selected).
One obvious micropatch in one already-known explicit file -> Route L (automatic narrow direct-native-Codex route; not a D phase; else Route A).
Automated ZIP route when X unsuitable -> Route W / Web Zworker Auto.
Automated GitHub delivery route in collaborative repo (preview push or PR) -> Route X.
R-init preview-интеграция -> r-init-control (workflow) + Route X (транспорт: прямой push в real-wargame-preview, без PR по умолчанию).
Local reconnaissance, prompt shaping, ZIP verification, and selected checks -> Route A.
Hard local verification/repair -> Route C / minimax-m2.5 via ollama_5_round_robin through OpenCode Jobs.
Route C minimax-m2.5 / ollama_5_round_robin failed -> stop and explain the blocker.
Kimi -> manual-only via /kimifree or explicit user request.
Codex local repo work -> only with explicit workflow change (see Local Codex work exceptions).

Route chain reminder:

- investigation -> Route A;
- reading/context -> Route A;
- GitHub/context sync for Web when needed -> GitHub skill through OpenCode;
- native Codex models explicitly requested by the user -> Route D;
- direct `comfyui-mcp` interaction -> Route D; Route A is forbidden for this
  server;
- one obvious micropatch in one already-known explicit file -> Route L;
- automated GitHub branch/PR delivery -> Route X;
- R-init preview-интеграция -> r-init-control (workflow) + Route X (транспорт: прямой push в real-wargame-preview, без PR по умолчанию);
- automated ZIP route when X unsuitable -> Route W;
- unzip/review/verification -> Route A;
- hard local repair -> Route C;
- verification/diff -> Route A;
- GitHub -> GitHub skill through OpenCode;
- cleanup -> cleanup skill;
- long report -> report handoff skill;
- fallback -> Route B only after direct-route failure.
```

When reporting the route chain to the user, include the concrete provider/model
used for each phase that actually ran, when known (for example
"Route A via deepseek/deepseek-v4-flash" rather than just "Route A").

## Regression smoke

After editing this skill, run a minimal smoke:

- skill read first;
- filesystem-backed skill/config/script/doc tasks require OpenCode by default;
- a request to edit a skill is not by itself permission for local Codex work;
- Codex local file work happens only after explicit permission for one exact
  local action;
- if Codex wants local work, Codex stops first and asks for that exact action;
- no local repo inspection;
- Codex does not inspect repo locally to choose a route;
- repo reconnaissance for route selection uses Route A;
- Route C implementation receives bounded context gathered by Route A;
- route choice based on repo structure never uses local `ls/rg/Get-Content/git`;
- conditional skills are not loaded by default;
- Codex chooses routes per phase, not one route for the whole task;
- Route A exploration does not force Route A implementation;
- Route A primary model is `deepseek/deepseek-v4-flash`;
- Route A fallback models are `opencode/deepseek-v4-flash-free` then `opencode/mimo-v2.5-free`;
- Route A stops and reports if the entire fallback chain also fails;
- Route W exists in the main dispatcher;
- Route W is the automated R-like ZIP route, not the default strongest route in collaborative repos;
- Route X is the automatic Q-like branch/PR route, default for non-simple collaborative work;
- Route D is the explicit user-requested native Codex model route, not a skill-authoring gate;
- `comfyui-mcp` is a Route D special case: all discovery, skill, workflow, and
  verification calls go directly through the MCP; Route A MUST NOT interact
  with it;
- Route L is the automatic narrow direct-native-Codex micropatch route for already-known explicit files;
- Route L permits reading explicitly named known files, explaining a provided fragment/summary, route choice from a ready `context_pack`, limited UI/backend and tiny/medium classification from a sufficient A extract, and final X/W/Q prompt preparation;
- Route L permits at most one obvious micropatch in at most one known file plus one already-known safe non-destructive check, which may narrowly verify that L micropatch;
- Route L requires no Luna/Terra/Sol definition or model checks and runs on any active native Codex model;
- Route L falls back to Route A when the context is not already known and explicit;
- when both A and L fit the same ready bounded phase, L has priority; any
  uncertainty about L returns the phase to A;
- Route L is not Route D; D remains explicit-user-only and L never softens it;
- Route L has no separate control skill and never loads `d-route-control`;
- Route L forbids search, broad reading, complex diagnostics, medium/large implementation, architecture, dependencies/network/servers/watch/secrets, Git/GitHub, cleanup, and X/W/C/GitHub/cleanup/report duties;
- R (manual /zworker) and Q (manual GitHub-aware) are user-controlled manual modes, not Codex-selected routes;
- Route D local-work safety is governed by the Local Codex work exceptions, not granted by D itself;
- `d-route-control` loads only when the user explicitly requests Route D;
- one user task may use a route chain rather than one route for the whole task;
- a typical route chain may be Route A -> GitHub/context sync -> Route X/Route W -> Route A -> Route C -> Codex decision;
- `zworker-auto` loads when Route W is deliberately selected;
- manual `/zworker` remains manual and user-triggered;
- GitHub context must be current before Route W;
- if needed context is local-only, Codex creates/pushes a temporary context branch or blocks Route W;
- OpenCode-mediated GitHub context sync remains required for Route W;
- direct Codex-side GitHub tools remain forbidden;
- OpenCode Route A remains the default for local reconnaissance and verification;
- Route W is appropriate for automated ZIP work when X is unsuitable; in collaborative repos X is the default for non-simple work;
- Route C is not the default strongest-thinking route;
- Route C is for hard local jobs, post-Web repair, and complex local verification;
- Route C uses minimax-m2.5 via ollama_5_round_robin through `mcp__opencode_jobs.opencode_job_run_and_wait`;
- Route C does not silently fall back to Kimi, Flash, deepseek-v4-pro, local Codex work, or the old bridge;
- Kimi is manual-only through `/kimifree` or explicit Kimi request;
- verification after Route C may return to Route A;
- general brainstorming/TDD plugin skills do not add approval gates unless user
  explicitly requested that workflow;
- final report includes the route chain used;
- one bounded OpenCode task by default;
- explicit `MODE/GOAL/SCOPE/MUST DO/MUST NOT/STOP BEFORE/OUTPUT/BUDGET`;
- target `2-4` calls, hard cap `6`;
- test/lint/build loop stays in main skill;
- job-wrapper fallback stays in main skill;
- no old bridge;
- no `external_directory`;
- GitHub read-only must use OpenCode-mediated route;
- direct Codex-side GitHub tools are forbidden even for read-only;
- OpenCode preflight followed by direct Codex GitHub reads is a route violation;
- valid GitHub route proof must say: direct Codex-side GitHub tools used: no;
- skill edits include mandatory commit/push obligation in completion phase
  (see Git write restrictions section);
- compact final answer.
