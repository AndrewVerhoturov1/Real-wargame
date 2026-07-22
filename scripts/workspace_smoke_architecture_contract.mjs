import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const baselineWrapper = readFileSync('scripts/tactical_workspace_smoke_pixijs8_baseline.mjs', 'utf8');
const baselineLegacy = readFileSync('scripts/tactical_workspace_smoke_pixijs8_baseline_legacy.mjs', 'utf8');
const baseline = `${baselineWrapper}\n${baselineLegacy}`;
const migration = readFileSync('scripts/tactical_workspace_smoke_incremental_directional.mjs', 'utf8');

assert.ok(
  baselineWrapper.includes("await import('./tactical_workspace_smoke_pixijs8_baseline_legacy.mjs')"),
  'workspace baseline wrapper must execute the compatibility baseline',
);
assert.ok(
  baselineWrapper.includes('TacticalWorkspaceBaseLegacy.ts'),
  'workspace baseline wrapper must join the active workspace compatibility source',
);

for (const token of [
  "expectIncludes('src/ui/TacticalWorkspaceBase.ts'",
  "expectIncludes('src/core/simulation/SimulationTickLegacy.ts'",
  "expectIncludes('src/rendering/PixiOverlayRendererBase.ts'",
  "expectIncludes('src/runtime/AwarenessWorldRuntime.ts'",
  'cachedFieldCount: runtime.fieldsByUnit.size',
  "expectExcludes('src/ui/WorkspaceTooltipGuard.ts'",
  "expectExcludes('src/tactical-workspace-stage8.css'",
]) {
  assert.ok(baseline.includes(token), `workspace baseline must follow current owner: ${token}`);
}

for (const obsolete of [
  "type SimulationTab = 'info' | 'danger' | 'stealth' | 'memory'",
  'cachedFieldCount: runtime.field ? 1 : 0',
  "'readDirectionalBasisValue',",
]) {
  assert.ok(!baseline.includes(obsolete), `workspace baseline must not retain obsolete contract: ${obsolete}`);
}

assert.ok(!migration.includes('isExpectedMigrationFailure'), 'workspace smoke must not bypass baseline failures through an allowlist');
assert.ok(!migration.includes('failureLines.filter'), 'workspace smoke must not filter failing assertions by their text');
assert.ok(migration.includes('if (baseline.status !== 0)'), 'workspace smoke must fail when the current baseline fails');

console.log('Workspace smoke architecture contract passed.');
