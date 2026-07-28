import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const AIM_ALIGNMENT_TOLERANCE_RADIANS = Math.PI / 180;

verifyViewportResizeUsesCanonicalCameraTransform();
verifyForwardFacingShootsAfterReady();
verifyFireWaitsForWeaponAlignment();

console.log('Combat Lab camera and aim alignment regression smoke passed.');

function verifyViewportResizeUsesCanonicalCameraTransform(): void {
  const renderer = readFileSync('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8');
  const adapter = readFileSync('src/rendering/PixiTacticalBoardAdapter.ts', 'utf8');
  const polishCss = readFileSync('src/combat-lab/combat-lab-ui-polish.css', 'utf8');

  assert.doesNotMatch(
    renderer,
    /world\.position\.set\s*\(/,
    'Combat Lab must not move the Pixi world behind CameraController; front-zone DOM overlays would keep stale camera coordinates.',
  );
  assert.match(
    renderer,
    /viewportAdapter\.preserveViewportCentre\s*\(/,
    'Combat Lab viewport resizing must use the camera-owned board adapter path.',
  );
  assert.match(
    adapter,
    /camera\.preserveViewportCentre/,
    'The Pixi board adapter must delegate viewport-centre preservation to CameraController.',
  );
  assert.doesNotMatch(
    polishCss,
    /#app canvas\s*\{[^}]*width:\s*100%\s*!important[^}]*height:\s*100%\s*!important/s,
    'Combat Lab CSS must not force-stretch the Pixi canvas independently of its renderer backing size.',
  );
}

function verifyForwardFacingShootsAfterReady(): void {
  const { state, shooter } = createRifleScenario('combat-lab-alignment-forward', 0);
  tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 0.8 });
  const task = shooter.infantryCombatRuntime.activeFireTask;
  const solution = task?.aimTracking.solution;
  const current = solution?.currentDirection;
  const desired = solution?.desiredDirection;
  const angleDegrees = current && desired
    ? Math.acos(Math.max(-1, Math.min(1, current.x * desired.x + current.y * desired.y + current.z * desired.z))) * 180 / Math.PI
    : null;
  assert.equal(
    state.infantryCombatProjectiles.committedShots.length,
    1,
    `A forward-facing shooter must fire after weapon ready time. Diagnostics: ${JSON.stringify({
      phase: task?.phase ?? null,
      readyRemainingSeconds: task?.readyRemainingSeconds ?? null,
      aimQuality: task?.aimQuality ?? null,
      physicalAimQuality: solution?.physicalAimQuality ?? null,
      usableAimQuality: solution?.usableAimQuality ?? null,
      current,
      desired,
      angleDegrees,
    })}`,
  );
}

function verifyFireWaitsForWeaponAlignment(): void {
  for (const facingDegrees of [20, 180]) {
    const { state, shooter } = createRifleScenario(`combat-lab-alignment-${facingDegrees}`, facingDegrees);

    let elapsedSeconds = 0;
    tickInfantryCombatSimulation(state, { intervalStartSeconds: elapsedSeconds, deltaSeconds: 0.8 });
    elapsedSeconds += 0.8;
    assert.equal(
      state.infantryCombatProjectiles.committedShots.length,
      0,
      `A shooter initially facing ${facingDegrees}° away must not fire before the weapon direction reaches the target.`,
    );

    for (let step = 0; step < 120 && state.infantryCombatProjectiles.committedShots.length === 0; step += 1) {
      tickInfantryCombatSimulation(state, { intervalStartSeconds: elapsedSeconds, deltaSeconds: 0.1 });
      elapsedSeconds += 0.1;
    }
    assert.equal(
      state.infantryCombatProjectiles.committedShots.length,
      1,
      `The shooter initially facing ${facingDegrees}° must eventually commit exactly one shot after physical alignment.`,
    );

    const direction = state.infantryCombatProjectiles.committedShots[0]!.aimDirectionBeforeDispersion!;
    const solution = shooter.infantryCombatRuntime.activeFireTask?.aimTracking.solution;
    assert.ok(solution?.valid, 'The committed shot must retain a valid physical aim solution during recovery.');
    const currentMagnitude = Math.hypot(direction.x, direction.y, direction.z);
    const desiredMagnitude = Math.hypot(
      solution.desiredDirection.x,
      solution.desiredDirection.y,
      solution.desiredDirection.z,
    );
    const dot = (
      direction.x * solution.desiredDirection.x
      + direction.y * solution.desiredDirection.y
      + direction.z * solution.desiredDirection.z
    ) / (currentMagnitude * desiredMagnitude);
    const angularError = Math.acos(Math.max(-1, Math.min(1, dot)));
    assert.ok(
      angularError <= AIM_ALIGNMENT_TOLERANCE_RADIANS + 1e-9,
      `The committed pre-dispersion direction must be within one degree of the physical aim solution; got ${(angularError * 180 / Math.PI).toFixed(4)}° for initial facing ${facingDegrees}°.`,
    );
  }
}

function createRifleScenario(id: string, facingDegrees: number) {
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
  return { state, shooter, target };
}
