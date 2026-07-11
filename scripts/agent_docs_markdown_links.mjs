import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverSubprojects } from './agent_docs_lib.mjs';

async function exists(fullPath) {
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(fullPath) {
  return JSON.parse(await readFile(fullPath, 'utf8'));
}

function normalizeTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (!trimmed) return null;

  const angleTarget = trimmed.match(/^<([^>]+)>/);
  const target = angleTarget ? angleTarget[1] : trimmed.match(/^(\S+)/)?.[1];
  if (!target) return null;
  if (target.startsWith('#') || target.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;

  const withoutFragment = target.split('#', 1)[0].split('?', 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

function extractMarkdownTargets(source) {
  const targets = [];
  const pattern = /!?\[[^\]]*\]\(([^)\n]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    const target = normalizeTarget(match[1]);
    if (target) targets.push(target);
  }
  return targets;
}

async function collectActiveMarkdownPaths(root) {
  const repoContext = await readJson(path.join(root, 'docs', 'ai', 'repo-context.json'));
  const subprojects = await discoverSubprojects(root);
  const byId = new Map(subprojects.map((item) => [item.id, item]));
  const paths = new Set([
    'AGENTS.md',
    'README.md',
    'docs/ai/AGENT_START_HERE.md',
    'docs/ai/WEB_CHAT_START.md',
    'docs/ai/TASK_ROUTER.md',
    'docs/ai/SKILLS_INDEX.md',
    'docs/ai/PIXIJS_SKILLS_INDEX.md',
    'docs/ai/CURRENT_STATE.md',
    'docs/subprojects/INDEX.md',
    'docs/architecture/OVERVIEW.md',
    'docs/architecture/MODULE_MAP.md',
  ]);

  for (const entryPoint of repoContext.agentEntryPoints ?? []) {
    if (String(entryPoint).toLowerCase().endsWith('.md')) paths.add(String(entryPoint));
  }

  for (const id of repoContext.activeSubprojects ?? []) {
    const subproject = byId.get(id);
    if (!subproject) continue;
    const base = path.posix.join('docs', 'subprojects', subproject._directory);
    paths.add(path.posix.join(base, 'STATUS.md'));
    paths.add(path.posix.join(base, 'SUBPROJECT.md'));
    paths.add(path.posix.join(base, 'HANDOFF.md'));
  }

  return [...paths].sort();
}

export async function validateActiveMarkdownLinks(root) {
  const errors = [];
  const warnings = [];
  let markdownPaths;
  try {
    markdownPaths = await collectActiveMarkdownPaths(root);
  } catch (error) {
    return {
      errors: [`unable to collect active Markdown files: ${error.message}`],
      warnings,
    };
  }

  const resolvedRoot = path.resolve(root);
  for (const relativePath of markdownPaths) {
    const fullPath = path.join(root, relativePath);
    if (!(await exists(fullPath))) continue;

    const source = await readFile(fullPath, 'utf8');
    for (const target of extractMarkdownTargets(source)) {
      const targetPath = target.startsWith('/')
        ? path.resolve(root, target.slice(1))
        : path.resolve(path.dirname(fullPath), target);
      const relativeTarget = path.relative(resolvedRoot, targetPath);
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        errors.push(`${relativePath}: broken Markdown link escapes repository: ${target}`);
        continue;
      }
      if (!(await exists(targetPath))) {
        errors.push(`${relativePath}: broken Markdown link: ${target}`);
      }
    }
  }

  return { errors, warnings };
}
