# Risk-Based CI and Tested Implementation Evidence

## Goal

Real-Wargame accepts a result after the smallest verification matrix that can detect a regression caused by the actual change. A new commit SHA is not, by itself, a technical reason to repeat browser or performance evidence.

## Automatic PR flow

Every pull request to `real-wargame-preview` runs `PR Risk CI`.

1. `scripts/ci_change_classifier.mjs` compares the PR base and candidate head.
2. The classifier selects focused subsystem checks from the changed paths.
3. Dependencies are installed at most once in the automatic workflow, and only when executable code or executable tests require them.
4. Production build runs at most once and only for runtime/build changes.
5. Browser, visual and long performance scenarios are not implicit required jobs.
6. The final decision job records the selected matrix and any recommended performance scenario.

The classifier is deliberately a small path policy, not a general dependency-analysis framework. When a cross-cutting dependency is discovered, update the relevant path group and its smoke test.

## Verification levels

### A. Automatic fast/focused

Used on every PR, selected by changed paths:

- CI classifier contract;
- documentation integrity for documentation changes;
- TypeScript for runtime changes;
- focused AI, navigation, terrain, combat, tactical-order or UI smoke checks;
- one production build for executable changes.

### B. Manual integration

The former broad workflows remain available through `workflow_dispatch`:

- Preview Core Checks;
- AI Events Core;
- Command Plan Route Core;
- Navigation Profiles Core;
- Directional Terrain Core;
- Compact Route Controls Core;
- Combat Foundation Core;
- Tactical Order Core Verification.

Use them when a change crosses several contracts, when focused checks expose an integration risk, or when the integrator explicitly asks for the preserved diagnostic suite.

`PR Risk CI` also has a manual `full_matrix` input. It runs the major non-browser integration suites after one `npm ci` and one final build.

### C. Heavy browser/performance

Heavy performance evidence is opt-in. It may be started by:

- applying `ci:danger-performance` to a PR;
- applying `ci:live-performance` to a PR;
- `workflow_dispatch` with exact base/head SHA and a concrete `performance_reason`.

A performance run is justified only when the current change can alter the measured scenario, the performance contract/harness changed, or the user/integrator explicitly requests release-candidate evidence.

The reason must answer:

> What possible regression can this scenario detect specifically after the current change?

A new SHA, documentation edit, PR description edit, temporary-file cleanup, unrelated test change, “for reliability” and “just in case” are not sufficient reasons.

## Tested implementation head

Heavy evidence belongs to a tested implementation SHA, not automatically to every later PR SHA.

Record it in the PR body:

```text
TESTED_IMPLEMENTATION_HEAD: 0123456789abcdef0123456789abcdef01234567
```

Use `none` when no reusable heavy evidence is claimed.

`PR Risk CI` verifies that:

1. the declared SHA is an ancestor of the final candidate head;
2. every file changed after it is in the narrow non-invalidating tail allowlist.

A valid tail may contain only:

- `README.md`;
- `AGENTS.md`;
- `.github/pull_request_template.md`;
- Markdown files under `.agents/`;
- non-performance documentation under `docs/ai/`, `docs/architecture/`, `docs/orchestration/`, `docs/subprojects/` and `docs/workflow/`.

This allowlist is intentionally narrow. Generated evidence artifacts, scripts, tests, package files, workflows and runtime files are not safe tail files.

## Evidence invalidation

The following invalidate declared heavy evidence:

- any `src/**` runtime change;
- any `tests/**` measured scenario change;
- executable `scripts/**` change;
- `package.json`, lockfiles, TypeScript/Vite/Playwright configuration;
- the relevant workflow under `.github/workflows/**`;
- `docs/performance/**`, because it defines the performance contract;
- any other path outside the explicit safe-tail allowlist.

Invalidation does not mean “run every performance workflow”. It means the old evidence cannot be claimed for the new implementation. Select only the scenario that can detect the new risk.

## Required PR report

Every result separates:

- mandatory automatic checks;
- risk-selected focused checks;
- manually requested integration checks;
- heavy checks deliberately not run and the technical reason;
- `TESTED_IMPLEMENTATION_HEAD`, when reusable heavy evidence exists;
- `PERFORMANCE_REASON`, when a heavy workflow is requested.

A skipped, non-applicable heavy workflow is not a failure and must not be represented as a red required check.

## Full-matrix trigger

The full matrix is exceptional. Use it for one of these cases:

- a release/integration candidate spanning several subsystems;
- a change to common simulation/build contracts with unclear blast radius;
- focused checks reveal a cross-system regression;
- the user or integrator explicitly requests it.

It is not the default PR acceptance path.
