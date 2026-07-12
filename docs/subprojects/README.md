# Subprojects

A subproject is a bounded map of one long-running area of work.

## Start here

For a human-readable list:

```text
docs/subprojects/INDEX.md
```

For a GitHub-aware agent or script:

```text
docs/subprojects/index.json
```

These files are generated from every `docs/subprojects/<id>/subproject.json`.

## Current-state rule

The canonical current state of a subproject is:

```text
docs/subprojects/<id>/subproject.json
```

The convenient generated view is:

```text
docs/subprojects/<id>/STATUS.md
```

Do not manually edit `STATUS.md`.

## Stable and historical files

```text
SUBPROJECT.md   stable goal, architecture and boundaries
HANDOFF.md      only the latest incomplete-session delta when needed
JOURNAL.md      historical index and significant events
journal/        detailed historical entries
STATUS.md       generated current state
subproject.json canonical machine-readable state
```

A new agent normally reads `STATUS.md` first. It opens `SUBPROJECT.md` for stable architecture, `HANDOFF.md` only for immediate continuation, and journals only when historical reasoning is required.

## Allowed statuses

```text
active
maintenance
planned
paused
completed
superseded
historical
```

The repository-wide active IDs are declared in:

```text
docs/ai/repo-context.json
```

## Commands

```text
npm run docs:generate
npm run docs:check
npm run docs:smoke
npm run docs:sync

python scripts/subproject_context.py --list
python scripts/subproject_context.py <id> --brief
python scripts/subproject_context.py <id> --opencode
python scripts/subproject_context.py <id> --files
```

The Python commands remain useful locally. Web chats should use the committed static indexes instead of assuming they can run Python.

## Updating a subproject

1. Edit `subproject.json`.
2. Update stable `SUBPROJECT.md` only when architecture or boundaries changed.
3. Add a journal entry only for a significant event.
4. Run `npm run docs:sync`.
5. Commit JSON and all generated files together.

## Reading economy

Do not open by default:

- all journal entries;
- raw telemetry;
- `_zworker_requests` and `_zworker_inbox`;
- `_opencode_reports`;
- every test listed by the subproject;
- all skills.

Expand context only from the active `STATUS.md`, direct code dependencies and the task router.
