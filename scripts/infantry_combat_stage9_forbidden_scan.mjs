import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const requiredBase = 'f93cdbdf15497498e99dd4f63a2bfd20e5414ea9';
const diffHead = process.env.INFANTRY_COMBAT_STAGE9_DIFF_HEAD_SHA?.trim() || 'HEAD';
const protectedPrefixes = [
  'src/core/ai/',
  'src/ai-node-editor/',
  'src/core/tactical/action-ports/',
  'src/ui/',
  'public/ai-examples/',
  'ai-node-editor.html',
  '.github/workflows/',
  'vercel.json',
];
const productionFiles = [
  'src/core/infantry-combat/runtime/AmmoInventoryTypes.ts',
  'src/core/infantry-combat/runtime/AmmoInventoryRuntime.ts',
  'src/core/infantry-combat/runtime/AmmoTransferAction.ts',
  'src/core/infantry-combat/runtime/ReloadWeaponAction.ts',
  'src/core/infantry-combat/runtime/MachineGunAssistant.ts',
  'src/core/infantry-combat/runtime/MachineGunFireModifiers.ts',
  'src/core/infantry-combat/runtime/WeaponDeploymentTypes.ts',
  'src/core/infantry-combat/runtime/WeaponDeploymentRuntime.ts',
  'src/core/infantry-combat/runtime/WeaponDeploymentActions.ts',
  'src/core/infantry-combat/runtime/WeaponDeploymentLocks.ts',
  'src/core/infantry-combat/runtime/WeaponActionRuntime.ts',
  'src/core/infantry-combat/runtime/Stage9ActionReconciliation.ts',
  'src/core/infantry-combat/runtime/Stage9Diagnostics.ts',
  'src/core/infantry-combat/runtime/FireTaskRuntime.ts',
  'src/core/infantry-combat/runtime/ShotCommitService.ts',
  'src/core/infantry-combat/runtime/AimRuntime.ts',
  'src/core/infantry-combat/runtime/InfantryWeaponInstance.ts',
  'src/core/infantry-combat/runtime/InfantryCombatUnitRuntime.ts',
  'src/core/infantry-combat/runtime/InfantryCombatReconciliation.ts',
  'src/core/infantry-combat/runtime/InfantryPhysiologySimulation.ts',
  'src/core/movement/MovementRuntime.ts',
  'src/core/actions/PostureTransition.ts',
  'src/core/perception/AttentionController.ts',
  'src/core/simulation/SimulationTick.ts',
];
const actionFiles = [
  'src/core/infantry-combat/runtime/AmmoTransferAction.ts',
  'src/core/infantry-combat/runtime/ReloadWeaponAction.ts',
  'src/core/infantry-combat/runtime/MachineGunAssistant.ts',
  'src/core/infantry-combat/runtime/WeaponDeploymentActions.ts',
  'src/core/infantry-combat/runtime/Stage9ActionReconciliation.ts',
];
const universalForbidden = [
  ['Math.random', /\bMath\.random\b/],
  ['Date.now', /\bDate\.now\b/],
  ['performance.now', /\bperformance\.now\b/],
  ['new Date', /\bnew\s+Date\b/],
  ['randomUUID', /\brandomUUID\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['PIXI', /\bPIXI\b/],
  ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
  ['Graph v2 dependency', /(?:GraphV2|graph-v2|ai-node-editor)/i],
  ['perception signals', /PerceptionSignal|emitPerceptionSignal/],
];
const requiredFiles = [
  ...productionFiles,
  'scripts/infantry_combat_stage9_deployment_smoke.ts',
  'scripts/infantry_combat_stage9_sector_smoke.ts',
  'scripts/infantry_combat_stage9_reload_smoke.ts',
  'scripts/infantry_combat_stage9_assistant_smoke.ts',
  'scripts/infantry_combat_stage9_ammo_transfer_smoke.ts',
  'scripts/infantry_combat_stage9_save_load_smoke.ts',
  'scripts/infantry_combat_stage9_stress_smoke.ts',
  'scripts/infantry_combat_stage9_smoke.mjs',
  'scripts/infantry_combat_stage9_forbidden_scan.mjs',
  'scripts/infantry_combat_stage9_verify.mjs',
  'docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_9_MACHINE_GUN_ASSISTANT.md',
];

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  ensureCommit(requiredBase);
  ensureCommit(diffHead);
  const violations = [];
  for (const relative of productionFiles) {
    const content = await safeRead(relative, violations);
    if (content === null) continue;
    for (const [label, pattern] of universalForbidden) {
      if (pattern.test(content)) violations.push(`${relative}: forbidden ${label}`);
    }
  }
  for (const relative of actionFiles) {
    const content = await safeRead(relative, violations);
    if (content === null) continue;
    if (/\bstate\.units\.(?:find|filter|map|forEach|reduce)\b/.test(content)) {
      violations.push(`${relative}: direct state.units search in Stage 9 action path`);
    }
    if (/\bnew\s+(?:MapObjectSpatialIndex|CombatUnitSpatialIndex)\b/.test(content)) {
      violations.push(`${relative}: second spatial index constructed`);
    }
  }
  for (const relative of requiredFiles) await safeRead(relative, violations);

  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const script of ['infantry-combat-stage9:smoke', 'infantry-combat-stage9:forbidden-scan', 'infantry-combat-stage9:verify']) {
    if (typeof packageJson.scripts?.[script] !== 'string') violations.push(`package.json: missing ${script}`);
  }

  const types = await readFile(path.join(repoRoot, 'src/core/infantry-combat/runtime/AmmoInventoryTypes.ts'), 'utf8');
  if (!/MAX_AMMO_RESERVE_ENTRIES\s*=\s*8\b/.test(types)) violations.push('AmmoInventoryTypes.ts: reserve entry limit must be 8');
  if (!/MAX_APPLIED_RELOAD_STAGE_IDS\s*=\s*128\b/.test(types)) violations.push('AmmoInventoryTypes.ts: reload ledger limit must be 128');
  if (!/MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS\s*=\s*128\b/.test(types)) violations.push('AmmoInventoryTypes.ts: transfer ledger limit must be 128');
  const deploymentTypes = await readFile(path.join(repoRoot, 'src/core/infantry-combat/runtime/WeaponDeploymentTypes.ts'), 'utf8');
  if (!/MAX_WEAPON_DEPLOYMENT_RESULTS\s*=\s*1\b/.test(deploymentTypes)) violations.push('WeaponDeploymentTypes.ts: deployment result limit must be 1');

  const changed = execFileSync('git', ['diff', '--name-only', `${requiredBase}...${diffHead}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  for (const file of changed) {
    if (protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))) {
      violations.push(`${file}: protected Stage 10/Graph/UI/action-port/workflow scope changed`);
    }
  }

  if (violations.length > 0) {
    console.error('Stage 9 forbidden scan failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Stage 9 forbidden scan passed across ${productionFiles.length} production files and ${changed.length} changed paths through ${diffHead}.`);
}

async function safeRead(relative, violations) {
  try {
    return await readFile(path.join(repoRoot, relative), 'utf8');
  } catch {
    violations.push(`${relative}: required file missing`);
    return null;
  }
}

function ensureCommit(ref) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', ref], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}
