# Live performance contract follow-up

This evidence set starts from exact preview base `18b45a08ee39dda252e406060e2f8cac5c4114af`.

- `baseline-18b45a08/` is the compact analysis of the user-provided Windows report.
- `ci-<exact-head-sha>/` is created by the enforced browser workflow and uploaded as the
  `live-performance-contract-followup` GitHub Actions artifact.
- The workflow always records `acceptance-result.json`, `after-browser.json`,
  `playwright.log`, `simulation-slowest-passes.json`, `long-task-classification.json`,
  `route-danger-parity.json`, `route-danger-cache.json`, and `point-los-parity.json`.

The CI directory is intentionally produced by the exact-head workflow rather than committed
before the final SHA exists.
