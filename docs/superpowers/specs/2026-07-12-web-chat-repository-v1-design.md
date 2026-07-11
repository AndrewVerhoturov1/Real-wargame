# Web-Chat Repository Context v1 — Design

Date: 2026-07-12
Branch: `feature/web-chat-repository-v1`
Target after human approval: `real-wargame-preview`

## Goal

Make `Real-wargame` reliably understandable to a new GitHub-aware web chat without access to previous conversations, while reducing duplicated and contradictory status text.

## Scope

This change affects repository guidance, subproject metadata, generated navigation, documentation integrity checks and project-local agent skills. It does not change gameplay, rendering, AI behavior, scene data or the current `MoveToBlackboardPosition` implementation.

## Canonical sources

Current repository-wide state is stored in:

- `docs/ai/repo-context.json`.

Current subproject state is stored in:

- `docs/subprojects/<id>/subproject.json`.

Generated Markdown is a view of those JSON files and must not be edited as an independent source of current status.

## Generated documents

`node scripts/generate_agent_docs.mjs` generates:

- `docs/ai/CURRENT_STATE.md`;
- `docs/subprojects/index.json`;
- `docs/subprojects/INDEX.md`;
- `docs/subprojects/<id>/STATUS.md`.

Generation must be deterministic.

## Validation

`node scripts/check_agent_docs.mjs` validates:

- repository metadata schema;
- known subproject statuses;
- active-subproject references;
- canonical branch and launcher rules;
- referenced file and directory paths;
- generated-document freshness;
- PixiJS major-version consistency with `package.json`;
- relative Markdown links in active agent-facing documents;
- journal index coverage where a `journal/` directory is used.

Markdown-link validation is intentionally limited to current entry pages, generated indexes, architecture routes and the active subproject. Historical documents are not allowed to make the current workflow permanently red.

Globs such as `path/*` are validated by checking the parent directory.

## Status model

Allowed subproject statuses:

- `active`;
- `maintenance`;
- `planned`;
- `paused`;
- `completed`;
- `superseded`;
- `historical`.

`ai-single-unit-editor` is the active development subproject.
`real-wargame-start` is maintenance.
`github-collaboration` is maintenance.
`repo-migration` is historical.

## Agent entry route

A GitHub-aware web chat reads, in order:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. the active subproject `STATUS.md`;
5. only the task-relevant project skill.

Detailed workflow history is not part of the default route.

## GitHub delivery policy

The canonical rule is:

- preferred delivery: direct commit/push to `real-wargame-preview`;
- fallback: temporary branch and Pull Request into `real-wargame-preview`;
- `main` requires explicit human GO;
- this implementation remains only on `feature/web-chat-repository-v1` until the user requests transfer.

## PixiJS compatibility

The project uses PixiJS 7. The repository-local `real-wargame-pixijs` skill must be read before the general PixiJS v8-oriented skill collection. No v8 API may be introduced without an explicit migration task.

## Skill structure

Add:

- `.agents/skills/real-wargame-pixijs/SKILL.md`;
- `.agents/skills/real-wargame-ai-runtime/SKILL.md`.

Keep the existing local-preview skill intact in v1 to avoid a large simultaneous rewrite. Its split into references is a later isolated task.

## CI integration

Add an `agent-docs-integrity` workflow that runs generation and validation on documentation-sensitive changes. The check fails if generated files are stale.

## Error reporting

Validation failures must:

- name the exact file or field;
- explain the expected correction;
- report all discovered problems in one run where practical;
- exit non-zero.

## Compatibility

Existing human-readable files remain available. They are shortened or marked as stable/reference material, but current status is routed through generated `STATUS.md` files.

## Acceptance criteria

A clean GitHub-aware agent can determine from no more than five entry files:

- the working and stable branches;
- the active subproject;
- the current focus and next step;
- the canonical launcher;
- the PixiJS major version;
- the relevant skills and checks;
- that `main` cannot be changed without explicit GO.

`npm run docs:check` must pass on the feature branch. No commit is transferred to `real-wargame-preview` during this task.
