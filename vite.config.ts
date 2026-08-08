import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

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
  plugins: [sharedApplicationModeMenu()],
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        aiNodeEditor: fileURLToPath(new URL('./ai-node-editor.html', import.meta.url)),
        combatLab: fileURLToPath(new URL('./combat-lab.html', import.meta.url)),
        soldierTopdownPrototype: fileURLToPath(new URL('./soldier-topdown-prototype.html', import.meta.url)),
      },
    },
  },
  define: {
    __REAL_WARGAME_BUILD_IDENTITY__: JSON.stringify({
      branch,
      commitSha,
      buildId,
      generatedAt,
      performanceContractVersion: 'performance-report-v4',
    }),
  },
});

function sharedApplicationModeMenu(): Plugin {
  return {
    name: 'real-wargame-shared-application-mode-menu',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.path.endsWith('/ai-node-editor.html')) return html;
        return {
          html,
          tags: [{
            tag: 'script',
            attrs: {
              type: 'module',
              src: '/src/shared/AiEditorShellMenuEntry.ts',
            },
            injectTo: 'body',
          }],
        };
      },
    },
  };
}

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
