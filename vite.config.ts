import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const generatedAt = new Date().toISOString();
const commitSha = firstNonEmpty(
  process.env.REAL_WARGAME_COMMIT_SHA,
  process.env.GITHUB_SHA,
  readGit(['rev-parse', 'HEAD']),
  'unknown',
);
const branch = firstNonEmpty(
  process.env.REAL_WARGAME_BRANCH,
  process.env.GITHUB_HEAD_REF,
  process.env.GITHUB_REF_NAME,
  readGit(['rev-parse', '--abbrev-ref', 'HEAD']),
  'unknown',
);
const buildId = firstNonEmpty(
  process.env.REAL_WARGAME_BUILD_ID,
  commitSha !== 'unknown' ? `${commitSha.slice(0, 12)}-${generatedAt}` : undefined,
  `unidentified-${generatedAt}`,
);

export default defineConfig({
  define: {
    __REAL_WARGAME_BUILD_IDENTITY__: JSON.stringify({
      branch,
      commitSha,
      buildId,
      generatedAt,
      performanceContractVersion: 'performance-report-v6',
    }),
  },
});

function readGit(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return 'unknown';
}
