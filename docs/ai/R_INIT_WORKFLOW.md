# R-INIT Workflow — Deprecated

`R-init`, Route X and the former preview-integration process are historical compatibility references. They are not valid entry points for current feature development.

Do not use the old route that:

- writes implementation directly into `real-wargame-preview`;
- asks Codex to implement, prepare launchers, fix bugs, merge or transfer branches;
- creates a new branch and PR for every NO-GO correction;
- treats local preview-folder synchronization as the normal live-test path;
- moves from preview to `main` as part of ordinary feature acceptance.

The current canonical route is:

```text
AGENTS.md
docs/ai/WEB_CHAT_START.md
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/workflow/VISUAL_QA_APPROVAL_POLICY.md
```

Current summary:

```text
Web Chat creates one feature branch from the exact current real-wargame-preview head
→ Web Chat implements and runs focused non-browser checks
→ Web Chat pushes and reports the exact commit plus manual checklist
→ user gives the branch to Codex once
→ Codex only exposes a branch-linked Vercel Preview and returns the URL
→ user performs live testing
→ Web Chat fixes every issue on the same feature branch
→ optional visual GitHub Actions verification after explicit approval
→ explicit user GO
→ Web Chat transfers the accepted exact commit into real-wargame-preview
```

`main` remains outside this route and requires separate explicit user GO.

Historical content may be recovered from Git history when analysing the former process, but agents must not follow or reproduce it for new work.
