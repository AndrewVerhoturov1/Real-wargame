import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, replacements) {
  let content = await readFile(path, 'utf8');
  let changed = false;
  for (const { label, from, to } of replacements) {
    if (content.includes(to)) continue;
    if (!content.includes(from)) throw new Error(`Missing patch anchor for ${label} in ${path}`);
    content = content.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, content, 'utf8');
  return changed;
}

const unitModelChanged = await patch('src/core/units/UnitModel.ts', [
  {
    label: 'combat runtime imports',
    from: `} from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';`,
    to: `} from '../behavior/BehaviorModel';
import { clearCombatRuntime, replaceCombatRuntime, type CombatRuntimeState } from '../combat/CombatDamage';
import { clearWeaponRuntime, replaceWeaponRuntime, type WeaponRuntimeState } from '../combat/WeaponModel';
import type { GridPosition } from '../geometry';`,
  },
  {
    label: 'runtime persistence fields',
    from: `export interface UnitRuntimeData extends Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>> {
  aiRuntime?: AiRuntimeSceneSnapshotV1;
}`,
    to: `export interface UnitRuntimeData extends Partial<Pick<UnitBehaviorRuntime, 'stress' | 'suppression' | 'ammo' | 'weaponReady' | 'posture'>> {
  weapon?: WeaponRuntimeState;
  combat?: CombatRuntimeState;
  aiRuntime?: AiRuntimeSceneSnapshotV1;
}`,
  },
  {
    label: 'restore weapon and combat runtime',
    from: `    applyInitialStateToRuntime(model, false);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);`,
    to: `    applyInitialStateToRuntime(model, false);
    if (unit.runtime?.weapon) replaceWeaponRuntime(model, unit.runtime.weapon);
    if (unit.runtime?.combat) replaceCombatRuntime(model, unit.runtime.combat);
    restoreAiRuntimeSnapshot(model, unit.runtime?.aiRuntime);`,
  },
  {
    label: 'reset combat runtime with initial state',
    from: `export function applyInitialStateToRuntime(unit: UnitModel, clearPerceptionKnowledge = true): void {
  const initial = unit.initialState;`,
    to: `export function applyInitialStateToRuntime(unit: UnitModel, clearPerceptionKnowledge = true): void {
  clearWeaponRuntime(unit);
  clearCombatRuntime(unit);
  const initial = unit.initialState;`,
  },
]);

const sceneExportChanged = await patch('src/ui/SceneExport.ts', [
  {
    label: 'scene combat imports',
    from: `import { buildAiRuntimeSceneSnapshot } from '../core/ai/runtime/AiRuntimeSnapshot';
import {`,
    to: `import { buildAiRuntimeSceneSnapshot } from '../core/ai/runtime/AiRuntimeSnapshot';
import { getCombatRuntime } from '../core/combat/CombatDamage';
import { getWeaponRuntime } from '../core/combat/WeaponModel';
import {`,
  },
  {
    label: 'scene combat runtime export',
    from: `      posture: unit.behaviorRuntime.posture,
      aiRuntime: buildAiRuntimeSceneSnapshot(`,
    to: `      posture: unit.behaviorRuntime.posture,
      weapon: { ...getWeaponRuntime(unit) },
      combat: JSON.parse(JSON.stringify(getCombatRuntime(unit))),
      aiRuntime: buildAiRuntimeSceneSnapshot(`,
  },
]);

const snapshotTestChanged = await patch('scripts/ai_runtime_snapshot_smoke.ts', [
  {
    label: 'current preview scene export version',
    from: `  assert.equal(exported.version, 'scene-export-v8-view-memory-heatmap-ai-runtime-2m-grid');`,
    to: `  assert.equal(exported.version, 'scene-export-v9-minimal-target-visibility-ai-runtime-2m-grid');`,
  },
]);

console.log(JSON.stringify({ unitModelChanged, sceneExportChanged, snapshotTestChanged }));
