import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('./combat_lab_selection_controller_behavior_smoke.mjs');
await import('./combat_lab_map_tool_transaction_behavior_smoke.mjs');
await import('./combat_lab_participant_mutation_port_behavior_smoke.mjs');
await import('./combat_lab_workspace_services_behavior_smoke.mjs');
await import('./combat_lab_foundation_composition_behavior_smoke.mjs');

const [
  shell,
  session,
  checkpoint,
  renderer,
  overlay,
  extension,
  workspaceHosts,
  workspaceTabs,
  gameApplication,
  adapter,
  commands,
  menu,
  labMain,
  statePlanCss,
  commandRouteCss,
  compactRouteCss,
  scenarioFactories,
  combatRules,
  combatEngagement,
] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabShell.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabCheckpoint.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/game/GameApplication.ts', 'utf8'),
  readFile('src/rendering/PixiTacticalBoardAdapter.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8'),
  readFile('src/shared/AppShellMenu.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/ai-state-plan-panel.css', 'utf8'),
  readFile('src/command-plan-route-overlay.css', 'utf8'),
  readFile('src/tactical-workspace-compact-route.css', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioFactories.ts', 'utf8'),
  readFile('src/core/combat/CombatRules.ts', 'utf8'),
  readFile('src/core/combat/CombatEngagement.ts', 'utf8'),
]);

for (const marker of [
  'requestFireTask',
  'cancelSingleFireTask',
  'requestPlayerPostureTransition',
  'requestReloadWeapon',
  'requestDeployWeapon',
  'requestUndeployWeapon',
  'requestAmmoTransfer',
  'requestApplyFirstAidAction',
]) assert.match(commands, new RegExp(marker));

assert.doesNotMatch(shell, /roundsInWeapon\s*=/, 'UI must not directly mutate weapon rounds.');
assert.doesNotMatch(shell, /activeFireTask\s*=/, 'UI must not create FireTask state directly.');
assert.doesNotMatch(shell, /activeProjectiles\.(push|splice)/, 'UI must not create projectile state.');
assert.match(shell, /private readonly speed = select\(\)/);
assert.match(shell, /this\.speed\.value\s*=\s*String\(snapshot\.speed\)/);
assert.doesNotMatch(commands, /spawnReferenceProjectile|spawnProjectile|createProjectileCandidate/);
assert.match(session, /markInteractive/);
assert.match(session, /replaceCombatLabStateInPlace/);
assert.match(session, /const stableState\s*=\s*this\.built\.state/);
assert.match(checkpoint, /buildExportedScene/);
assert.match(checkpoint, /restoreExportedScene/);
assert.match(checkpoint, /restoreImportedInfantryCombatState/);

assert.doesNotMatch(renderer, /PixiTacticalBoardApp\.create/);
assert.doesNotMatch(renderer, /installCombatEffectsRenderer|installAttentionOverlayRenderer|installAdaptiveGridLod/);
assert.match(renderer, /context\.getWorldContainer\(\)/);
assert.match(renderer, /context\.addTickerListener\(/);
assert.match(renderer, /context\.restartStateBoundServices\(\)/);
assert.match(renderer, /session\.advance\(/);
assert.doesNotMatch(renderer, /new Application\s*\(/, 'Combat Lab must not own a second Pixi Application.');
assert.doesNotMatch(renderer, /tickSimulation\(/, 'Renderer must advance only through CombatLabVisualSession.');

assert.match(extension, /CombatLabShell/);
assert.match(extension, /CombatLabWorkspaceTabs\.create/);
assert.match(workspaceTabs, /combat-lab-drawer/);
assert.match(workspaceTabs, /combat-lab-drawer-toggle/);
assert.match(workspaceTabs, /aria-expanded/);
assert.equal((workspaceHosts.match(/tabId:/g) ?? []).length, 6, 'Combat Lab must publish exactly six workspace tabs.');
assert.doesNotMatch(workspaceHosts, /labelRu:\s*'Стенд'/, 'The removed Stand tab must not return.');
assert.match(extension, /installSharedSimulationControls/);
assert.match(extension, /data-action="fire-contact"/);
assert.doesNotMatch(extension, /adoptSimulationSidebar/);
assert.doesNotMatch(extension, /['"]fighter['"]/);
assert.doesNotMatch(extension, /Static Stage 10 compatibility markers|LegacyStage10HostContract/);
assert.doesNotMatch(extension, /installWorkspaceLabelLocalizer|activateTab\('stand'\)|activateMetricsView\('batch'\)/);
assert.match(scenarioFactories, /aiControl:\s*'manual'/, 'Every Combat Lab fixture must opt out of ordinary Graph AI control.');
assert.match(scenarioFactories, /disableLegacyAutomaticFire\(state\)/, 'Combat Lab states must lock the old automatic-fire system off.');
assert.match(combatRules, /legacyAutomaticFireDisabledStates\s*=\s*new WeakSet/);
assert.match(combatRules, /legacyAutomaticFireDisabledStates\.has\(state\)\s*\?\s*false/);
assert.match(combatEngagement, /if\s*\(!isFireAllowed\(state\)\)\s*return/);

for (const marker of [
  'installGameEditorWorkbench',
  'installTacticalWorkspace',
  'installCombatControls',
  'installAttentionRuntimePanel',
  'installCommandPlanRouteUi',
  'installRouteCostOverlayUi',
  'installAiDictionaryGameIntegration',
]) assert.match(gameApplication, new RegExp(marker));
assert.match(gameApplication, /installExtension/);
assert.match(gameApplication, /restartStateBoundServices\(\): void/);

assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS\s*=\s*4096/);
assert.match(overlay, /bindSession\(/);
assert.match(overlay, /layer\.enabled/);
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|drawUnit|mapWidthPx|mapHeightPx/);
assert.match(adapter, /getWorldContainer/);
assert.match(adapter, /addTickerListener/);

assert.match(statePlanCss, /\.unit-state-plan-popover\s*\{[^}]*display:\s*none\s*!important/s, 'The map-obscuring order/state popover must be hidden in every game mode.');
assert.match(statePlanCss, /\.unit-state-plan\s*>\s*summary\s*\{[^}]*pointer-events:\s*none/s, 'The disabled popover must not reopen from the compact summary.');
assert.match(commandRouteCss, /\.unit-bar-route-controls\s*>\s*\.unit-route-details\s*\{[^}]*display:\s*none\s*!important/s);
assert.match(compactRouteCss, /\.route-cost-inspector-panel\s+\.unit-route-details\s*\{[^}]*display:\s*block/s);

assert.match(labMain, /GameApplication\.create\(/);
assert.match(labMain, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);
assert.match(menu, /modeLink\('\/', 'game', 'Игра', mode\)/);
assert.match(menu, /modeLink\('\/ai-node-editor\.html', 'editor', 'Редактор ИИ', mode\)/);
assert.match(menu, /modeLink\('\/combat-lab\.html', 'combat-lab', 'Испытательный полигон', mode\)/);
assert.match(menu, /aria-current="page"/);

console.log('Combat Lab full-game UI production-boundary smoke passed.');
