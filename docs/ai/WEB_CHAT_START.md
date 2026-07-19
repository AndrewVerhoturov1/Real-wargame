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
- Git-triggered Vercel deployments are disabled.

Machine-readable source:

```text
docs/ai/repo-context.json
```

Canonical workflows:

```text
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

## 2. How to speak with the user

Use simple Russian, as with an intelligent high-school student.

- Put the useful result first.
- Avoid unnecessary English terms.
- Explain unavoidable technical terms once.
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

For a deployment request, always read:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
```

## 4. Mandatory task start

For every implementation task:

1. resolve the exact current head of `real-wargame-preview`;
2. record it as `base_commit`;
3. create one `feature/YYYYMMDD-short-kebab-slug` branch from that exact commit;
4. implement, commit, push and fix later defects on that branch;
5. do not modify `real-wargame-preview` during development;
6. do not modify `main`.

A Pull Request is not the default development route.

## 5. Focused verification

Before reporting readiness, run the smallest sufficient matrix:

```text
npx tsc --noEmit
+ focused subsystem smoke tests
+ npm run build
+ docs checks when applicable
```

`npm run build` must produce:

```text
dist/index.html
dist/ai-node-editor.html
```

Do not run every smoke test, broad matrices, Chromium, Playwright, GitHub Actions or performance workflows by default.

## 6. Manual Vercel Preview

A push does not deploy. Do not wait for an automatic Preview and do not create a dummy commit.

Deploy only after explicit user intent such as:

```text
деплой
задеплой
создай Preview
обнови Preview
```

Then:

1. load `real-wargame-manual-vercel-deploy`;
2. resolve exact branch and remote HEAD;
3. deploy through an authenticated route that proves exact source identity;
4. inspect status and build logs;
5. verify status `READY`;
6. report both links:
   - game: `<preview>/`;
   - AI Node Editor: `<preview>/ai-node-editor.html`.

An implementation, commit, push or transfer request does not imply deployment unless deployment is explicit.

## 7. Readiness report without deployment

When code is ready but deployment was not requested, say so directly:

```text
Статус: код готов, не задеплоен
Ветка:
Коммит:
Проверки:
Деплой: не запускался — требуется отдельная команда пользователя
```

Do not invent Preview URLs.

## 8. Live-test correction loop

When the user reports a product problem:

1. stay on the same feature branch;
2. reproduce it;
3. add or update focused regression coverage when practical;
4. fix product code there;
5. rerun focused checks;
6. commit and push the same branch;
7. do not deploy automatically;
8. deploy again only after a new explicit request, except necessary retries inside an already authorized failed-deployment task.

## 9. Visual verification

Visual verification permission is separate from deployment permission.

When a suitable deployment already exists:

```text
direct controlled browser available
→ .agents/skills/real-wargame-local-preview/SKILL.md

direct controlled browser unavailable
→ .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

When no deployment exists, do not create one implicitly. Report that an explicit deployment request is required.

Never commit Vercel tokens, Deploy Hook URLs, share tokens or bypass secrets.

## 10. Transfer and cleanup

Transfer into `real-wargame-preview` only after explicit user GO for the exact accepted feature commit.

Transfer permission does not automatically grant deployment permission. After transfer:

- report the new preview commit;
- state whether it is deployed;
- deploy `real-wargame-preview` only when the user explicitly asks to deploy or explicitly requested transfer and deployment together.

A PR may be used only when explicitly requested or technically required.

## 11. Main branch

Never write to `main`, deploy `main`, retarget a PR to `main`, merge or enable auto-merge without separate explicit human approval.

## 12. Required final report

Use `AGENTS.md` and `docs/orchestration/RESULT_TEMPLATE.md`.

Always distinguish:

- code committed;
- local/focused checks;
- Vercel deployment;
- human live test;
- visual/browser evidence.
