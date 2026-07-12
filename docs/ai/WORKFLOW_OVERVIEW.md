# GitHub Collaboration Overview

This document explains the collaboration system in plain language. The short binding contract is `AGENTS.md`; machine-readable policy is in `docs/ai/repo-context.json`.

## Roles

### Human

The human defines the goal, tests the result when needed and makes the final GO/NO-GO decision. The human is not expected to manage Git, terminals, branches, merge conflicts or CI details.

### GitHub-aware web chat

The web chat can read repository context, implement a bounded task, deliver it to preview or an explicitly requested isolated branch, inspect checks and report honestly.

### Codex

Codex acts as controller and reviewer: it prepares tasks, verifies diffs and checks, explains risks and helps the human test the result.

### OpenCode

OpenCode handles bounded routine work such as search, commands, logs, focused edits and documentation updates under Codex control.

### Manual zworker

A manual zworker has no repository state. It receives explicit public files and returns a ZIP with `answer.md` and repo-relative files.

## Branches

```text
main                  stable branch; explicit human GO required
real-wargame-preview  normal working and human-test branch
feature/*             isolated or temporary work when requested/needed
```

## Normal GitHub-aware delivery

Preferred route:

```text
bounded task
→ direct commit/push to real-wargame-preview
→ automated checks
→ human-facing report
```

Fallback route:

```text
temporary task branch
→ Pull Request into real-wargame-preview
→ automated checks and review
→ transfer result to preview
→ close temporary branch and PR
```

Explicit isolation route:

```text
user says not to transfer yet
→ keep work on the named feature branch
→ run branch/PR checks without merge
→ report transfer_path: isolated branch only
```

## Modes

### R

Manual external worker without GitHub write access. Input is explicit public context; output is a ZIP with `answer.md`.

### Q

GitHub-aware bounded implementation. Output is a commit in `real-wargame-preview`, or a PR into preview when direct delivery is impossible. It is not a ZIP workflow.

### X / r-init

Human preview workflow for changes that must be launched and tested before acceptance. It includes a terminal-free launcher, a human checklist and explicit GO/NO-GO.

Route X may be used as a delivery mechanism, but it is not identical to the complete r-init process.

## Required checks

Every report states:

- what changed;
- exact branch and commit/PR;
- how the result was delivered;
- checks that actually ran;
- checks that did not run;
- human verification still needed;
- known risks;
- whether `main` was touched.

For visual work, a green workflow is insufficient until fresh PNG artifacts from the same commit are opened and inspected.

## Documentation state

Current status is stored only in:

```text
docs/ai/repo-context.json
docs/subprojects/<id>/subproject.json
```

Generated status pages are refreshed with:

```text
npm run docs:sync
```

## Safety

Never:

- write or merge to `main` without explicit human GO;
- enable auto-merge;
- publish secrets or private data;
- claim checks that did not run;
- leave temporary branches or visual-QA PRs open without an explicit reason;
- ask the human to perform Git or terminal work that an agent can safely perform.

Detailed references:

```text
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/ZWORKER_MODES.md
docs/ai/R_INIT_WORKFLOW.md
docs/ai/PR_REVIEW_CHECKLIST.md
```
