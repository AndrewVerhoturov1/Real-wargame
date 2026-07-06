# <Subproject title>

## Goal

<One stable sentence describing the outcome.>

## Current focus

<The single active slice of work.>

## Key decisions

- <Decision that must not be rediscovered.>

## Read first

1. `docs/subprojects/<id>/SUBPROJECT.md`
2. `docs/subprojects/<id>/subproject.json`
3. `docs/subprojects/<id>/JOURNAL.md` (если существует)
4. `python scripts/subproject_context.py <id> --brief`

## Boundaries

- Read only files needed for the current focus.
- Do not scan raw telemetry or report roots by default.

## Testing

Test program: `docs/subprojects/<id>/test-program.md` (создать при появлении тестов)