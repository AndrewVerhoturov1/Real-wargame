import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(path.join(root, relativePath), 'utf8');

function expectContains(source: string, needle: string, message: string): void {
  if (!source.includes(needle)) throw new Error(`${message}\nMissing: ${needle}`);
}

function expectNotContains(source: string, needle: string, message: string): void {
  if (source.includes(needle)) throw new Error(`${message}\nUnexpected: ${needle}`);
}

const editorMain = read('src/ai-node-editor/main.ts');
expectNotContains(editorMain, 'run-check-45', 'The obsolete Auto 4–5 button must be removed.');
expectNotContains(editorMain, 'runSimpleCheck45', 'The obsolete Auto 4–5 handler must be removed.');
expectNotContains(editorMain, "installAppShellMenu({ mode: 'editor' })", 'The editor must not install a second fixed shell menu.');

const profileEditor = read('src/ai-node-editor/NavigationProfileEditor.ts');
expectContains(profileEditor, 'Данные бойца', 'The blackboard tab needs a human-facing Russian label.');
expectContains(profileEditor, 'data-editor-global-actions', 'The unified editor menu needs a stable global action slot.');
expectContains(profileEditor, 'data-editor-action="refresh"', 'The unified editor menu needs refresh.');
expectContains(profileEditor, 'data-editor-action="open-game"', 'The unified editor menu needs open-game.');
expectContains(profileEditor, 'data-editor-action="exit"', 'The unified editor menu needs exit.');
expectNotContains(profileEditor, 'data-navigation-tab="diagnostics"', 'Route architecture documentation must not be a primary editor tab.');
expectNotContains(profileEditor, 'function renderDiagnostics', 'The obsolete standalone diagnostics page must be removed.');

const dictionaryIntegration = read('src/ai-node-editor/AiDictionaryEditorIntegration.ts');
expectContains(dictionaryIntegration, '[data-editor-global-actions]', 'AI Dictionary must install into the unified editor menu.');
expectNotContains(dictionaryIntegration, "document.querySelector('.ai-editor-actions')", 'AI Dictionary must not live in the graph-local toolbar.');

const dictionaryWorkbench = read('src/ai-node-editor/AiDictionaryWorkbench.ts');
expectContains(dictionaryWorkbench, '[data-editor-global-actions]', 'AI Tools must install into the unified editor menu.');
expectNotContains(dictionaryWorkbench, "document.querySelector('.ai-editor-actions')", 'AI Tools must not live in the graph-local toolbar.');

const tacticalWorkspaceBase = read('src/ui/TacticalWorkspaceBase.ts');
for (const needle of [
  'data-action="unit-navigation-profile"',
  'data-role="route-summary"',
  'data-role="route-details-command"',
  'data-role="route-details-plan"',
  'data-role="route-details-route"',
  'data-role="route-details-profile"',
  'data-role="route-details-cost"',
  'data-role="route-details-reason"',
]) expectContains(tacticalWorkspaceBase, needle, `Tactical workspace base is missing stable route diagnostics: ${needle}`);
expectContains(tacticalWorkspaceBase, 'updatePlayerCommandNavigationProfile', 'Changing the game profile must update an outstanding player command without direct path search.');

const tacticalWorkspace = read('src/ui/TacticalWorkspace.ts');
for (const needle of [
  'ROUTE_COST_INSPECTOR_RENDERED_EVENT',
  'data-tab="routeCost"',
  'Стоимость маршрута',
  'data-role="route-cost-inspector-host"',
  'routeCostInspectorPanel.hidden = false',
  'sidebarBody.hidden = true',
  "setSimulationLayerMode(state, 'info')",
  "shell.querySelector<HTMLButtonElement>('[data-action=\"route-cost-quick-toggle\"]')?.remove();",
]) expectContains(tacticalWorkspace, needle, `Tactical workspace shell is missing route-cost inspector contract: ${needle}`);

const routeCostUi = read('src/ui/RouteCostOverlayUi.ts');
expectContains(routeCostUi, 'ROUTE_COST_INSPECTOR_RENDERED_EVENT', 'Route cost UI must react when its inspector host is rendered.');
expectContains(routeCostUi, '[data-role="route-cost-inspector-host"]', 'Route cost UI must mount into the right inspector.');
expectContains(routeCostUi, 'toggleRouteCostOverlay(state)', 'Route cost UI must reuse the canonical overlay toggle.');
expectContains(routeCostUi, 'setRouteCostOverlayMode(state, mode.value as RouteCostOverlayMode)', 'Route cost UI must reuse the canonical overlay mode setter.');
expectContains(routeCostUi, '[data-role="route-details-profile"]', 'Route cost UI must keep updating the compact route details popover.');
expectNotContains(routeCostUi, '.workspace-display-panel', 'The top View menu must not contain a second route-cost control block.');
expectNotContains(routeCostUi, '[data-action="route-cost-quick-toggle"]', 'Route cost UI must not bind a removed bottom quick toggle.');
expectNotContains(routeCostUi, 'currentBlock?.append(profileStatus, routeCostStatus, routeReasonStatus)', 'Route cost UI must not append three unbounded rows to the soldier card.');
expectNotContains(routeCostUi, 'route-profile-override', 'The misleading diagnostic profile override must be replaced by the real unit profile selector.');

const commandPlanUi = read('src/ui/CommandPlanRouteUi.ts');
expectContains(commandPlanUi, '[data-role="route-details-command"]', 'Command UI must bind the compact details popover.');
expectNotContains(commandPlanUi, 'currentBlock.append(command, plan, route)', 'Command UI must not append three unbounded rows to the soldier card.');

const unitModel = read('src/core/units/UnitModel.ts');
expectContains(unitModel, 'playerNavigationProfileId', 'Unit runtime must store the selected player navigation profile.');

const playerCommand = read('src/core/orders/PlayerCommand.ts');
expectContains(playerCommand, 'navigationProfileId', 'Player commands must freeze the exact selected profile ID.');
expectContains(playerCommand, 'updatePlayerCommandNavigationProfile', 'Player command profile updates must preserve command ownership identity.');

const resolver = read('src/core/navigation/NavigationProfileResolver.ts');
expectContains(resolver, 'playerCommandProfileId', 'The resolver must accept an exact player command profile ID.');
expectContains(resolver, 'selectedPlayerProfileId', 'The resolver must accept the profile selected in the game UI.');

const runtime = read('src/core/navigation/NavigationRuntime.ts');
expectContains(runtime, 'isPlayerCommandOutstanding(command)', 'Runtime resolution must only prioritize an outstanding player command.');
expectContains(runtime, 'playerCommandProfileId: activeCommand?.navigationProfileId', 'Runtime resolution must pass the exact active command profile ID.');
expectContains(runtime, 'selectedPlayerProfileId: unit.playerNavigationProfileId', 'Runtime resolution must pass the profile selected in the game UI.');

const routedOrders = read('src/core/orders/RoutedMoveOrders.ts');
expectContains(routedOrders, 'unit.playerNavigationProfileId', 'New player movement commands must use the profile selected in the game.');

const overlayModel = read('src/rendering/CommandPlanRouteOverlayModel.ts');
expectContains(overlayModel, "unit.plan?.status === 'active'", 'Only active plans may expose blue plan targets.');

const routeCostRenderer = read('src/rendering/PixiRouteCostOverlayRenderer.ts');
expectContains(routeCostRenderer, 'this.legend.position.set(8, 34)', 'The route-cost legend must sit below front-zone labels.');

const workspaceCss = read('src/tactical-workspace-compact-route.css');
expectContains(workspaceCss, '.unit-route-details-panel', 'Compact route details need an above-bar popover.');
expectContains(workspaceCss, '.unit-bar-route-controls', 'Compact profile and route details need dedicated layout styles.');

const profileCss = read('src/ai-node-editor/navigation-profile-editor.css');
expectNotContains(profileCss, 'margin: -20px -24px 18px', 'The profile heading must not overlap content through a negative sticky margin.');
expectContains(profileCss, '.navigation-profile-global-actions', 'The unified editor global action slot needs layout styles.');

console.log('Compact route controls and editor navigation smoke passed.');
