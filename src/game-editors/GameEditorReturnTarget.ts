const RETURN_TARGET_ORIGIN = 'https://real-wargame.local';
const REPOSITORY_OWNED_PATHS = new Set([
  '/',
  '/index.html',
  '/ai-node-editor.html',
  '/combat-lab.html',
]);

export function getSafeGameEditorReturnTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, RETURN_TARGET_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== RETURN_TARGET_ORIGIN) return null;
  if (!REPOSITORY_OWNED_PATHS.has(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
