# Repo Migration

## Goal

Prepare Real-wargame repo for work without copying global skills - globalize 4 local subproject skills and create minimal repo-local artifacts.

## Current focus

Initial setup complete - skills globalized, subproject system ready.

## Key decisions

- Skills globalized to C:\Users\andre\.agents\skills
- Minimal repo-local artifacts only - no .agents/skills folder
- UTF-8 for all text files

## Read first

1. `docs/subprojects/repo-migration/SUBPROJECT.md`
2. `docs/subprojects/repo-migration/subproject.json`
3. `docs/subprojects/repo-migration/JOURNAL.md` (если существует)
4. `python scripts/subproject_context.py repo-migration --brief`

## Boundaries

- Read only files needed for the current focus.
- Do not scan raw telemetry or report roots by default.

## Testing

Test program: `docs/subprojects/repo-migration/test-program.md` (создать при появлении тестов)