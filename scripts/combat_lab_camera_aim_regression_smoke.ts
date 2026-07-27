import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

verifyViewportResizeUsesCanonicalCameraTransform();
verifyFireWaitsForWeaponAlignment();

console.log('Combat Lab camera and aim alignment regression smoke passed.');

function verifyViewportResizeUsesCanonicalCameraTransform(): void {
  const renderer = readFileSync('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8');
  const adapter = readFileSync('src/rendering/PixiTacticalBoardAdapter.ts', 'utf8');
  const contextTypes = readFileSync('src/game/GameApplicationTypes.ts', 'utf8');
  const polishCss = readFileSync('src/combat-lab/combat-lab-ui-polish.css', 'utf8');

  assert.doesNotMatch(
    renderer,
    /world\.position\.set\s*\(/,
    'Combat Lab must not move the Pixi world behind CameraController; front-zone DOM overlays would keep stale camera coordinates.',
  );
  assert.match(
    renderer,
    /context\.preserveViewportCentre\s*\(/,
    'Combat Lab viewport resizing must use the canonical camera transform API.',
  );
  assert.match(adapter, /preserveViewportCentre/, 'The Pixi board adapter must expose canonical viewport-centre preservation.');
  assert.match(contextTypes, /preserveViewportCentre/, 'GameApplicationContext must expose canonical viewport-centre preservation.');
  assert.doesNotMatch(
    polishCss,
    /#app canvas\s*\{[^}]*width:\s*100%\s*!important[^}]*height:\s*100%\s*!important/s,
    'Combat Lab CSS must not force-stretch the Pixi canvas independently of its renderer backing size.',
  );
}

function verifyFireWaitsForWeaponAlignment(): void {
  for (const facingDegrees of [20, 180]) {
    const id = `combat-lab-alignment-${facingDegrees}`;
    const state = createInitialState({
      width: 100,
      height: 30,
      cellSize: 20,
      metersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
      objects: [],
    }, [
      { id, side: 'blue', x: 2, y: 3, type: 'infantry_squad', facingDegrees },
      { id: `${id}-target`, side: 'red', x: 10, y: 3, type: 'infantry_squad', facingDegrees: 180 },
    ]);
    const shooter = state.units[0]!;
    const target = state.units[1]!;
    assert.equal(equipPrimaryWeaponFromLoadout(
      shooter,
      createDefaultCombatCatalogRegistry(),
      { definitionId: 'loadout_rifleman', revision: 1 },
    ).status, 'equipped');
    assert.equal(requestSingleFireTask(shooter, {
      owner: { source: 'test', id: `${id}-owner` },
      ownerToken: `${id}-token`,
      target: { xMetres: 20, yMetres: 6, zMetres: 1.35 },
      targetRadiusMetres: 0,
      contactId: null,
      sourceUnitId: target.id,
      mode: 'single',
      minimumSolutionQuality: 0,
      maximumFriendlyFireRisk: 0,
      requestedSeconds: 0,
    }).status, 'started');

    tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
    assert.equal(
      state.infantryCombatProjectiles.committedShots.length,
      0,
      `A shooter initially facing ${facingDegrees}° away must not fire before the weapon direction reaches the target.`,
    );

    tickInfantryCombatSimulation(state, { intervalStartSeconds: 0.8, deltaSeconds: 1.5 });
    assert.equal(state.infantryCombatProjectiles.committedShots.length, 1, 'The shot must commit after physical alignment completes.');
    const direction = state.infantryCombatProjectiles.committedShots[0]!.aimDirectionBeforeDispersion!;
    assert.ok(direction.x > 0.999, 'The committed pre-dispersion direction must face the target.');
    assert.ok(Math.abs(direction.y) < 0.01, 'The committed pre-dispersion direction must not retain the old sideways bearing.');
  }
}
