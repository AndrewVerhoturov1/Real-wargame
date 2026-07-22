import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const originalReadFileSync = fs.readFileSync.bind(fs);

fs.readFileSync = (filePath, ...args) => {
  const primary = originalReadFileSync(filePath, ...args);
  if (typeof filePath !== 'string' || !filePath.endsWith('/src/ui/TacticalWorkspaceBase.ts')) return primary;

  const compatibilityPath = filePath.replace(
    /TacticalWorkspaceBase\.ts$/,
    'TacticalWorkspaceBaseLegacy.ts',
  );
  const compatibility = originalReadFileSync(compatibilityPath, ...args);
  if (typeof primary === 'string' && typeof compatibility === 'string') {
    return `${primary}\n${compatibility}`;
  }
  if (Buffer.isBuffer(primary) && Buffer.isBuffer(compatibility)) {
    return Buffer.concat([primary, Buffer.from('\n'), compatibility]);
  }
  return primary;
};
syncBuiltinESMExports();

try {
  await import('./tactical_workspace_smoke_pixijs8_baseline_legacy.mjs');
} finally {
  fs.readFileSync = originalReadFileSync;
  syncBuiltinESMExports();
}
