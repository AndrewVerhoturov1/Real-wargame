# Agents

This project uses OpenCode with subproject-based memory system.

## Subproject Workflow

1. Read `docs/subprojects/<id>/SUBPROJECT.md`, `docs/subprojects/<id>/subproject.json`, and `docs/subprojects/<id>/JOURNAL.md` (if exists).
2. Run `python scripts/subproject_context.py <id> --brief` or `--opencode`.
3. Start from `Current focus` and `Must read first`.
4. Expand into main files, tests, or reports only when the task requires them.

## Commands

    python scripts/subproject_context.py --list
    python scripts/subproject_context.py <id> --brief
    python scripts/subproject_context.py <id> --opencode
    python scripts/subproject_context.py <id> --files