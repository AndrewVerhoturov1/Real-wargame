# Web Chat Start

Short entry point for a GitHub-aware Web Chat working on `Real-Wargame`.

## 1. Facts that must not be guessed

- Repository: `AndrewVerhoturov1/Real-wargame`.
- Working branch: `real-wargame-preview`.
- Stable branch: `main`.
- Feature branch pattern: `feature/YYYYMMDD-short-kebab-slug`.
- Stack: Vite + TypeScript + PixiJS **8**.
- This is not a Godot project.
- Canonical development names are English.
- Russian is the default human-facing language.

Machine-readable source:

```text
docs/ai/repo-context.json
```

Canonical delivery workflow:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## 2. How to speak with the user

Use simple Russian, as with an intelligent high-school student.

- Put the useful result first.
- Avoid unnecessary English terms.
- Explain unavoidable technical terms once in plain Russian.
- Use clickable links.
- Show useful screenshots directly when available.
- Put long hashes and diagnostics after the practical result.
- Do not make the user operate Git or a terminal when the agent can do it.

## 3. Minimal reading route

Read only:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/subprojects/index.json`;
4. `docs/subprojects/<active-id>/STATUS.md`;
5. the relevant skill from `docs/ai/SKILLS_INDEX.md`.

For runtime-affecting work also read:

```text
docs/performance/PERFORMANCE_PRINCIPLES.md
.agents/skills/real-wargame-performance/SKILL.md
```

Do not read all journals, plans, screenshots or skills by default.

## 4. Mandatory task start

For every implementation task:

1. resolve the exact current head of `real-wargame-preview`;
2. record it as `base_commit`;
3. create one `feature/YYYYMMDD-short-kebab-slug` branch from that exact commit;
4. implement, commit, push and fix later product defects on that branch;
5. do not modify `real-wargame-preview` during development;
6. do not modify `main`.

A Pull Request is not the default development route.

## 5. Focused verification

Before live testing, run the smallest sufficient matrix:

```text
npx tsc --noEmit
+ focused subsystem smoke tests
+ npm run build
+ docs checks when applicable
```

`npm run build` must produce both:

```text
dist/index.html
dist/ai-node-editor.html
```

Do not run every smoke test, broad matrices, Chromium, Playwright, GitHub Actions or performance workflows by default.

## 6. Automatic Vercel Preview

The repository is connected to one permanent Vercel project.

After every feature-branch push:

1. Vercel automatically creates or updates the branch Preview;
2. wait for deployment status `Ready`;
3. report two clickable links:
   - game: `<branch-preview>/`;
   - AI Node Editor: `<branch-preview>/ai-node-editor.html`.

Codex is not required for deployment. Do not ask the user to redeploy manually after each push.

Do not create a separate Vercel project for every branch. Never delete the permanent Git-connected project.

## 7. Readiness report

Start with:

```text
Статус:
Что изменилось:
Игра: <clickable URL>
Редактор ИИ: <clickable URL>/ai-node-editor.html
Ветка:
Коммит:
Что проверить:
```

Then add only relevant technical details.

## 8. Live-test correction loop

When the user reports a product problem:

1. stay on the same feature branch;
2. reproduce it;
3. add or update focused regression coverage when practical;
4. fix product code there;
5. rerun focused checks;
6. commit and push the same branch;
7. let Vercel update automatically;
8. report the new commit and the same two Preview links.

Do not create a new feature branch for every defect.

## 9. Visual verification

The user does not need to name a skill. Clear intent such as these phrases is sufficient:

```text
проверь визуально
запусти визуальную проверку
сделай скриншоты
проверь через Playwright
проверь Vercel Preview
```

Route selection:

### Direct browser available

Use:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

### Direct browser unavailable

Use:

```text
.agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

The deployed-Vercel route uses temporary CI-only branches and a temporary PR that must never be merged. Product defects are fixed only on the canonical feature branch. A new product SHA requires fresh evidence.

Never commit Vercel tokens or bypass secrets.

## 10. Evidence presentation

When screenshots or browser evidence exist:

- inspect the evidence first;
- show the most useful screenshots directly;
- provide clickable links to the game, AI Node Editor, workflow and full artifact;
- explain the result in simple Russian;
- place raw IDs and detailed diagnostics after the practical summary.

A green workflow alone is not visual proof.

## 11. Transfer and cleanup

Transfer into `real-wargame-preview` only after explicit user GO for the exact accepted feature commit.

After transfer:

1. wait for automatic `real-wargame-preview` deployment;
2. verify `/`;
3. verify `/ai-node-editor.html`;
4. delete the feature branch unless the user asks to keep it;
5. if an old separate temporary Vercel project exists, delete it only after both replacement pages work;
6. never delete the permanent Git-connected Vercel project.

A PR may be used only when explicitly requested or technically required.

## 12. Main branch

Never write to `main`, retarget a PR to `main`, merge or enable auto-merge without separate explicit human approval.

## 13. Required final report

Use `AGENTS.md` and `docs/orchestration/RESULT_TEMPLATE.md`.

Explain the result in simple Russian. The user is not required to work with Git or the terminal.
