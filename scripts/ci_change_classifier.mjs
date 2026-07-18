import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BOOLEAN_OUTPUTS = [
  'docs', 'docs_only', 'runtime', 'build', 'ai', 'navigation', 'terrain',
  'combat', 'tactical_order', 'ui', 'performance_contract',
  'danger_performance_recommended', 'live_performance_recommended',
  'needs_install', 'needs_build', 'full_matrix', 'evidence_valid',
];

const SAFE_TAIL_PATTERNS = [
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^\.github\/pull_request_template\.md$/,
  /^\.agents\/.*\.md$/,
  /^docs\/(?!performance\/)(?:ai|architecture|orchestration|subprojects|workflow)\//,
];

const DOC_PATTERNS = [
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^\.github\/pull_request_template\.md$/,
  /^\.agents\//,
  /^docs\//,
];

function matches(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function matchesAny(path, fragments) {
  return fragments.some((fragment) => path.includes(fragment));
}

export function isSafeEvidenceTailPath(path) {
  return matches(path, SAFE_TAIL_PATTERNS);
}

export function classifyPaths(rawPaths, options = {}) {
  const paths = [...new Set(rawPaths.map((path) => path.trim()).filter(Boolean))].sort();
  const docs = paths.length > 0 && paths.some((path) => matches(path, DOC_PATTERNS));
  const docsOnly = paths.length > 0 && paths.every((path) => matches(path, DOC_PATTERNS));

  const workflow = paths.some((path) => path.startsWith('.github/workflows/'));
  const ciTooling = paths.some((path) => /^scripts\/ci_/.test(path));
  const dependencyOrBuild = paths.some((path) => (
    /^(package|npm-shrinkwrap).*\.json$/.test(path)
    || /^vite\.config\./.test(path)
    || /^tsconfig.*\.json$/.test(path)
    || /^playwright.*\.config\./.test(path)
    || path.startsWith('public/')
  ));
  const runtime = paths.some((path) => path.startsWith('src/')) || dependencyOrBuild;
  const testHarness = paths.some((path) => (
    path.startsWith('tests/')
    || (path.startsWith('scripts/') && !path.startsWith('scripts/ci_') && !path.startsWith('scripts/agent_docs_'))
  ));

  const ai = paths.some((path) => (
    path.startsWith('src/core/ai/')
    || path.startsWith('src/ai-node-editor/')
    || path.startsWith('src/data/ai/')
    || /scripts\/ai_/.test(path)
    || matchesAny(path, ['runtime_session', 'runtime_snapshot', 'event_queue', 'blackboard_observer'])
  ));

  const navigation = paths.some((path) => (
    path.startsWith('src/core/navigation/')
    || path.startsWith('src/core/pathfinding/')
    || path.startsWith('src/core/orders/')
    || path === 'src/workers/RouteCostWorker.ts'
    || matchesAny(path, [
      'pathfinding', 'navigation_', 'routed_move', 'route_cost', 'route_danger',
      'command_plan_route', 'live_navigation_replan', 'movement_intent',
    ])
  ));

  const terrain = paths.some((path) => (
    path.startsWith('src/core/terrain/')
    || path.startsWith('src/core/map/')
    || path.startsWith('src/core/visibility/')
    || matchesAny(path, [
      'directional_terrain', 'reverse_slope', 'shared_visibility', 'vegetation',
      'environment_material', 'map_revision', 'map_resolution', 'spatial_index',
    ])
  ));

  const combat = paths.some((path) => (
    path.startsWith('src/core/combat/')
    || path.startsWith('src/core/cover/')
    || path.startsWith('src/core/perception/')
    || path.startsWith('src/core/pressure/')
    || path.startsWith('src/core/knowledge/')
    || path.startsWith('src/core/behavior/')
    || path.startsWith('src/core/units/')
    || matchesAny(path, ['combat_', 'perception_', 'danger_', 'awareness_', 'view_memory'])
  ));

  const tacticalOrder = paths.some((path) => (
    path.startsWith('src/input/TacticalOrder')
    || path.includes('TacticalOrderStatusCard')
    || path.includes('tactical-order-radial-menu')
    || matchesAny(path, ['tactical_order', 'movement_intent_ai'])
  ));

  const ui = paths.some((path) => (
    path.startsWith('src/ui/')
    || path.startsWith('src/rendering/')
    || path.startsWith('src/core/editor/')
    || path.startsWith('src/testing/')
    || /\.css$/.test(path)
    || matchesAny(path, ['game_editor', 'tactical_workspace', 'ui_compact', 'ai_node_editor'])
  ));

  const performanceContract = paths.some((path) => (
    path.startsWith('docs/performance/')
    || path.startsWith('src/core/debug/')
    || path.includes('PerformanceHarness')
    || /performance/i.test(path)
    || path === '.github/workflows/danger-layer-browser-performance.yml'
    || path === '.github/workflows/live-windows-ai-browser-performance.yml'
  ));

  const dangerPerformanceRecommended = paths.some((path) => (
    path.startsWith('src/core/knowledge/')
    || path.startsWith('src/core/cover/')
    || path.startsWith('src/core/terrain/')
    || path === 'src/rendering/PixiAwarenessHeatmapRenderer.ts'
    || path === 'src/testing/DangerLayerMovementPerformanceHarness.ts'
    || /danger-layer.*performance/i.test(path)
  ));

  const livePerformanceRecommended = paths.some((path) => (
    path.startsWith('src/core/simulation/')
    || path.startsWith('src/core/ai/')
    || path.startsWith('src/core/perception/')
    || path.startsWith('src/core/navigation/')
    || path.startsWith('src/core/pathfinding/')
    || path.startsWith('src/core/debug/')
    || path === 'src/rendering/PixiApp.ts'
    || path === 'src/ui/TacticalWorkspace.ts'
    || path === 'src/testing/LiveWindowsPerformanceHarness.ts'
    || /live-windows.*performance/i.test(path)
  ));

  const fullMatrix = options.fullMatrix === true;
  const needsBuild = runtime || dependencyOrBuild || fullMatrix;
  const needsInstall = needsBuild || testHarness || ai || navigation || terrain || combat || tacticalOrder || ui || fullMatrix;
  const invalidatingPaths = paths.filter((path) => !isSafeEvidenceTailPath(path));

  const performanceReasons = [];
  if (dangerPerformanceRecommended) performanceReasons.push('danger_or_tactical_field_hot_path_changed');
  if (livePerformanceRecommended) performanceReasons.push('simulation_ai_navigation_or_perception_hot_path_changed');
  if (performanceContract) performanceReasons.push('performance_contract_or_harness_changed');

  return {
    paths,
    docs,
    docs_only: docsOnly,
    workflow,
    ci_tooling: ciTooling,
    runtime,
    build: dependencyOrBuild,
    test_harness: testHarness,
    ai,
    navigation,
    terrain,
    combat,
    tactical_order: tacticalOrder,
    ui,
    performance_contract: performanceContract,
    danger_performance_recommended: dangerPerformanceRecommended,
    live_performance_recommended: livePerformanceRecommended,
    performance_reason: performanceReasons.join(',') || 'none',
    needs_install: needsInstall,
    needs_build: needsBuild,
    full_matrix: fullMatrix,
    invalidating_paths: invalidatingPaths,
  };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function changedPaths(base, head) {
  if (!base || !head) throw new Error('Both base and head SHA/ref are required.');
  const output = git('diff', '--name-only', '--diff-filter=ACMRTUXB', `${base}...${head}`);
  return output ? output.split(/\r?\n/) : [];
}

function parseTestedHead(body) {
  const match = body.match(/^TESTED_IMPLEMENTATION_HEAD:\s*([^\s]+)\s*$/mi);
  if (!match) return { declared: false, value: null };
  const value = match[1].trim();
  if (/^(none|not-applicable|n\/a)$/i.test(value)) return { declared: true, value: null };
  if (!/^[0-9a-f]{40}$/i.test(value)) return { declared: true, value, malformed: true };
  return { declared: true, value: value.toLowerCase() };
}

function validateEvidence(body, head) {
  const tested = parseTestedHead(body);
  if (!tested.declared || tested.value === null) {
    return {
      evidence_status: tested.declared ? 'not-applicable' : 'not-declared',
      evidence_valid: true,
      tested_implementation_head: tested.value ?? 'none',
      evidence_tail_paths: [],
      evidence_invalidating_paths: [],
    };
  }
  if (tested.malformed) {
    return {
      evidence_status: 'malformed-tested-head',
      evidence_valid: false,
      tested_implementation_head: tested.value,
      evidence_tail_paths: [],
      evidence_invalidating_paths: [],
    };
  }

  try {
    execFileSync('git', ['merge-base', '--is-ancestor', tested.value, head], { stdio: 'ignore' });
  } catch {
    return {
      evidence_status: 'tested-head-is-not-an-ancestor',
      evidence_valid: false,
      tested_implementation_head: tested.value,
      evidence_tail_paths: [],
      evidence_invalidating_paths: [],
    };
  }

  const tailPaths = changedPaths(tested.value, head);
  const invalidating = tailPaths.filter((path) => !isSafeEvidenceTailPath(path));
  return {
    evidence_status: invalidating.length === 0 ? 'valid-safe-tail' : 'invalidated-by-tail',
    evidence_valid: invalidating.length === 0,
    tested_implementation_head: tested.value,
    evidence_tail_paths: tailPaths,
    evidence_invalidating_paths: invalidating,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    result[item.slice(2)] = argv[index + 1] ?? '';
    index += 1;
  }
  return result;
}

function writeOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  for (const key of BOOLEAN_OUTPUTS) {
    appendFileSync(outputPath, `${key}=${result[key] ? 'true' : 'false'}\n`);
  }
  for (const key of ['performance_reason', 'evidence_status', 'tested_implementation_head']) {
    appendFileSync(outputPath, `${key}=${String(result[key] ?? '')}\n`);
  }
  appendFileSync(outputPath, `changed_count=${result.paths.length}\n`);
  appendFileSync(outputPath, `invalidating_count=${result.invalidating_paths.length}\n`);
  appendFileSync(outputPath, `evidence_invalidating_count=${result.evidence_invalidating_paths.length}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.base || process.env.BASE_SHA;
  const head = args.head || process.env.HEAD_SHA || 'HEAD';
  const fullMatrix = /^(1|true|yes)$/i.test(args['full-matrix'] || process.env.FULL_MATRIX || 'false');
  const paths = changedPaths(base, head);
  const classification = classifyPaths(paths, { fullMatrix });
  const evidence = validateEvidence(process.env.PR_BODY || '', head);
  const result = { ...classification, ...evidence };
  writeOutputs(result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
