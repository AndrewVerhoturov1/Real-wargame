import fs from 'node:fs';

function replaceOnce(file, from, to) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one occurrence, found ${count}: ${from}`);
  fs.writeFileSync(file, source.replace(from, to), 'utf8');
  console.log(`patched ${file}`);
}

replaceOnce('src/ui/AiTestLabControls.ts',
`  const runtime = getAiLabRuntime(state);
  const topHost = document.querySelector<HTMLElement>('.top-command-bar') ?? document.body;
  const topTools = document.createElement('div');`,
`  const runtime = getAiLabRuntime(state);
  const controlsHost = document.querySelector<HTMLElement>('.top-command-controls');
  const launcher = button('Полигон ИИ', () => {
    setAiLabOpen(state, !runtime.open);
    updateOpenState();
    renderAll();
    onChanged();
  }, 'primary ai-lab-toggle');
  const topTools = document.createElement('div');`);

replaceOnce('src/ui/AiTestLabControls.ts',
`    dock.hidden = !runtime.open;
    bottomBar.hidden = !runtime.open;
    topTools.classList.toggle('open', runtime.open);`,
`    dock.hidden = !runtime.open;
    bottomBar.hidden = !runtime.open;
    topTools.hidden = !runtime.open;
    topTools.classList.toggle('open', runtime.open);`);

replaceOnce('src/ui/AiTestLabControls.ts',
`  const renderTopTools = () => {
    topTools.replaceChildren();
    const toggle = button(runtime.open ? 'Закрыть полигон' : 'Полигон ИИ', () => {
      setAiLabOpen(state, !runtime.open);
      updateOpenState();
      renderAll();
      onChanged();
    }, runtime.open ? 'active primary' : 'primary');
    toggle.classList.add('ai-lab-toggle');
    topTools.append(toggle);

    if (!runtime.open) return;`,
`  const renderTopTools = () => {
    topTools.replaceChildren();
    launcher.textContent = runtime.open ? 'Закрыть полигон' : 'Полигон ИИ';
    launcher.classList.toggle('active', runtime.open);
    launcher.setAttribute('aria-pressed', String(runtime.open));
    if (!runtime.open) return;`);

replaceOnce('src/ui/AiTestLabControls.ts',
`  topHost.append(topTools);
  document.body.append(dock, bottomBar);`,
`  if (controlsHost) controlsHost.append(launcher);
  else document.body.append(launcher);
  document.body.append(topTools, dock, bottomBar);`);

replaceOnce('src/ui/AiTestLabControls.ts',
`    const nextRenderKey = \`${nextSelectionKey}|\${runtime.open}|\${runtime.activePanel}|\${runtime.tool}|\${runtime.awarenessMode}\`;`,
`    const nextRenderKey = buildLabRenderKey(state, runtime, nextSelectionKey);`);

replaceOnce('src/ui/AiTestLabControls.ts',
`function isEditingControl(): boolean {`,
`function buildLabRenderKey(
  state: SimulationState,
  runtime: ReturnType<typeof getAiLabRuntime>,
  selectionKey: string,
): string {
  const unit = getSelectedUnit(state);
  const zone = getSelectedPressureZone(state);
  const object = getSelectedMapObject(state);
  return [
    selectionKey,
    runtime.open,
    runtime.activePanel,
    runtime.tool,
    runtime.awarenessMode,
    unit?.behaviorRuntime.posture ?? '',
    unit?.behaviorRuntime.stress.toFixed(1) ?? '',
    unit?.behaviorRuntime.suppression.toFixed(1) ?? '',
    unit?.soldier.condition.fatigue.toFixed(1) ?? '',
    unit?.soldier.condition.morale.toFixed(1) ?? '',
    unit?.behaviorRuntime.ammo ?? '',
    unit?.tacticalKnowledge.revision ?? '',
    zone?.x.toFixed(2) ?? '',
    zone?.y.toFixed(2) ?? '',
    zone?.directionDegrees?.toFixed(1) ?? '',
    zone?.arcDegrees?.toFixed(1) ?? '',
    zone?.rangeCells?.toFixed(2) ?? '',
    zone?.minRangeCells?.toFixed(2) ?? '',
    zone?.radiusCells.toFixed(2) ?? '',
    zone?.widthCells.toFixed(2) ?? '',
    zone?.heightCells.toFixed(2) ?? '',
    zone?.rotationDegrees?.toFixed(1) ?? '',
    object?.coverProtection ?? '',
    object?.coverReliability ?? '',
    object?.concealment ?? '',
  ].join('|');
}

function isEditingControl(): boolean {`);

replaceOnce('src/ai-test-lab.css',
`  --ai-lab-top-height: 112px;`,
`  --ai-lab-top-height: 128px;`);

replaceOnce('src/ai-test-lab.css',
`.ai-lab-top-tools {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  pointer-events: auto;
}

.ai-lab-top-tools:not(.open) {
  grid-column: auto;
}`,
`.ai-lab-top-tools {
  position: fixed;
  z-index: 86;
  left: 16px;
  right: calc(var(--ai-lab-dock-width) + 10px);
  top: 72px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(255, 232, 151, 0.35);
  border-radius: 9px;
  background: rgba(18, 23, 18, 0.97);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.ai-lab-top-tools[hidden] {
  display: none !important;
}`);

replaceOnce('src/ai-test-lab.css',
`body.ai-lab-open .top-command-bar {
  grid-template-columns: repeat(7, minmax(0, auto));
  max-width: calc(100vw - var(--ai-lab-dock-width) - 24px);
  align-items: center;
}`,
`body.ai-lab-open .top-command-bar {
  right: calc(var(--ai-lab-dock-width) + 10px);
  align-items: center;
}`);

console.log('AI lab visual fixes applied');
