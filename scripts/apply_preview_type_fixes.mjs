import fs from 'node:fs';

const replacements = [
  {
    file: 'src/ai-node-editor/main.ts',
    from: "if (!root) throw new Error('AI node editor root is missing.');\n\ninstallAppShellMenu({ mode: 'editor' });",
    to: "if (!root) throw new Error('AI node editor root is missing.');\nconst editorRoot = root;\n\ninstallAppShellMenu({ mode: 'editor' });",
  },
  {
    file: 'src/ai-node-editor/main.ts',
    from: '  root.innerHTML = `',
    to: '  editorRoot.innerHTML = `',
  },
  {
    file: 'src/ui/GameHudControls.ts',
    from: "bestCover.exists ? formatMeters(bestCover.distanceCells * state.map.metersPerCell) : 'нет'",
    to: "bestCover.exists ? formatMeters((bestCover.distanceCells ?? 0) * state.map.metersPerCell) : 'нет'",
  },
  {
    file: 'src/ui/GameHudControls.ts',
    from: "threat.exists ? formatMeters(threat.distanceCells * state.map.metersPerCell) : 'нет'",
    to: "threat.exists ? formatMeters((threat.distanceCells ?? 0) * state.map.metersPerCell) : 'нет'",
  },
];

for (const replacement of replacements) {
  const source = fs.readFileSync(replacement.file, 'utf8');
  const occurrences = source.split(replacement.from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${replacement.file}: expected exactly one occurrence, found ${occurrences}: ${replacement.from}`);
  }
  fs.writeFileSync(replacement.file, source.replace(replacement.from, replacement.to), 'utf8');
  console.log(`patched ${replacement.file}`);
}
