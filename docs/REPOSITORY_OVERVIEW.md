# Repository Overview

## Purpose

`Real-wargame` is intended to be a real-time strategy game project. The published `main` branch currently contains repository, collaboration, and subproject-memory scaffolding rather than a game runtime implementation. Its present focus is making work discoverable and safe for humans and AI agents through bounded context, dedicated branches, and Pull Requests.

## Main tech stack

- **Python 3 (standard library):** repository tooling in `scripts/subproject_context.py`.
- **Markdown and JSON:** documentation, durable subproject memory, and configuration.
- **OpenCode:** configured through `opencode.json`, with job defaults under `config/`.
- **GitHub workflow:** one task, one branch, one Pull Request, with human approval before merge.

There is currently no `package.json`, `src/` directory, application build system, or checked-in game runtime on `main`.

## Top-level structure

```text
.github/       Pull Request template
config/        OpenCode job defaults
 docs/         Repository, AI-workflow, and subproject documentation
scripts/       Python repository utilities
AGENTS.md      Agent workflow and GitHub collaboration contract
README.md      Short project entry point
opencode.json  OpenCode provider configuration
```

## Key directories

- `scripts/` — contains `subproject_context.py`, the CLI used to discover subprojects and print bounded context, file lists, or OpenCode-oriented memory.
- `docs/ai/` — collaboration workflow documentation for humans, Codex, OpenCode, external GitHub-capable agents, PR review, and post-PR consolidation.
- `docs/subprojects/` — durable memory for long-running work. Each active subproject normally contains `SUBPROJECT.md`, `subproject.json`, and optionally `JOURNAL.md` and `test-program.md`.
- `docs/subprojects/_template/` — starting template for a new subproject.
- `docs/subprojects/repo-migration/` — memory for the initial repository migration and scaffolding work.
- `docs/subprojects/github-collaboration/` — memory for the branch/PR-based collaboration system.
- `config/` — defaults for local OpenCode job execution and cleanup.
- `.github/` — repository-level GitHub contribution templates.

## Important documentation and memory locations

Start with these navigation documents:

- `AGENTS.md` — authoritative agent rules, branch/PR policy, roles, and safety boundaries.
- `README.md` — brief project description and subproject CLI entry points.
- `docs/subprojects/README.md` — explains the subproject-memory model and economical reading order.
- `docs/ai/WORKFLOW_OVERVIEW.md` — overview of the shared GitHub development workflow.
- `docs/ai/ROLES.md` — responsibilities and boundaries for each participant.
- `docs/ai/PR_REVIEW_CHECKLIST.md` and `docs/ai/POST_PR_CONSOLIDATION.md` — review and consolidation guidance after a PR exists.

For a specific subproject, read its memory in this order:

1. `docs/subprojects/<id>/SUBPROJECT.md`
2. `docs/subprojects/<id>/subproject.json`
3. `docs/subprojects/<id>/JOURNAL.md`, when present

Then follow the subproject's `Current focus`, `Must read first`, and `Main files` fields instead of scanning the whole repository.

## Basic commands

The repository currently exposes subproject-context commands rather than application dev/build commands:

```bash
python scripts/subproject_context.py --list
python scripts/subproject_context.py <id> --brief
python scripts/subproject_context.py <id> --opencode
python scripts/subproject_context.py <id> --files
```

No npm install, development, test, or build scripts are defined because `package.json` is not present on `main`.

## How to start reading this repository

1. Read `AGENTS.md` for mandatory workflow and safety rules.
2. Read `README.md` and `docs/subprojects/README.md` for navigation.
3. Run the subproject list command and choose the subproject relevant to the task.
4. Read only that subproject's memory triad and the files listed under `Must read first`.
5. Open `docs/ai/` when the task involves branches, Pull Requests, external agents, review, or consolidation.
6. Expand into implementation files only when they are added or explicitly referenced by the active subproject.
