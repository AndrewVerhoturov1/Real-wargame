# AI Context Pack

Start here before repository work:

1. Read `AGENTS.md`.
2. Read `docs/ai/repo-context.json`.
3. Read `docs/subprojects/index.json`.
4. Read `docs/subprojects/<active>/STATUS.md` for the named subproject.
5. Read `docs/ai/SKILLS_INDEX.md` and the relevant `.agents/skills/*/SKILL.md` files.
6. For a branch task, confirm the explicit base branch and verify its remote HEAD before creating a temporary branch.

Immutable rules:

- Every task uses a temporary branch.
- A temporary branch starts from an explicitly named base branch such as `main` or `real-wargame-preview`.
- Never create a new feature branch from another active feature branch unless the user explicitly authorizes it.
- Verify the actual remote base HEAD before any change.
- Do not create an early PR.
- A draft PR is still a PR.
- One finished task should produce one PR at most.
- Deployment requires explicit user permission.
- The preview URL is not transfer to the main development branch.
- Deployment must verify `/index.html`, `/ai-node-editor.html`, and `/combat-lab.html`.
- The canonical deployment path is the manual GitHub Actions workflow `.github/workflows/manual-vercel-preview.yml`.
- Deployment must publish the exact verified SHA and must not be used to create or fix product code.
- Deployable SHAs must already pass focused checks, typecheck, build, and required smokes.
- One verified SHA gets one deployment unless the user explicitly asks for a redeploy.
- Live preview reports must include the exact source SHA and public URL.
- Static source inspection is not live visual QA.
- Browser automation requires explicit user permission.
- Avoid full-map scans in hot paths.
- Keep UI work off the simulation hot path.

Useful commands:

- `npm run docs:sync`
- `npm run docs:check`
- `npm run docs:smoke`
- `npm run manual-vercel-deploy-skill:smoke`
