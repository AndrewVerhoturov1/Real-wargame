# Manual Vercel Preview Workflow Design

## Goal

Replace Vercel-as-test-runner with an explicit publication pipeline:

```text
exact checkout -> verification gate -> one Vercel build -> one prebuilt Preview deployment -> published-page verification
```

## Current failure mode

The current `build` command mixes TypeScript, broad smoke groups, Vite compilation and page checks. The exact-source bootstrap repeats clone, `npm ci`, checks and compilation inside Vercel. Consequently product defects and hanging Node handles are found only after a deployment has already been created. Diagnostic retries also created separate projects instead of reusing the permanent `repo` project.

The current GitHub CI uses Node 20 while the permanent Vercel project `repo` uses Node 24.x.

## Chosen architecture

### Primary route: manual GitHub Actions

A new `workflow_dispatch` workflow accepts an exact `ref` and `expected_sha`. It checks out the requested ref and compares `git rev-parse HEAD` to the expected SHA before `npm ci`. `main` is rejected unless an explicit boolean permission is supplied.

The workflow uses Node 24, npm cache, `npm ci`, a single deployment verification gate, pinned Vercel CLI `56.4.1`, and the three GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

After the gate passes, the workflow runs `vercel pull`, verifies that the linked project is exactly the permanent project `repo`, runs `vercel build` once, adds deployment identity metadata to the static output, validates the required pages, and publishes with `vercel deploy --prebuilt`.

### Secondary route: exact local checkout

An authenticated operator may run the same commands from a local checkout whose branch and SHA were proven. This route also uses the permanent project and prebuilt output.

### Emergency route: exact-source bootstrap inside Vercel

The existing bootstrap remains available only when GitHub Actions and an exact local checkout are unavailable. It must clone and verify the exact branch/SHA before `npm ci`, run the minimal Preview gate, and target only the permanent project. It is not the normal development loop.

## Command boundaries

- `typecheck`: TypeScript only.
- `test:preview`: Preview smoke scenarios only, each isolated in a child Node process.
- `verify:preview`: typecheck, runner contract, deployment contract checks and Preview smoke scenarios.
- `build:app`: Vite production compilation only.
- `verify:deployment-pages`: validate `index.html`, `ai-node-editor.html`, and deployment identity metadata in a selected output directory.
- `build`: local production build plus output-page validation; it does not run the Preview test matrix.

## Isolated smoke execution

A shared process runner launches every Preview smoke scenario in its own detached child process. Each scenario has an explicit timeout, captured stdout/stderr and a distinct result record. On timeout the whole process tree is terminated and the gate exits non-zero with the scenario name. A contract smoke proves pass, ordinary failure, and a process that prints success but leaves an interval running.

## Deployment identity

The verification gate writes a JSON report listing every command/scenario actually executed. After `vercel build`, a metadata writer places `deployment-source.json` into `.vercel/output/static` with repository, ref, SHA, checks, skipped checks and creation time. The workflow summary reports the same identity, deployment ID/URL and status.

## Safety boundaries

- No workflow trigger on push or pull request.
- `vercel.json` keeps `git.deploymentEnabled=false`.
- No project creation commands.
- The project must resolve to `repo` and the configured project ID secret.
- No secret values are printed or committed.
- No deployment of `main` without explicit permission.
- Transfer to `real-wargame-preview` and deployment remain separate permissions.
- A failed gate produces no Vercel deployment.
- A successful normal run creates one deployment for one verified SHA.
