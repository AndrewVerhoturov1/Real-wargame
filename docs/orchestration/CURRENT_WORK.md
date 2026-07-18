# Current Chat-Orchestration Work

## Active workflow

The canonical Web Chat feature-delivery workflow is active.

```text
user task
→ one designated Web Chat creates one feature branch from the exact current real-wargame-preview head
→ optional research/proposal workers return analysis, files or patches
→ designated Web Chat integrates and implements in the same feature branch
→ focused non-browser checks
→ push and readiness report
→ user gives the branch to Codex once
→ Codex only exposes a branch-linked Vercel Preview and returns the URL
→ human live test
→ same-branch revisions by the designated Web Chat
→ optional visual GitHub Actions verification after explicit approval
→ explicit user GO
→ designated Web Chat transfers the exact accepted commit into real-wargame-preview
```

Canonical documents:

```text
AGENTS.md
docs/ai/WEB_CHAT_START.md
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/orchestration/CHAT_WORKFLOW.md
```

## Role status

```text
canonical_feature_branch_owner: designated Web Chat
worker_chats: research/proposals only
codex_role: branch-linked Vercel Preview only
human_role: live test, optional visual-QA request, explicit preview-transfer GO
preview_role: acceptance target after GO
main_role: stable branch requiring separate explicit GO
```

Do not use the former active route:

```text
orchestrator
→ parallel implementation branches/PRs
→ separate integrator
→ direct transfer into real-wargame-preview
```

Do not use Q/R/X/W or r-init for new feature work.

## Current campaign

No repository-wide parallel campaign is declared active by this file.

Each new feature task creates its own canonical branch:

```text
feature/YYYYMMDD-short-kebab-slug
```

The designated Web Chat records:

```text
feature_branch
base_commit
current_commit
delivery_state
vercel_preview
live_test_status
visual_qa_status
preview_transfer_approval
```

Feature-specific current state belongs in the task report or an explicitly created campaign section. Do not rewrite this file for every small task unless multi-chat coordination actually starts.

## Historical closed campaign

The former `stage1-nonvisual-closure-proof-a` campaign is closed historical evidence.

```text
status: nonvisual-integrated-and-verified
accepted preview commit: 7d1f3b8dc73b413c0644bf4b9e090e5d2d620960
visual QA at closure: pending separate approval
main touched: no
```

Its old branches, PRs and transfer sequence do not define current workflow policy. Consult Git history and the closed PRs only when investigating that campaign.

## Current invariants

- direct implementation on `real-wargame-preview` is forbidden;
- all live-test fixes stay on the same canonical feature branch;
- Codex does not implement, fix, merge or transfer;
- visual browser workflows remain manual-only;
- preview transfer requires explicit user GO for the exact accepted commit;
- `main` requires separate explicit user GO;
- auto-merge remains forbidden;
- runtime, architecture, performance and verification honesty contracts remain mandatory.
