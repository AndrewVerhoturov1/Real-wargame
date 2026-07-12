# Q-Mode GitHub Task Template

Use Q only for a GitHub-aware executor. Q does not return a ZIP.

```md
# Q-mode GitHub task

Project: Real-Wargame
Repository: AndrewVerhoturov1/Real-wargame
Subproject: <id or none>
Expected size: <small | medium | large | planning-only>
Delivery: <direct-preview | pr-fallback | isolated-branch>

## Read first

- AGENTS.md
- docs/ai/WEB_CHAT_START.md
- docs/ai/repo-context.json
- docs/subprojects/index.json
- docs/subprojects/<id>/STATUS.md
- <relevant project skill>

## Goal

<One clear result.>

## Allowed changes

- <files/directories>

## Forbidden changes

- main
- <other files or behaviors>

## Requirements

- <requirement 1>
- <requirement 2>

## Acceptance criteria

- <observable or testable result>
- <required checks>

## Output for Codex/human

Reply with:

- repository;
- branch;
- commit SHA;
- PR number/link only if PR fallback was used;
- transfer_path;
- changed files;
- checks run;
- not checked;
- risks;
- human verification steps;
- main_touched.

Do not merge. Do not enable auto-merge. Do not write to main without explicit human GO. Do not claim checks that did not run.
```

## Delivery values

### `direct-preview`

Preferred normal route:

```text
commit/push directly to real-wargame-preview
```

### `pr-fallback`

Use only when direct preview delivery is impossible or deliberate review isolation is needed:

```text
temporary branch → PR into real-wargame-preview
```

### `isolated-branch`

Use when the user explicitly says not to transfer yet. Keep changes on the named branch and report:

```text
transfer_path: isolated branch only
```

## Not a Q result

If repository delivery was required but no commit or PR was created, report:

```text
Result not delivered: <reason>
```

Do not silently replace Q with a ZIP. Use R only when the task explicitly requires the manual no-GitHub route.
