import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const requiredBase = 'f7eea38163be07c70d83314b5b6f3a1ae1cb5855';
const diffHead = process.env.INFANTRY_COMBAT_STAGE8_DIFF_HEAD_SHA?.trim() || 'HEAD';
const protectedPrefixes = [
  'src/core/ai/',
  'src/ai-node-editor/',
  'public/ai-examples/',
  'ai-node-editor.html',
  '.github/workflows/',
];
const productionFiles = [
  'src/core/infantry-combat/runtime/AutomaticFireRuntime.ts',
  'src/core/infantry-combat/runtime/AutomaticFireSupportPoints.ts',
  'src/core/infantry-combat/runtime/FireTaskRuntimeStage8.ts',
  'src/core/infantry-combat/runtime/ShotCommitServiceStage8.ts',
  'src/core/infantry-combat/runtime/SuppressionTypes.ts',
  'src/core/infantry-combat/runtime/SuppressionRuntime.ts',
  'src/core/infantry-combat/runtime/SuppressionGeometry.ts',
  'src/core/infantry-combat/runtime/SuppressionEventBuffer.ts',
  'src/core/infantry-combat/runtime/SuppressionProjectileEvents.ts',
  'src/core/infantry-combat/runtime/ProjectileStepperStage8.ts',
];
const hotPathFiles = [
  'src/core/infantry-combat/runtime/ShotCommitServiceStage8.ts',
  'src/core/infantry-combat/runtime/SuppressionProjectileEvents.ts',
  'src/core/infantry-combat/runtime/ProjectileStepperStage8.ts',
];
const sourceOfTruthFiles = [
  'src/core/infantry-combat/runtime/AutomaticFireRuntime.ts',
  'src/core/infantry-combat/runtime/SuppressionRuntime.ts',
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
    const content = await readFile(path.join(repoRoot, relative), 'utf8');
    for (const [label, pattern] of universalForbidden) {
      if (pattern.test(content)) violations.push(`${relative}: forbidden ${label}`);
    }
  }
  for (const relative of hotPathFiles) {
    const content = await readFile(path.join(repoRoot, relative), 'utf8');
    if (/\bstructuredClone\b/.test(content)) violations.push(`${relative}: structuredClone in Stage 8 hot path`);
    if (/\bstate\.units\.(?:find|filter|map|forEach)\b/.test(content)) violations.push(`${relative}: state.units scan in projectile/suppression hot path`);
    if (/for\s*\([^)]*\bof\s+state\.units\b/.test(content)) violations.push(`${relative}: projectile × all units loop`);
  }
  for (const relative of sourceOfTruthFiles) {
    const content = await readFile(path.join(repoRoot, relative), 'utf8');
    if (/\bnew\s+WeakMap\b/.test(content)) violations.push(`${relative}: WeakMap used by automatic/suppression source of truth`);
  }

  const changed = execFileSync('git', ['diff', '--name-only', `${requiredBase}...${diffHead}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  for (const file of changed) {
    if (protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))) {
      violations.push(`${file}: protected Graph/editor/workflow scope changed`);
    }
  }
  if (violations.length > 0) {
    console.error('Stage 8 forbidden scan failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Stage 8 forbidden scan passed across ${productionFiles.length} production files and ${changed.length} changed paths through ${diffHead}.`);
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
