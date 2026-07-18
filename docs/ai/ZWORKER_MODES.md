# External Work Modes R/Q/X — Deprecated

The former R, Q, X, r-init and related letter-mode workflow is historical. It must not be used as the normal development process for new Real-Wargame features.

In particular, do not use the old meanings:

```text
Q = direct commit/push to real-wargame-preview or PR fallback
X = Codex-controlled preview integration and merge handoff
R-init = preview branch as the active implementation state
```

Those routes conflict with the current canonical workflow.

Use instead:

```text
AGENTS.md
docs/ai/WEB_CHAT_START.md
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/orchestration/CHAT_WORKFLOW.md
```

Current role split:

- one designated Web Chat owns one canonical feature branch;
- optional worker chats return research, files or patches;
- Web Chat owns implementation, commits, pushes, fixes and final transfer;
- Codex only exposes the already-pushed feature branch through a branch-linked Vercel Preview and returns the URL;
- the human performs live testing and gives the explicit transfer GO;
- visual GitHub Actions verification runs only after explicit user approval;
- `real-wargame-preview` is an acceptance target, not the active feature-development branch;
- `main` requires separate explicit user GO.

Historical details may be inspected through Git history when the user explicitly asks about the legacy process. Agents must not reproduce the old direct-preview, PR-first or Codex-controlled route for current work.
