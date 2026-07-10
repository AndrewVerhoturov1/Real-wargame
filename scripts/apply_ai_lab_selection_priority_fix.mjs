import fs from 'node:fs';

const file = 'src/core/testing/AiLabInteraction.ts';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one match, found ${count}: ${from.slice(0, 120)}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  `  const selectedZone = getSelectedZone(state);`,
  `  if (runtime.activePanel === 'fighter') {
    const preferredUnit = findUnitAtGridPosition(state.units, grid, 0.52);
    if (preferredUnit) {
      selectUnit(state, preferredUnit.id);
      state.editor.selectedObjectId = null;
      state.editor.selectedZoneId = null;
      runtime.drag = {
        kind: 'unit',
        id: preferredUnit.id,
        handle: 'move',
        startGrid: grid,
        snapshot: { x: preferredUnit.position.x, y: preferredUnit.position.y },
      };
      setAiLabPanel(state, 'fighter');
      setAiLabStatus(state, \`Выбран боец: \${preferredUnit.labels.ru}. Его можно перетащить.\`);
      return true;
    }
  }

  if (runtime.activePanel === 'cover') {
    const preferredObject = findObjectAtPosition(state.map.objects, grid);
    if (preferredObject) {
      state.editor.selectedObjectId = preferredObject.id;
      state.editor.selectedZoneId = null;
      runtime.drag = {
        kind: 'object',
        id: preferredObject.id,
        handle: 'move',
        startGrid: grid,
        snapshot: { x: preferredObject.x, y: preferredObject.y },
      };
      setAiLabPanel(state, 'cover');
      setAiLabStatus(state, \`Выбрано укрытие: \${preferredObject.labels?.ru ?? preferredObject.kind}. Его можно перетащить.\`);
      return true;
    }
  }

  const selectedZone = getSelectedZone(state);`,
);

replaceOnce(
  `    const selectedZone = getSelectedZone(state);
    runtime.hoveredHandle = selectedZone ? findThreatHandleAtPosition(selectedZone, grid) : null;`,
  `    const selectedZone = getSelectedZone(state);
    runtime.hoveredHandle = runtime.activePanel === 'threat' && selectedZone
      ? findThreatHandleAtPosition(selectedZone, grid)
      : null;`,
);

fs.writeFileSync(file, source);
console.log('AI lab selection priority fix applied.');
