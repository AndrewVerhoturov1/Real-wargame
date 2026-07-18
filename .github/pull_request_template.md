## Delivery

- **Base branch:** `real-wargame-preview`
- **Head branch:**
- **Why an isolated PR is used:**

If targeting `main` despite the default policy:

- `MAIN_GO_APPROVED_BY_USER`: yes / no
- Why preview is not the target:

## Summary

- What changed:
- Why:
- Explicitly out of scope:

## Risk classification

```text
CHANGE_RISK: docs | ci-policy | core | ai | navigation | terrain | combat | tactical-order | ui | cross-cutting
TESTED_IMPLEMENTATION_HEAD: none
PERFORMANCE_REASON: none
```

`TESTED_IMPLEMENTATION_HEAD` may reference earlier heavy evidence only when `PR Risk CI` validates the tail. Do not replace `none` with a SHA unless successful evidence for that implementation is linked below.

## Changed files

- `path`

## Verification selection

### Mandatory automatic checks

- [ ] `PR Risk CI / Classify change risk`
- [ ] `PR Risk CI / Minimal sufficient verification`
- [ ] `PR Risk CI / Risk decision and evidence validity`
- [ ] `Preview Policy`

### Risk-selected checks actually run

```text
check: passed / failed
```

### Manual integration checks

```text
check: passed / failed / not requested
reason:
```

### Heavy checks deliberately not run

```text
workflow:
reason it cannot detect a regression caused by this change:
```

For a requested heavy performance run, explain the concrete regression in `PERFORMANCE_REASON` and use the relevant label or manual workflow. “For reliability” and “just in case” are not reasons.

## Evidence

- Tested implementation run/artifact:
- Tail diff after tested implementation head:
- `PR Risk CI` evidence status:

## Human verification

- What the user should open:
- Steps:
- Expected result:

## Risks and not checked

- Risks:
- Not checked:

## Safety

- [ ] `main` was not changed without explicit GO.
- [ ] Auto-merge is disabled.
- [ ] No workflow commits generated files back into the active branch.
- [ ] No secrets, `.env`, keys or private data were added.
- [ ] Reported checks and visual inspection actually happened.
