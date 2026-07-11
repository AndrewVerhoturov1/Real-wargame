# GitHub Collaboration

## Goal

Keep repository collaboration understandable and safe for a non-programmer human, Codex, OpenCode and GitHub-aware web chats.

Current machine-readable status:

```text
docs/subprojects/github-collaboration/STATUS.md
docs/subprojects/github-collaboration/subproject.json
```

## Stable decisions

- `real-wargame-preview` is the normal working and human-test branch.
- `main` is stable and requires explicit human GO.
- Direct push to preview is the preferred bounded GitHub-aware delivery route.
- A temporary branch and PR into preview is the fallback when direct delivery is impossible, conflicted or deliberately isolated.
- A user-requested isolated branch remains isolated until the user requests transfer.
- Auto-merge is forbidden.
- The human is not expected to manage Git or terminal commands.
- Checks and visual inspection must be reported honestly.
- Temporary branches and visual-QA PRs are closed after use unless a reason is documented.

## Current-state architecture

Repository-wide state:

```text
docs/ai/repo-context.json
```

Subproject state:

```text
docs/subprojects/<id>/subproject.json
```

Generated navigation:

```text
docs/ai/CURRENT_STATE.md
docs/subprojects/index.json
docs/subprojects/INDEX.md
docs/subprojects/<id>/STATUS.md
```

Integrity commands:

```text
npm run docs:smoke
npm run docs:generate
npm run docs:check
npm run docs:sync
```

## External modes

### R

Manual no-GitHub worker. Receives explicit public context and returns a ZIP with `answer.md` and repo-relative files.

### Q

GitHub-aware bounded task. Delivers directly to preview when possible, uses a PR into preview as fallback, or stays on an explicitly requested isolated branch.

### X / r-init

Preview-and-test workflow with a terminal-free launcher, human checklist and explicit GO/NO-GO.

Detailed mode contracts remain in `docs/ai/ZWORKER_MODES.md` and `docs/ai/R_INIT_WORKFLOW.md`.

## Boundaries

- Do not make `main` a working branch.
- Do not require a PR when direct preview delivery is safe and permitted.
- Do not bypass review by self-merging.
- Do not publish private context.
- Do not add unrelated CI/security/process expansion to a game task.
- Do not duplicate rapidly changing status across multiple hand-written Markdown files.

## Verification

For collaboration/documentation changes:

```text
npm run docs:smoke
npm run docs:generate
git diff --exit-code
npm run docs:check
```

When workflow files change, also inspect the GitHub Actions result on the exact commit.
