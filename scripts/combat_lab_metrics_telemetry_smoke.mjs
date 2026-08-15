import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/core/testing/combat-lab/metrics/CombatLabMeasurementTelemetry.ts', 'utf8').catch(() => '');
assert.ok(source.length > 0, 'Measurement/telemetry owner is missing.');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Measurement/telemetry owner contains TypeScript syntax diagnostics.');

assert.match(source, /interface CombatLabMeasurementDefinitionV1/);
assert.match(source, /measurementDefinitionId:\s*string/);
assert.match(source, /revision:\s*number/);
assert.match(source, /streamId:\s*CombatLabTelemetryStreamIdV1/);
assert.match(source, /participantUnitIds/);
assert.match(source, /collectionPeriod/);
assert.match(source, /interface CombatLabTelemetryRecordV1/);
assert.match(source, /runId:\s*string/);
assert.match(source, /measurementDefinitionId:\s*string/);
assert.match(source, /sourceEntityRefs/);
assert.match(source, /listCombatLabTelemetryStreamCapabilities/);
assert.match(source, /fire\.shot_committed/);
assert.match(source, /fire\.impact/);
assert.match(source, /collectCombatLabTelemetry/);
assert.match(source, /committedShots/);
assert.match(source, /impacts/);

// Metrics must not use the legacy fixed metric list as the new definition catalog.
assert.doesNotMatch(source, /COMBAT_LAB_METRIC_IDS/);
assert.doesNotMatch(source, /window\.|localStorage|Math\.random/);

console.log('Combat Lab MeasurementDefinition/telemetry contract smoke passed.');
