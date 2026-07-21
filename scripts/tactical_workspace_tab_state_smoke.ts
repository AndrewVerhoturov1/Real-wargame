import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
assert.ok(
  workspace.includes('if (routeCostTabActive || staticActive)'),
  'special inspector tabs must clear original active tabs only while a special tab is open',
);
assert.ok(workspace.includes("routeCostTab.classList.toggle('active', routeCostTabActive)"));
assert.ok(workspace.includes("button.classList.toggle('active', kind === activeStaticTacticalTab?.kind)"));
assert.ok(
  !workspace.includes("shell.querySelectorAll<HTMLButtonElement>('[data-tab], [data-static-tactical-kind]').forEach"),
  'ordinary base tabs must not be unconditionally rewritten by the compatibility shell',
);

console.log('tactical workspace tab state smoke: ok');
