# External Chat Required Rules

This file is a mandatory GitHub-facing contract for any external GitHub-aware chat (web chat, Q-mode executor, zworker with GitHub access) working on the `AndrewVerhoturov1/Real-wargame` repository.

## Before Work

1. Read `docs/ai/AGENT_START_HERE.md` first for the short route map.
2. Read `AGENTS.md` in full.
3. Read this file (`docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md`) in full.
4. Read `docs/ai/SKILLS_INDEX.md` and only the skills relevant to the task.
5. Read the navigation documents referenced in `AGENTS.md`.

## Delivery Target

6. **Default delivery target is `real-wargame-preview`.** Push or commit finished changes directly to `real-wargame-preview`, not `main`. Direct push is the preferred method for external GitHub-aware chats.
7. **`main` is forbidden without explicit user GO.** If the task says to target `main`, verify that `MAIN_GO_APPROVED_BY_USER: yes` is documented in the task context. If not, stop and ask: has the user explicitly approved a `main` merge?
8. If you push or open a PR against `main` without documented user approval, it is a **preview-policy violation**. The action will be flagged.

## Skill Selection

9. If the task asks to run the game locally, open the preview build, capture screenshots, show the game in chat, inspect a GitHub Actions screenshot artifact, or prepare terminal-free launch instructions, read:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

10. If the task involves PixiJS, canvas, 2D graphics, scene rendering, events, assets, SVG, performance, or migration, read:

```text
docs/ai/PIXIJS_SKILLS_INDEX.md
.agents/skills/pixijs/SKILL.md
```

11. Do not read all skills blindly. Use `docs/ai/SKILLS_INDEX.md` as the router.

## Task Branch Discipline (Fallback)

12. If direct push to `real-wargame-preview` is impossible (no write permission, conflict, etc.), create one separate task branch per task and open a PR into `real-wargame-preview`. Do not work directly in `main`.
13. After transferring the result into `real-wargame-preview` (via direct push or PR merge), close or delete the temporary task branch.
14. If the branch must remain open (work incomplete, conflict, user request), document the reason explicitly with the phrase: «Временная ветка оставлена открытой, потому что ...».

## Report Requirements

Every task report MUST include:

- **branch/commit**: the target branch (`real-wargame-preview`) and commit SHA or task branch name if used;
- **transfer_path**: how the result got into `real-wargame-preview` (direct push, PR merge, local merge, etc.);
- **checks_run**: what checks were run and their status (passed/failed/not run);
- **manual_checks_needed**: what the human user needs to check manually;
- **branch_cleanup_status**: `closed` or `left open` (only if a temporary branch was used);
- **branch_cleanup_reason**: if left open, the required Russian phrase;
- **risks**: known risks or "none known".

## Local Sync

15. External push/PR to `real-wargame-preview` delivers changes to GitHub only, not to the user's PC. The local preview folder must be pulled/synced from `origin/real-wargame-preview` by Codex/OpenCode before the result can be considered ready for local testing. Include `remote_preview_commit` in the report so Codex can verify local sync.

## Prohibited

- No direct writes to `main`.
- No merge without explicit human permission.
- No auto-merge.
- No claiming local checks were run unless they were actually run.
- No claiming GitHub Actions screenshots are visually correct unless the PNG artifact was downloaded and inspected.
- No secrets, `.env`, tokens, or private data in files, commits, PR descriptions, or comments.
- No scope creep — change only what the task allows.
