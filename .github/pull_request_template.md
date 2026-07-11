## Delivery

> Preferred GitHub-aware delivery is a direct commit/push to `real-wargame-preview`. Use this PR template for fallback review, CI isolation or an explicitly isolated branch.

- **Base branch:** `real-wargame-preview` / `main` (delete one)
- **Head branch:**
- **Transfer path:** `PR fallback` / `isolated branch only` / other
- **Why a PR or isolated branch is used:**

If targeting `main`:

- `MAIN_GO_APPROVED_BY_USER`: yes / no
- Why preview is not the target:

## Required context read

- [ ] `AGENTS.md`
- [ ] `docs/ai/WEB_CHAT_START.md`
- [ ] Active subproject `STATUS.md`
- [ ] Relevant project skill

## Summary

- What changed:
- Why:
- Explicitly out of scope:

## Changed files

- `path`

## Checks

- [ ] Focused checks were run and listed below.
- [ ] Production build was run when applicable.
- [ ] Checks were not run; reason is documented.

```text
check: passed / failed / not run
```

For agent documentation changes:

- [ ] `npm run docs:smoke`
- [ ] `npm run docs:generate`
- [ ] generated output has no diff
- [ ] `npm run docs:check`

For visual changes:

- [ ] Real browser run completed.
- [ ] Fresh PNG artifact belongs to this commit.
- [ ] Changed/key PNGs were opened and inspected.
- [ ] The report distinguishes GitHub Actions from the user's PC.

## Human verification

- What the user should open:
- Steps:
- Expected result:

## Risks and not checked

- Risks:
- Not checked:

## Branch cleanup

- [ ] This branch must remain isolated because the user has not requested transfer yet.
- [ ] Temporary branch/PR will be closed after transfer or artifact inspection.
- [ ] Temporary branch remains open for another reason.

If left open, reason:

```text
Временная ветка оставлена открытой, потому что ...
```

## Safety

- [ ] `main` was not changed without explicit GO.
- [ ] Auto-merge is disabled.
- [ ] No secrets, `.env`, keys or private data were added.
- [ ] Reported checks and visual inspection actually happened.
