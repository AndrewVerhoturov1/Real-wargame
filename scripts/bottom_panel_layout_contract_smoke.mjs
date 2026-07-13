import fs from 'node:fs';
import process from 'node:process';

const failures = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (path, values) => {
  const source = read(path);
  for (const value of values) if (!source.includes(value)) failures.push(`${path}: missing ${JSON.stringify(value)}`);
};

requireText('src/ui/TacticalWorkspace.ts', [
  'data-action="unit-attention-profile"',
  'Профиль внимания',
  'getAttentionProfileRegistry',
  'subscribeAttentionProfileRegistry',
  'applyAttentionProfileToUnit',
]);
requireText('src/tactical-workspace-compact-route.css', [
  'minmax(0, 1fr)',
  'overflow: hidden',
  'box-sizing: border-box',
  '.unit-attention-profile',
  '@media (max-width: 1180px)',
]);
requireText('src/ai-node-editor/NavigationProfileEditor.ts', [
  "type EditorTab = 'graph' | 'blackboard' | 'profiles' | 'attentionProfiles'",
  'Профили внимания',
  'renderAttentionProfiles',
]);

if (failures.length) {
  console.error('Bottom panel and attention profile contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Bottom panel and attention profile contract passed.');
