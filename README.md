# Real-wargame

Real-time strategy game project.

Behavior foundation preview work is staged on `real-wargame-preview`.

If you are reading this from `main`, remember that active preview work and the newest agent instructions may be on `real-wargame-preview`.

## Agent startup

Start here:

```text
docs/ai/AGENT_START_HERE.md
```

Then read:

```text
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/SKILLS_INDEX.md
```

If the task asks to run the game locally, open the preview build, capture screenshots, show the game in chat, inspect a GitHub Actions screenshot artifact, or prepare terminal-free launch instructions, read this skill first:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

## Subprojects

See `docs/subprojects/README.md` for subproject system documentation.

## Commands

    python scripts/subproject_context.py --list
    python scripts/subproject_context.py <id> --brief
    python scripts/subproject_context.py <id> --opencode
    python scripts/subproject_context.py <id> --files
