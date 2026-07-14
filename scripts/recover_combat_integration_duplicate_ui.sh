#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH='transfer/combat-perception-fire-feedback-preview-20260714'
FILE='src/ui/TacticalWorkspace.ts'

python3 <<'PY'
from pathlib import Path

path = Path('src/ui/TacticalWorkspace.ts')
text = path.read_text(encoding='utf-8')
block = (
    "    const combat = unit ? getCombatRuntime(unit) : null;\n"
    "    const weapon = unit ? getWeaponRuntime(unit) : null;\n"
    "    const fireAction = unit ? getFireAction(unit) : null;\n"
)
count = text.count(block)
if count < 2:
    raise SystemExit(f'Expected duplicated combat runtime declaration block, found {count}. Refusing to hide an unrelated integration failure.')
first = text.find(block)
position = text.find(block, first + len(block))
while position >= 0:
    text = text[:position] + text[position + len(block):]
    position = text.find(block, first + len(block))
path.write_text(text, encoding='utf-8')
PY

git add "$FILE"
git commit --amend --no-edit

npm run workspace:smoke
npm run build
npm run docs:check

git push origin "HEAD:$TARGET_BRANCH"
