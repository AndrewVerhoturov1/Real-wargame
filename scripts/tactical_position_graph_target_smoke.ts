import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync('src/core/ai/AiGraphRunner.ts', 'utf8');
const host = readFileSync('src/core/tactical/SimulationTacticalPositionGraphHost.ts', 'utf8');
assert.ok(runner.includes('target: config ? null : request.target,'));
assert.ok(runner.includes('targetMode: config?.target.mode,'));
assert.ok(runner.includes('searchSettings: config?.search,'));
assert.ok(!runner.includes('bearingRadians: config.sectorCenterDegrees * Math.PI / 180'));
assert.ok(host.includes("readonly targetPoint?: { readonly x: number; readonly y: number } | null;"));
assert.ok(host.includes('if (request.targetPoint)'));
assert.ok(host.includes('unit.facingRadians + bounded(request.sectorCenterDegrees'));

console.log('tactical position graph target smoke: ok');
