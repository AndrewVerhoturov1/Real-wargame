import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VERIFICATION_CACHE_SCHEMA_VERSION = 1;
const MAX_VERIFICATION_CACHE_ENTRIES = 128;
const MAX_CACHED_SUMMARY_CHARACTERS = 1000;

export function runVerificationCommand(command, args, cwd, options = {}) {
  const cachePath = process.env.INFANTRY_COMBAT_VERIFICATION_CACHE;
  const key = createCacheKey(command, args, cwd);
  if (cachePath) {
    const cached = readCache(cachePath).entries[key];
    if (cached) {
      return {
        pid: 0,
        output: null,
        stdout: `VERIFICATION_CACHE_HIT ${cached.summary}`,
        stderr: '',
        status: 0,
        signal: null,
        error: undefined,
        cached: true,
      };
    }
  }

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  const decorated = { ...result, cached: false };
  if (cachePath && !result.error && result.status === 0) {
    recordSuccess(cachePath, key, summarize(result));
  }
  return decorated;
}

function createCacheKey(command, args, cwd) {
  return JSON.stringify({
    command,
    args,
    cwd: path.resolve(cwd),
    node: process.version,
    head: process.env.GITHUB_SHA ?? '',
  });
}

function readCache(cachePath) {
  if (!existsSync(cachePath)) return emptyCache();
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (parsed?.schemaVersion !== VERIFICATION_CACHE_SCHEMA_VERSION || !isRecord(parsed.entries)) {
      return emptyCache();
    }
    return {
      schemaVersion: VERIFICATION_CACHE_SCHEMA_VERSION,
      entries: parsed.entries,
    };
  } catch {
    return emptyCache();
  }
}

function recordSuccess(cachePath, key, summary) {
  const cache = readCache(cachePath);
  const entries = Object.entries(cache.entries)
    .filter(([entryKey]) => entryKey !== key)
    .slice(-(MAX_VERIFICATION_CACHE_ENTRIES - 1));
  entries.push([key, { summary }]);
  const next = {
    schemaVersion: VERIFICATION_CACHE_SCHEMA_VERSION,
    entries: Object.fromEntries(entries),
  };
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(next)}\n`);
    renameSync(temporaryPath, cachePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function summarize(result) {
  const combined = [result.stdout ?? '', result.stderr ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();
  const meaningful = combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1)
    ?? 'completed without output';
  return meaningful.length <= MAX_CACHED_SUMMARY_CHARACTERS
    ? meaningful
    : meaningful.slice(-MAX_CACHED_SUMMARY_CHARACTERS);
}

function emptyCache() {
  return { schemaVersion: VERIFICATION_CACHE_SCHEMA_VERSION, entries: {} };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
