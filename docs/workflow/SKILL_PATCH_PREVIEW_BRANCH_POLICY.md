# External Skill Branch Policy

This compatibility document exists for external local skills that still reference the former preview-branch policy.

The old rule “push finished work directly to `real-wargame-preview`, use a temporary branch only as fallback” is revoked.

Current canonical policy:

```text
AGENTS.md
docs/ai/WEB_CHAT_START.md
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
```

## Required route for any implementation skill

1. Resolve the exact current remote head of `real-wargame-preview`.
2. Create one temporary feature branch:

```text
feature/YYYYMMDD-short-kebab-slug
```

3. Implement, commit, push and perform later fixes only on that feature branch.
4. Run focused non-browser checks before reporting readiness.
5. Report the exact base commit, current commit and manual live-test checklist.
6. The user gives the already-pushed branch to Codex once.
7. Codex only exposes a branch-linked Vercel Preview and returns the URL.
8. The user performs live testing.
9. Fix all reported defects on the same feature branch.
10. Run visual GitHub Actions verification only after explicit user approval.
11. Transfer into `real-wargame-preview` only after explicit user GO for the exact tested commit.
12. Do not change `main` without separate explicit user GO.

## Prohibited for external skills

- direct implementation push to `real-wargame-preview`;
- PR-first feature development;
- Codex implementation, fixes, merge or branch transfer;
- automatic browser checks on push;
- a new feature branch for every NO-GO issue;
- transfer into preview before explicit user approval.

## Local folders

A local `Real-wargame-preview` folder may remain available as an optional diagnostic convenience, but it is not the canonical live-test route for unfinished features. The normal human test uses the branch-linked Vercel Preview of the feature branch.

External skill files outside the repository are not physically edited by this document. Any such skill must read this repository policy at task start and follow it over older cached instructions.
