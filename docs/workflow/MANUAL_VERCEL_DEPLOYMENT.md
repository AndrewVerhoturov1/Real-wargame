# Manual Vercel Deployment Workflow

This is the canonical publication policy for `AndrewVerhoturov1/Real-wargame`.

## 1. Normal process

```text
exact checkout -> verification gate -> one build -> one prebuilt deployment -> published-page verification
```

Vercel is publication, not a remote test runner. Product defects must be found before a Vercel deployment starts.

Git-triggered deployments remain disabled in `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

Therefore commits and pushes do not publish anything. A Preview starts only after explicit user intent such as `деплой`, `задеплой`, `создай Preview` or `обнови Preview`.

## 2. Primary route: manual GitHub Actions

Use:

```text
.github/workflows/manual-vercel-preview.yml
```

The workflow has only `workflow_dispatch`. It does not react to push or pull request events.

Required inputs:

```text
ref             exact branch, tag or commit ref
expected_sha    expected 40-character SHA
allow_main      separate explicit permission for main; false by default
```

Optional controlled reduction:

```text
allow_skipped_checks   explicit permission to skip the Preview smoke scenarios
skip_reason            mandatory explanation for those skipped checks
```

The workflow performs these stages in order:

1. checkout the exact `ref`;
2. compare `git rev-parse HEAD` with `expected_sha` before `npm ci`;
3. reject `main` unless `allow_main=true`;
4. set up Node.js 24 with npm cache;
5. run `npm ci --no-audit --no-fund`;
6. run `npm run verify:preview -- --report <file>`;
7. stop before Vercel if TypeScript, a smoke scenario or a timeout failed;
8. pull the permanent Vercel project settings;
9. verify project IDs and project name `repo` without printing secrets;
10. run one `vercel build`;
11. add `deployment-source.json` to the prebuilt output;
12. verify the output pages;
13. publish once with `vercel deploy --prebuilt`;
14. wait for `READY` and verify `/`, `/ai-node-editor.html` and `/deployment-source.json`;
15. write ref, SHA, checks, skipped checks, deployment ID, URL and status to the GitHub Actions summary.

## 3. Secrets

Use only GitHub Secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Do not print, commit or copy their values into workflow files. The workflow must fail if `.vercel/project.json` does not match the secrets and the permanent project name `repo`.

## 4. Node and Vercel CLI versions

The permanent Vercel project uses Node.js 24.x. GitHub Actions and the emergency fallback therefore use Node.js 24.

Vercel CLI is pinned:

```text
vercel@56.4.1
```

Do not use `latest` in the workflow.

## 5. npm command boundaries

```text
npm run typecheck
  TypeScript only.

npm run test:preview
  Curated Preview smoke scenarios. Every scenario runs in its own child process.

npm run verify:preview -- --report <file>
  TypeScript, deployment contracts and the curated Preview smoke matrix.

npm run build:app
  Vite production compilation only.

npm run verify:deployment-pages
  Validate the built HTML pages. With --require-source it also validates deployment-source.json.

npm run build
  Local production build plus built-page validation. It does not hide the Preview test matrix.
```

No existing focused smoke command is deleted merely to obtain a green result.

## 6. Isolated smoke scenarios

The Preview matrix is run through `scripts/lib/isolated_process_runner.mjs`.

Each scenario:

- starts in a separate child Node process;
- has an explicit timeout;
- captures its own stdout and stderr;
- returns its own exit code;
- receives exit code `124` when timed out;
- has its process tree terminated after timeout;
- cannot hold the complete gate open with a timer, Worker, MessagePort or endless microtask chain.

The report names the failed or timed-out scenario.

## 7. Prebuilt publication

After the gate passes, the workflow runs:

```text
vercel pull
vercel build
vercel deploy --prebuilt
```

The Vercel build output is produced once. Vercel receives `.vercel/output`; it does not repeat TypeScript or smoke tests as part of the normal route.

`deployment-source.json` contains:

```text
repository
ref
sourceSha
verificationStatus
checks actually executed
skipped checks and their reason
generation time
```

A deployment is not fully verified when the report contains skipped checks.

## 8. Retry policy

The successful normal case is one deployment for one verified SHA.

Another manual deployment run is allowed only when:

- the SHA changed within the same already authorized deployment task;
- the same verified output was blocked by an infrastructure failure;
- the user gave a new explicit deployment request.

A push still never starts the run automatically. When code fails, fix it and rerun local/CI checks before manually publishing the next SHA. Do not use repeated deployments to reveal errors one at a time.

## 9. Exact local checkout

When an authenticated exact checkout is available, it may follow the same commands and target the permanent project `repo`.

It must prove branch/ref and SHA before installation, run the same gate, create one prebuilt output and publish it once. It must not call project creation or select another project.

## 10. Emergency fallback only

When GitHub Actions and an exact local checkout are both unavailable, use the templates under:

```text
.agents/skills/real-wargame-manual-vercel-deploy/templates/
```

The fallback clones the requested branch inside the Vercel build, compares the exact SHA before `npm ci`, runs the curated Preview gate, builds the application and writes `deployment-source.json`.

This route starts a Vercel deployment before source tests can run, so it is **Emergency fallback only**. It is not the normal TDD or defect-fixing loop and must always target `repo`.

## 11. Failure classification

### Code failure

TypeScript, an active smoke contract or production compilation proves a product problem. Fix the authorized branch, rerun the gate and manually publish its new SHA within the current authorization or after a new explicit request.

### Infrastructure failure

Checkout transport, credentials, package installation, Vercel CLI or Vercel infrastructure failed. Repair the route and retry the same verified SHA without product changes.

### Stale test contract

Read the failing test and the current implementation owner. Update the obsolete contract separately when ownership demonstrably changed. Do not silently delete or omit it.

## 12. Temporary diagnostic projects

Temporary diagnostic projects such as `repo-retry-*`, `repo-contract-*`, `repo-scheduler-*`, `repo-source-*` and similar names are not part of the normal architecture.

Do not delete projects automatically. List them in the final report, identify the permanent project `repo`, and ask for separate confirmation before deletion.

Prevention is structural: the workflow receives the permanent project through secrets, verifies `.vercel/project.json`, and contains no project-create command.

## 13. Required successful result

A successful Preview requires:

```text
Vercel status: READY
/                     available
/ai-node-editor.html  available
/deployment-source.json matches exact ref and SHA
```

The GitHub Actions summary must show:

```text
ref
expected and verified SHA
executed checks
skipped checks
one deployment ID
Preview URL
final status
```

## 14. Authorization boundaries

Transfer into `real-wargame-preview` and Vercel deployment are separate permissions unless both are explicitly requested together.

`main` always requires separate explicit approval. Automatic deployment on every push remains prohibited.
