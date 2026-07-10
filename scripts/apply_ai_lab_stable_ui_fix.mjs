import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function replaceExactlyOnce(source, from, to, file) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}: ${from.slice(0, 120)}`);
  return source.replace(from, to);
}

const controlsFile = 'src/ui/AiTestLabControls.ts';
let controls = read(controlsFile);

controls = replaceExactlyOnce(
  controls,
  `  const renderAll = () => {
    renderTopTools();
    renderDock();
    renderBottom();
    updateOpenState();
  };`,
  `  const renderAll = () => {
    renderTopTools();
    renderDock();
    renderBottom();
    updateOpenState();
    const currentSelectionKey = \`${'${state.selectedUnitId ?? \'\'}'}|${'${state.editor.selectedZoneId ?? \'\'}'}|${'${state.editor.selectedObjectId ?? \'\'}'}\`;
    renderKey = buildLabRenderKey(state, runtime, currentSelectionKey);
  };`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `  window.setInterval(() => {
    const unit = getSelectedUnit(state);
    const nextSelectionKey = \`${'${state.selectedUnitId ?? \'\'}'}|${'${state.editor.selectedZoneId ?? \'\'}'}|${'${state.editor.selectedObjectId ?? \'\'}'}\`;`,
  `  window.setInterval(() => {
    const nextSelectionKey = \`${'${state.selectedUnitId ?? \'\'}'}|${'${state.editor.selectedZoneId ?? \'\'}'}|${'${state.editor.selectedObjectId ?? \'\'}'}\`;`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `    if (runtime.open) updateDiagnostics(diagnostics, state);
    if (unit && runtime.activePanel === 'awareness' && runtime.awarenessMode !== 'off') {
      unit.tacticalKnowledge.revision += 0;
    }`,
  `    if (runtime.open) {
      updateDiagnostics(diagnostics, state);
      updateLiveFighterState(dockBody, state);
    }`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `  target.append(readonlyGrid([
    ['Поза', postureLabel(unit.behaviorRuntime.posture)],
    ['Стресс', round(unit.behaviorRuntime.stress)],
    ['Подавление', round(unit.behaviorRuntime.suppression)],
    ['Усталость', round(unit.soldier.condition.fatigue)],
    ['Мораль', round(unit.soldier.condition.morale)],
    ['Замешательство', round(unit.soldier.condition.confusion)],
    ['Здоровье', round(unit.soldier.condition.health)],
    ['Патроны', Math.round(unit.behaviorRuntime.ammo)],
    ['Оружие', unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово'],
    ['Действие', unit.behaviorRuntime.currentAction],
  ]));`,
  `  target.append(readonlyGrid([
    ['Поза', postureLabel(unit.behaviorRuntime.posture)],
    ['Стресс', round(unit.behaviorRuntime.stress)],
    ['Подавление', round(unit.behaviorRuntime.suppression)],
    ['Усталость', round(unit.soldier.condition.fatigue)],
    ['Мораль', round(unit.soldier.condition.morale)],
    ['Замешательство', round(unit.soldier.condition.confusion)],
    ['Здоровье', round(unit.soldier.condition.health)],
    ['Патроны', Math.round(unit.behaviorRuntime.ammo)],
    ['Оружие', unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово'],
    ['Действие', unit.behaviorRuntime.currentAction],
  ], 'ai-lab-current-state'));`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `function heading(title: string, hintText: string): HTMLElement {`,
  `function updateLiveFighterState(target: HTMLElement, state: SimulationState): void {
  const unit = getSelectedUnit(state);
  const outputs = target.querySelectorAll<HTMLElement>('.ai-lab-current-state b');
  if (!unit || outputs.length === 0) return;
  const values = [
    postureLabel(unit.behaviorRuntime.posture),
    String(round(unit.behaviorRuntime.stress)),
    String(round(unit.behaviorRuntime.suppression)),
    String(round(unit.soldier.condition.fatigue)),
    String(round(unit.soldier.condition.morale)),
    String(round(unit.soldier.condition.confusion)),
    String(round(unit.soldier.condition.health)),
    String(Math.round(unit.behaviorRuntime.ammo)),
    unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово',
    unit.behaviorRuntime.currentAction,
  ];
  outputs.forEach((output, index) => {
    if (values[index] !== undefined) output.textContent = values[index];
  });
}

function heading(title: string, hintText: string): HTMLElement {`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `  const unit = getSelectedUnit(state);
  const zone = getSelectedPressureZone(state);`,
  `  const zone = getSelectedPressureZone(state);`,
  controlsFile,
);

controls = replaceExactlyOnce(
  controls,
  `    runtime.awarenessMode,
    unit?.behaviorRuntime.posture ?? '',
    unit?.behaviorRuntime.stress.toFixed(1) ?? '',
    unit?.behaviorRuntime.suppression.toFixed(1) ?? '',
    unit?.soldier.condition.fatigue.toFixed(1) ?? '',
    unit?.soldier.condition.morale.toFixed(1) ?? '',
    unit?.behaviorRuntime.ammo ?? '',
    unit?.tacticalKnowledge.revision ?? '',
    zone?.x.toFixed(2) ?? '',`,
  `    runtime.awarenessMode,
    zone?.x.toFixed(2) ?? '',`,
  controlsFile,
);

write(controlsFile, controls);

const testFile = 'tests/preview-screenshots.spec.ts';
let test = read(testFile);

test = replaceExactlyOnce(
  test,
  `async function waitForAiEngine(): Promise<void> {`,
  `async function openNodePalette(page: Page): Promise<void> {
  const palette = page.locator('.palette-panel');
  if (await palette.isVisible()) return;
  const addNode = page.getByRole('button', { name: /\\+ Add node|\\+ Добавить ноду/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await addNode.click({ force: true });
    await page.waitForTimeout(150);
    if (await palette.isVisible()) return;
  }
  await expect(palette).toBeVisible();
}

async function waitForAiEngine(): Promise<void> {`,
  testFile,
);

test = replaceExactlyOnce(
  test,
  `  await page.getByRole('button', { name: /\\+ Add node|\\+ Добавить ноду/ }).click();
  await expect(page.locator('.palette-panel')).toBeVisible();`,
  `  await openNodePalette(page);
  await expect(page.locator('.palette-panel')).toBeVisible();`,
  testFile,
);

test = replaceExactlyOnce(
  test,
  `  await page.getByRole('button', { name: /\\+ Add node|\\+ Добавить ноду/ }).click();
  await page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ }).click();`,
  `  await openNodePalette(page);
  await expect(page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ })).toBeVisible();
  await page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ }).click();`,
  testFile,
);

write(testFile, test);
console.log('Stable AI lab UI and screenshot test fixes applied.');
