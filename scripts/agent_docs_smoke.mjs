import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateAgentDocuments } from './agent_docs_lib.mjs';
import { validateAgentDocuments } from './agent_docs_validation.mjs';

async function writeJson(root, relativePath, value) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(root, relativePath, content = '# Fixture\n') {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'real-wargame-agent-docs-'));
  await writeJson(root, 'package.json', {
    type: 'module',
    dependencies: { 'pixi.js': '^7.4.3' },
  });
  await writeJson(root, 'docs/ai/repo-context.json', {
    schemaVersion: 1,
    project: {
      name: 'Fixture',
      repository: 'example/fixture',
      workingBranch: 'preview',
      stableBranch: 'main',
      canonicalLauncher: 'Run.bat',
      defaultUserLanguage: 'ru',
      canonicalDevelopmentLanguage: 'en',
    },
    stack: { pixiJsMajor: 7 },
    activeSubprojects: ['active-project'],
    delivery: {
      preferred: 'direct-push-to-preview',
      target: 'preview',
      fallback: 'pull-request-to-preview',
      mainRequiresExplicitUserGo: true,
      autoMergeAllowed: false,
    },
    agentEntryPoints: ['AGENTS.md'],
    defaultSkills: {},
    updatedAt: '2026-07-12',
  });
  await writeJson(root, 'docs/subprojects/active-project/subproject.json', {
    id: 'active-project',
    title: 'Active Project',
    status: 'active',
    updated_at: '2026-07-12',
    goal: 'Test generation.',
    current_focus: 'Current focus.',
    next_step: 'Next step.',
    canonical_launcher: 'Run.bat',
    last_verified_commit: '1234567890abcdef1234567890abcdef12345678',
    must_read_first: ['docs/subprojects/active-project/SUBPROJECT.md'],
    main_files: ['src/main.ts'],
    suggested_verification: ['npm run build'],
    safety_rules: ['Do not change main.'],
  });
  await writeJson(root, 'docs/subprojects/old-project/subproject.json', {
    id: 'old-project',
    title: 'Old Project',
    status: 'maintenance',
    updated_at: '2026-07-10',
    goal: 'Keep old work discoverable.',
    current_focus: 'Maintenance only.',
    next_step: 'Update when needed.',
    canonical_launcher: 'Run.bat',
    must_read_first: ['docs/subprojects/old-project/SUBPROJECT.md'],
    main_files: [],
    suggested_verification: [],
    safety_rules: [],
  });
  await writeText(root, 'AGENTS.md');
  await writeText(root, 'Run.bat', '@echo off\n');
  await writeText(root, 'src/main.ts', 'export {};\n');
  await writeText(root, 'docs/subprojects/active-project/SUBPROJECT.md');
  await writeText(root, 'docs/subprojects/active-project/HANDOFF.md');
  await writeText(root, 'docs/subprojects/old-project/SUBPROJECT.md');
  return root;
}

const root = await createFixture();
try {
  const generated = await generateAgentDocuments(root, { write: true });
  assert.equal(generated.subprojects.length, 2);
  assert.equal(generated.activeSubprojects[0].id, 'active-project');

  const index = JSON.parse(await readFile(path.join(root, 'docs/subprojects/index.json'), 'utf8'));
  assert.equal(index.subprojects[0].id, 'active-project');

  let result = await validateAgentDocuments(root);
  assert.deepEqual(result.errors, []);

  await writeText(root, 'docs/ai/CURRENT_STATE.md', '# stale\n');
  result = await validateAgentDocuments(root);
  assert.equal(result.errors.some((error) => error.includes('stale generated file: docs/ai/CURRENT_STATE.md')), true);
  await generateAgentDocuments(root, { write: true });

  const activePath = path.join(root, 'docs/subprojects/active-project/subproject.json');
  const active = JSON.parse(await readFile(activePath, 'utf8'));
  active.status = 'legacy_custom_status';
  await writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  result = await validateAgentDocuments(root);
  assert.equal(result.errors.some((error) => error.includes('unsupported status')), true);
  active.status = 'active';
  active.main_files = ['src/missing.ts'];
  await writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  result = await validateAgentDocuments(root);
  assert.equal(result.errors.some((error) => error.includes('missing referenced path: src/missing.ts')), true);
  active.main_files = ['src/main.ts'];
  await writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');

  await writeText(root, 'AGENTS.md', '# Fixture\n\n[Broken route](missing-route.md)\n');
  result = await validateAgentDocuments(root);
  assert.equal(result.errors.some((error) => error.includes('broken Markdown link') && error.includes('missing-route.md')), true);
  await writeText(root, 'AGENTS.md');

  await writeJson(root, 'package.json', { type: 'module', dependencies: { 'pixi.js': '^8.0.0' } });
  result = await validateAgentDocuments(root);
  assert.equal(result.errors.some((error) => error.includes('PixiJS major mismatch')), true);
  await writeJson(root, 'package.json', { type: 'module', dependencies: { 'pixi.js': '^7.4.3' } });

  await generateAgentDocuments(root, { write: true });
  result = await validateAgentDocuments(root);
  assert.deepEqual(result.errors, []);
  console.log('Agent docs smoke passed: generation, stale output, status, path, Markdown link and PixiJS validation.');
} finally {
  await rm(root, { recursive: true, force: true });
}
