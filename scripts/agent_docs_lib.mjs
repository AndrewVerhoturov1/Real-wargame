import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ALLOWED_SUBPROJECT_STATUSES = new Set([
  'active',
  'maintenance',
  'planned',
  'paused',
  'completed',
  'superseded',
  'historical',
]);

const REQUIRED_REPOSITORY_FIELDS = [
  'project.name',
  'project.repository',
  'project.workingBranch',
  'project.stableBranch',
  'project.canonicalLauncher',
  'stack.pixiJsMajor',
  'delivery.preferred',
  'delivery.target',
  'delivery.fallback',
  'activeSubprojects',
  'agentEntryPoints',
];

const REQUIRED_SUBPROJECT_FIELDS = [
  'id',
  'title',
  'status',
  'updated_at',
  'goal',
  'current_focus',
  'next_step',
  'canonical_launcher',
  'must_read_first',
  'main_files',
  'suggested_verification',
  'safety_rules',
];

function getNestedValue(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

async function readJson(fullPath) {
  const source = await readFile(fullPath, 'utf8');
  return JSON.parse(source);
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function singleLine(value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

function markdownList(values, fallback = '- —') {
  const items = normalizeList(values);
  return items.length ? items.map((item) => `- \`${item}\``).join('\n') : fallback;
}

function statusRank(status) {
  return {
    active: 0,
    maintenance: 1,
    planned: 2,
    paused: 3,
    completed: 4,
    superseded: 5,
    historical: 6,
  }[status] ?? 99;
}

function sortSubprojects(subprojects) {
  return [...subprojects].sort((left, right) => {
    const rank = statusRank(left.status) - statusRank(right.status);
    return rank || String(left.title ?? left.id).localeCompare(String(right.title ?? right.id), 'en');
  });
}

export async function discoverSubprojects(root) {
  const base = path.join(root, 'docs', 'subprojects');
  const entries = await readdir(base, { withFileTypes: true });
  const discovered = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const relativePath = path.posix.join('docs', 'subprojects', entry.name, 'subproject.json');
    const fullPath = path.join(root, relativePath);
    try {
      const data = await readJson(fullPath);
      discovered.push({ ...data, _directory: entry.name, _metadataPath: relativePath });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return sortSubprojects(discovered);
}

function summarizeSubproject(subproject) {
  return {
    id: subproject.id,
    title: subproject.title,
    status: subproject.status,
    updated_at: subproject.updated_at,
    goal: subproject.goal,
    current_focus: subproject.current_focus,
    next_step: subproject.next_step,
    canonical_launcher: subproject.canonical_launcher,
    last_verified_commit: subproject.last_verified_commit ?? null,
    superseded_by: subproject.superseded_by ?? null,
    status_path: path.posix.join('docs', 'subprojects', subproject._directory, 'STATUS.md'),
    metadata_path: subproject._metadataPath,
  };
}

function renderCurrentState(repoContext, activeSubprojects) {
  const project = repoContext.project;
  const delivery = repoContext.delivery;
  const sections = activeSubprojects.map((subproject) => `## Active subproject: ${subproject.title}\n\n- **ID:** \`${subproject.id}\`\n- **Updated:** ${singleLine(subproject.updated_at)}\n- **Current focus:** ${singleLine(subproject.current_focus)}\n- **Next step:** ${singleLine(subproject.next_step)}\n- **Last verified commit:** ${subproject.last_verified_commit ? `\`${subproject.last_verified_commit}\`` : 'not recorded'}\n- **Status:** [generated status](../subprojects/${subproject._directory}/STATUS.md)`).join('\n\n');
  return `<!-- GENERATED FILE. Edit docs/ai/repo-context.json or subproject.json, then run npm run docs:generate. -->\n# Current Repository State\n\nGenerated from canonical repository and subproject metadata.\n\n## Repository\n\n- **Project:** ${project.name}\n- **Repository:** \`${project.repository}\`\n- **Working branch:** \`${project.workingBranch}\`\n- **Stable branch:** \`${project.stableBranch}\`\n- **Canonical launcher:** \`${project.canonicalLauncher}\`\n- **PixiJS major:** ${repoContext.stack.pixiJsMajor}\n- **Updated:** ${repoContext.updatedAt}\n\n## Delivery policy\n\n- Preferred: \`${delivery.preferred}\` to \`${delivery.target}\`.\n- Fallback: \`${delivery.fallback}\`.\n- Changing \`${project.stableBranch}\` requires explicit human GO: **${delivery.mainRequiresExplicitUserGo ? 'yes' : 'no'}**.\n- Auto-merge allowed: **${delivery.autoMergeAllowed ? 'yes' : 'no'}**.\n\n${sections || '## Active subprojects\n\nNone configured.'}\n`;
}

function renderSubprojectIndexMarkdown(repoContext, subprojects) {
  const rows = subprojects.map((item) => `| [${item.title}](${item._directory}/STATUS.md) | \`${item.id}\` | ${item.status} | ${singleLine(item.current_focus)} | ${singleLine(item.next_step)} | ${singleLine(item.updated_at)} |`).join('\n');
  return `<!-- GENERATED FILE. Edit subproject.json files, then run npm run docs:generate. -->\n# Subproject Index\n\nWorking branch: \`${repoContext.project.workingBranch}\`  \nCanonical launcher: \`${repoContext.project.canonicalLauncher}\`\n\n| Subproject | ID | Status | Current focus | Next step | Updated |\n|---|---|---|---|---|---|\n${rows}\n`;
}

function renderSubprojectStatus(repoContext, subproject) {
  return `<!-- GENERATED FILE. Edit ${subproject._metadataPath}, then run npm run docs:generate. -->\n# ${subproject.title} — Current Status\n\n- **ID:** \`${subproject.id}\`\n- **Status:** \`${subproject.status}\`\n- **Updated:** ${singleLine(subproject.updated_at)}\n- **Working branch:** \`${repoContext.project.workingBranch}\`\n- **Canonical launcher:** \`${subproject.canonical_launcher}\`\n- **Last verified commit:** ${subproject.last_verified_commit ? `\`${subproject.last_verified_commit}\`` : 'not recorded'}\n${subproject.superseded_by ? `- **Superseded by:** \`${subproject.superseded_by}\`\n` : ''}\n## Goal\n\n${singleLine(subproject.goal)}\n\n## Current focus\n\n${singleLine(subproject.current_focus)}\n\n## Next step\n\n${singleLine(subproject.next_step)}\n\n## Read first\n\n${markdownList(subproject.must_read_first)}\n\n## Main files\n\n${markdownList(subproject.main_files)}\n\n## Suggested verification\n\n${markdownList(subproject.suggested_verification)}\n\n## Safety rules\n\n${normalizeList(subproject.safety_rules).length ? normalizeList(subproject.safety_rules).map((item) => `- ${item}`).join('\n') : '- —'}\n`;
}

export async function buildAgentDocuments(root) {
  const repoContext = await readJson(path.join(root, 'docs', 'ai', 'repo-context.json'));
  const subprojects = await discoverSubprojects(root);
  const byId = new Map(subprojects.map((item) => [item.id, item]));
  const activeSubprojects = normalizeList(repoContext.activeSubprojects).map((id) => byId.get(id)).filter(Boolean);
  const outputs = new Map();
  outputs.set('docs/ai/CURRENT_STATE.md', renderCurrentState(repoContext, activeSubprojects));
  outputs.set('docs/subprojects/index.json', `${JSON.stringify({
    schemaVersion: 1,
    workingBranch: repoContext.project.workingBranch,
    canonicalLauncher: repoContext.project.canonicalLauncher,
    activeSubprojects: normalizeList(repoContext.activeSubprojects),
    generatedFrom: ['docs/ai/repo-context.json', 'docs/subprojects/*/subproject.json'],
    subprojects: subprojects.map(summarizeSubproject),
  }, null, 2)}\n`);
  outputs.set('docs/subprojects/INDEX.md', renderSubprojectIndexMarkdown(repoContext, subprojects));
  for (const subproject of subprojects) {
    outputs.set(path.posix.join('docs', 'subprojects', subproject._directory, 'STATUS.md'), renderSubprojectStatus(repoContext, subproject));
  }
  return { repoContext, subprojects, activeSubprojects, outputs };
}

export async function generateAgentDocuments(root, options = {}) {
  const result = await buildAgentDocuments(root);
  if (options.write !== false) {
    for (const [relativePath, content] of result.outputs) {
      const fullPath = path.join(root, relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
    }
  }
  return result;
}

async function exists(fullPath) {
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

function pathToCheck(value) {
  if (!value || /^https?:\/\//i.test(value)) return null;
  const normalized = String(value).replaceAll('\\', '/');
  const wildcard = normalized.search(/[?*[]/);
  const withoutGlob = wildcard >= 0 ? normalized.slice(0, wildcard) : normalized;
  return withoutGlob.replace(/\/$/, '') || '.';
}

async function validateReferencedPaths(root, values, errors, owner) {
  for (const value of normalizeList(values)) {
    const candidate = pathToCheck(value);
    if (!candidate) continue;
    if (!(await exists(path.join(root, candidate)))) {
      errors.push(`${owner}: missing referenced path: ${value}`);
    }
  }
}

function parseMajor(versionRange) {
  const match = String(versionRange ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function validateAgentDocuments(root) {
  const errors = [];
  const warnings = [];
  let built;
  try {
    built = await buildAgentDocuments(root);
  } catch (error) {
    return { errors: [`unable to load canonical metadata: ${error.message}`], warnings };
  }
  const { repoContext, subprojects, outputs } = built;

  for (const field of REQUIRED_REPOSITORY_FIELDS) {
    const value = getNestedValue(repoContext, field);
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      errors.push(`docs/ai/repo-context.json: missing required field ${field}`);
    }
  }

  if (repoContext.project?.workingBranch !== repoContext.delivery?.target) {
    errors.push('docs/ai/repo-context.json: project.workingBranch must match delivery.target');
  }
  if (repoContext.project?.stableBranch !== 'main') {
    errors.push('docs/ai/repo-context.json: project.stableBranch must be main');
  }
  if (repoContext.delivery?.mainRequiresExplicitUserGo !== true) {
    errors.push('docs/ai/repo-context.json: mainRequiresExplicitUserGo must be true');
  }
  if (repoContext.delivery?.autoMergeAllowed !== false) {
    errors.push('docs/ai/repo-context.json: autoMergeAllowed must be false');
  }

  const byId = new Map();
  for (const subproject of subprojects) {
    const owner = subproject._metadataPath;
    if (byId.has(subproject.id)) errors.push(`${owner}: duplicate subproject id ${subproject.id}`);
    byId.set(subproject.id, subproject);
    for (const field of REQUIRED_SUBPROJECT_FIELDS) {
      const value = getNestedValue(subproject, field);
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && field === 'must_read_first' && value.length === 0)) {
        errors.push(`${owner}: missing required field ${field}`);
      }
    }
    if (!ALLOWED_SUBPROJECT_STATUSES.has(subproject.status)) {
      errors.push(`${owner}: unsupported status ${subproject.status}`);
    }
    if (subproject.last_verified_commit && !/^[0-9a-f]{40}$/i.test(subproject.last_verified_commit)) {
      errors.push(`${owner}: last_verified_commit must be a full 40-character SHA`);
    }
    if (subproject._directory !== subproject.id) {
      errors.push(`${owner}: directory name must match id (${subproject._directory} != ${subproject.id})`);
    }
    await validateReferencedPaths(root, subproject.must_read_first, errors, owner);
    await validateReferencedPaths(root, subproject.main_files, errors, owner);
    await validateReferencedPaths(root, subproject.test_files, errors, owner);
    await validateReferencedPaths(root, subproject.manual_docs, errors, owner);
    if (subproject.canonical_launcher && !(await exists(path.join(root, subproject.canonical_launcher)))) {
      errors.push(`${owner}: missing canonical launcher: ${subproject.canonical_launcher}`);
    }

    const journalDir = path.join(root, 'docs', 'subprojects', subproject._directory, 'journal');
    if (await exists(journalDir)) {
      const journalFiles = (await readdir(journalDir)).filter((name) => name.endsWith('.md'));
      const journalIndexPath = path.join(root, 'docs', 'subprojects', subproject._directory, 'JOURNAL.md');
      if (journalFiles.length && await exists(journalIndexPath)) {
        const journalIndex = await readFile(journalIndexPath, 'utf8');
        for (const file of journalFiles) {
          if (!journalIndex.includes(file)) warnings.push(`${owner}: journal file is not indexed in JOURNAL.md: ${file}`);
        }
      }
    }
  }

  const configuredActive = normalizeList(repoContext.activeSubprojects);
  for (const id of configuredActive) {
    const subproject = byId.get(id);
    if (!subproject) errors.push(`docs/ai/repo-context.json: active subproject not found: ${id}`);
    else if (subproject.status !== 'active') errors.push(`${subproject._metadataPath}: configured active subproject must have status active`);
  }
  for (const subproject of subprojects.filter((item) => item.status === 'active')) {
    if (!configuredActive.includes(subproject.id)) errors.push(`${subproject._metadataPath}: active status is not listed in repo-context activeSubprojects`);
  }

  await validateReferencedPaths(root, repoContext.agentEntryPoints, errors, 'docs/ai/repo-context.json');
  await validateReferencedPaths(root, Object.values(repoContext.defaultSkills ?? {}), errors, 'docs/ai/repo-context.json');
  if (repoContext.project?.canonicalLauncher && !(await exists(path.join(root, repoContext.project.canonicalLauncher)))) {
    errors.push(`docs/ai/repo-context.json: missing canonical launcher: ${repoContext.project.canonicalLauncher}`);
  }

  try {
    const packageJson = await readJson(path.join(root, 'package.json'));
    const declaredPixi = packageJson.dependencies?.['pixi.js'] ?? packageJson.devDependencies?.['pixi.js'];
    const packageMajor = parseMajor(declaredPixi);
    if (packageMajor !== Number(repoContext.stack?.pixiJsMajor)) {
      errors.push(`PixiJS major mismatch: package.json=${packageMajor ?? 'unknown'}, repo-context=${repoContext.stack?.pixiJsMajor ?? 'unknown'}`);
    }
  } catch (error) {
    errors.push(`package.json: unable to validate PixiJS version: ${error.message}`);
  }

  for (const [relativePath, expected] of outputs) {
    const fullPath = path.join(root, relativePath);
    if (!(await exists(fullPath))) {
      errors.push(`missing generated file: ${relativePath}`);
      continue;
    }
    const actual = await readFile(fullPath, 'utf8');
    if (actual !== expected) errors.push(`stale generated file: ${relativePath}`);
  }

  return { errors, warnings };
}
