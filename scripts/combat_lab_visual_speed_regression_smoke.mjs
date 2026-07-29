import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const session = await readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8');
assert.match(session, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*\[0\.1,\s*0\.25,\s*0\.5,\s*1,\s*2,\s*4,\s*10\]/);
assert.doesNotMatch(session, /\b8\b[^\]]*as const/);
assert.match(session, /if \(this\.paused\) return false/);
assert.match(session, /stepOnce\(\): boolean \{ return this\.advanceOneStep\(\); \}/);

const before = session.indexOf('hooks?.beforeSimulationStep();');
const tick = session.indexOf('tickSimulation(this.state, COMBAT_LAB_FIXED_STEP_SECONDS);');
const after = session.indexOf('hooks?.afterSimulationStep();');
assert.ok(before >= 0 && tick > before && after > tick, 'Hook order must surround the single production tick.');
assert.equal((session.match(/tickSimulation\(this\.state, COMBAT_LAB_FIXED_STEP_SECONDS\)/g) ?? []).length, 1);
assert.doesNotMatch(session, /setInterval|requestAnimationFrame|addTickerListener/);

const fixed = 1 / 30;
const simulated = (realSeconds, speed) => Math.floor((realSeconds * speed + 1e-9) / fixed) * fixed;
const slow = simulated(10, 0.1);
const normal = simulated(10, 1);
assert.ok(Math.abs(slow / normal - 0.1) <= fixed, '×0.1 must scale real delta with fixed-step tolerance.');
assert.equal(simulated(fixed, 1), fixed);
assert.equal(simulated(fixed, 10), fixed * 10, 'Speed affects automatic real-delta conversion only; controller step bypasses it.');

console.log('Combat Lab visual speed regression smoke passed.');
