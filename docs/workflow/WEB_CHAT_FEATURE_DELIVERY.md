# Web Chat Feature Delivery Workflow

Canonical implementation, manual Vercel Preview, live-test and optional visual-verification workflow for `Real-Wargame`.

## 1. Start a task

Resolve the exact current remote head of `real-wargame-preview`, record it as `base_commit`, and create:

```text
feature/YYYYMMDD-short-kebab-slug
```

Do not implement directly on preview or main.

## 2. Implement on one feature branch

The owning Web Chat:

- inspects repository context;
- implements the feature or fix;
- adds focused regression coverage;
- runs the smallest sufficient checks;
- commits and pushes the feature branch;
- keeps later product fixes on the same branch.

Do not create a new product branch for every live-test defect.

## 3. Required application pages

Every production build and deployment must contain:

```text
/                     → index.html
/ai-node-editor.html  → ai-node-editor.html
```

A deployment serving only one page is incomplete.

## 4. Focused non-browser checks

Before reporting code readiness:

```text
TypeScript check
+ focused subsystem smoke tests
+ one production build
+ documentation checks when applicable
```

Typical commands:

```bash
npx tsc --noEmit
npm run <focused-smoke-script>
npm run build
```

Do not run Chromium, Playwright, GitHub Actions, broad matrices or duplicate builds without separate authorization.

## 5. Push does not deploy

Git-triggered deployments are disabled by `vercel.json`.

After a normal push:

- do not wait for Vercel;
- do not expect a Preview URL;
- do not create an empty commit;
- report branch, commit and checks;
- state `deployment_status: not requested`.

## 6. Explicit manual deployment

A deployment begins only after explicit user intent such as:

```text
деплой
задеплой
создай Preview
обнови Preview
```

Mandatory route:

```text
.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md
docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md
```

Deployment sequence:

1. resolve exact requested branch and remote HEAD;
2. confirm focused checks actually run;
3. use an authenticated manual deployment route that proves exact source identity;
4. inspect build status and logs;
5. fix build failures only on the same authorized branch;
6. manually redeploy the corrected HEAD when needed;
7. report success only after `READY`;
8. verify and report both application links.

One explicit request authorizes the exact current HEAD and necessary build-failure retries for that task. A later product change needs a new request.

## 7. Deployment routes

Allowed, in order of available exact-source proof:

1. connected Vercel deployment tool for the exact current workspace;
2. branch-specific Deploy Hook stored outside the repository;
3. authenticated Vercel CLI from the exact branch checkout:

```bash
vercel deploy --yes
```

Never use `--prod` without separate production authorization.

Never commit Deploy Hook URLs, access tokens, share tokens or bypass secrets.

## 8. Readiness reports

### Code ready, deployment not requested

```text
Статус: код готов, не задеплоен
Что изменилось:
Ветка:
Коммит:
Проверки:
Деплой: не запускался
```

### Deployment ready

```text
Статус: готово к проверке
Что изменилось:
Игра: <clickable URL>
Редактор ИИ: <clickable URL>/ai-node-editor.html
Ветка:
Коммит:
Статус Vercel: READY
Что проверить:
```

Do not make the user search for links in logs.

## 9. Human live test

The user checks task-specific behavior. Baseline:

### Game

1. application loads;
2. canvas renders;
3. changed interaction works;
4. actual state changes;
5. no new visible artifacts appear.

### AI Node Editor

1. `ai-node-editor.html` loads;
2. graph/editor interface appears;
3. task-relevant controls work;
4. no obvious missing modules or broken styles appear.

## 10. Same-branch correction loop

When the user reports a product defect:

1. stay on the same feature branch;
2. reproduce it;
3. add focused regression coverage when practical;
4. fix product code;
5. rerun focused checks;
6. commit and push;
7. do not deploy automatically;
8. deploy only after a fresh explicit request, except retries within an already authorized failed-deployment task.

## 11. Optional visual verification

Visual verification and deployment are separate permissions.

If a suitable deployment already exists:

```text
direct controlled browser available
→ .agents/skills/real-wargame-local-preview/SKILL.md

direct controlled browser unavailable
→ .agents/skills/vercel-deployment-playwright-e2e/SKILL.md
```

If no deployment exists, do not create one implicitly. State that deployment requires explicit user intent.

The Playwright CI route tests an existing deployment and must not deploy the application.

## 12. Failure ownership

### Deployment/environment

Vercel status, build service, protection or authenticated deployment mechanism. Fix only that layer unless logs prove an application defect.

### Application build

Fix only the canonical feature branch, rerun focused checks and manually redeploy under the current authorization.

### Visual test harness

Fix only temporary CI branches. Never put product fixes there.

## 13. Transfer into real-wargame-preview

Transfer requires explicit user GO for the exact accepted feature commit.

Before transfer:

1. confirm approved commit;
2. update from current preview if necessary;
3. resolve conflicts on the feature branch;
4. rerun checks required by the final diff;
5. transfer accepted result;
6. report resulting preview commit.

Transfer does not authorize deployment unless the user explicitly requests transfer and deployment together.

## 14. Preview deployment after transfer

When the user separately requests deployment of `real-wargame-preview`:

1. resolve exact preview HEAD;
2. use the manual deployment skill;
3. verify `READY`;
4. verify `/` and `/ai-node-editor.html`;
5. report both links and deployed commit.

## 15. Cleanup

After accepted transfer and any requested deployment:

- delete feature branch unless the user asks to keep it;
- close temporary CI PR without merge;
- delete temporary CI branches when supported;
- never delete the permanent Git-connected Vercel project.

## 16. Main branch

`main` is outside normal feature workflow. Never write, deploy, retarget, merge or enable auto-merge without separate explicit user approval.

## 17. Final honesty

Always distinguish:

- committed code;
- focused/local checks;
- Vercel deployment;
- human live testing;
- direct-browser evidence;
- GitHub Actions evidence.

Never claim one as another.
