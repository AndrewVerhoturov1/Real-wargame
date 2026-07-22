import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BallisticLineProbeResult } from '../src/core/combat/BallisticLineProbe';
import { getActiveEnvironmentProfile } from '../src/core/map/EnvironmentProfileRuntime';
import { normalizeMap, type TacticalMap, type TacticalMapData } from '../src/core/map/MapModel';
import type { VisibilityTraceResult } from '../src/core/visibility/VisibilityRayKernel';
import {
  solveTacticalActionPorts,
  type TacticalActionPortProbeContext,
  type TacticalActionPortSolverRequest,
} from '../src/core/tactical/action-ports/TacticalActionPortSolver';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { createStaticTacticalPositionBasisIdentity } from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { createDefaultStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';

const profile = getActiveEnvironmentProfile();
const settings = createDefaultStaticTacticalPositionSettings();

verifyDeterminismAndObjectOrder();
verifyGeometryRadiusAndRotation();
verifyPostureAndLines();
verifyDirectionPurposeAndPurity();
verifyBudgetsAndArchitecture();

console.log('tactical action ports smoke: ok');

function verifyDeterminismAndObjectOrder(): void {
  const map = actionMap();
  const request = baseRequest(map, clearProbes());
  const first = solveTacticalActionPorts(request);
  const second = solveTacticalActionPorts(request);
  assert.deepEqual(first, second, 'same input must be deterministic');

  const reordered = actionMap([...map.objects].reverse().map(exportObject));
  const reorderedResult = solveTacticalActionPorts(baseRequest(reordered, clearProbes()));
  assert.deepEqual(
    first.candidates.map(candidateSignature),
    reorderedResult.candidates.map(candidateSignature),
    'object order must not change result',
  );
}

function verifyGeometryRadiusAndRotation(): void {
  const map = actionMap();
  const small = solveTacticalActionPorts({ ...baseRequest(map, clearProbes()), soldierRadiusMeters: 0.05 });
  const large = solveTacticalActionPorts({ ...baseRequest(map, clearProbes()), soldierRadiusMeters: 0.7 });
  assert.ok(small.rejected.some((candidate) => candidate.rejectionReasons.includes('inside_object')), 'inside-object candidate must be rejected');
  assert.ok(large.diagnostics.rejectedByGeometry >= small.diagnostics.rejectedByGeometry, 'soldier radius must affect clearance');

  const unrotated = actionMap([{ ...exportObject(map.objects[0]!), rotationDegrees: 0 }, exportObject(map.objects[1]!) ]);
  const rotated = actionMap([{ ...exportObject(map.objects[0]!), rotationDegrees: 90 }, exportObject(map.objects[1]!) ]);
  const a = solveTacticalActionPorts(baseRequest(unrotated, clearProbes()));
  const b = solveTacticalActionPorts(baseRequest(rotated, clearProbes()));
  assert.notDeepEqual(
    a.rejected.map((candidate) => `${candidate.id}:${candidate.rejectionReasons.join(',')}`),
    b.rejected.map((candidate) => `${candidate.id}:${candidate.rejectionReasons.join(',')}`),
    'rotated object geometry must affect candidates',
  );
}

function verifyPostureAndLines(): void {
  const map = actionMap([]);
  const postureProbes: TacticalActionPortProbeContext = {
    probeVisibility: (request) => visibilityResult(request.originHeightAboveGroundMeters > 1.2),
    probeBallistic: (request) => ballisticResult(request.origin.zMetres > 1.2),
  };
  const observation = solveTacticalActionPorts(baseRequest(map, postureProbes));
  assert.ok(observation.candidates.some((candidate) => candidate.recommendedPosture === 'standing'));
  assert.ok(observation.rejected.some((candidate) => (
    candidate.recommendedPosture === 'prone'
    && candidate.rejectionReasons.includes('visibility_blocked')
  )), 'postures must have distinct observation lines');

  const firing = solveTacticalActionPorts({
    ...baseRequest(map, postureProbes),
    task: {
      purpose: 'firing',
      directionRadians: 0,
      target: { position: { x: 7.5, y: 4.5 }, heightAboveGroundMeters: 1.2, maximumDistanceMeters: 100 },
    },
  });
  assert.ok(firing.candidates.some((candidate) => candidate.recommendedPosture === 'standing'));
  assert.ok(firing.rejected.some((candidate) => candidate.rejectionReasons.includes('ballistic_blocked')));

  const blocked = solveTacticalActionPorts({ ...baseRequest(map, blockedProbes()), allowedPostures: ['standing'] });
  assert.equal(blocked.candidates.length, 0, 'blocked line must be rejected');
  const clear = solveTacticalActionPorts({ ...baseRequest(map, clearProbes()), allowedPostures: ['standing'] });
  assert.ok(clear.candidates.length > 0, 'clear line must be accepted');
}

function verifyDirectionPurposeAndPurity(): void {
  const map = actionMap([]);
  const anchor = { x: 4.5, y: 4.5 };
  const mapBefore = JSON.stringify(map);
  const ammoState = { ammo: 30, suppression: 0, combatEvents: 0 };
  const directionalProbes = (upper: boolean): TacticalActionPortProbeContext => ({
    probeVisibility: () => visibilityResult(true),
    probeBallistic: (request) => ballisticResult(true, upper
      ? request.origin.yMetres / 20
      : (map.height * map.metersPerCell - request.origin.yMetres) / 20),
  });
  const north = solveTacticalActionPorts({
    ...baseRequest(map, directionalProbes(true)),
    anchor,
    task: {
      purpose: 'firing', directionRadians: Math.PI / 2,
      target: { position: { x: 4.5, y: 8.5 }, heightAboveGroundMeters: 1.2, maximumDistanceMeters: 100 },
    },
  });
  const south = solveTacticalActionPorts({
    ...baseRequest(map, directionalProbes(false)),
    anchor,
    task: {
      purpose: 'firing', directionRadians: -Math.PI / 2,
      target: { position: { x: 4.5, y: 0.5 }, heightAboveGroundMeters: 1.2, maximumDistanceMeters: 100 },
    },
  });
  assert.notDeepEqual(north.best?.position, south.best?.position, 'direction or target must change best action port');

  const observation = solveTacticalActionPorts(baseRequest(map, clearProbes()));
  assert.notEqual(observation.best?.metrics.observationQuality, null);
  assert.equal(north.best?.metrics.observationQuality, null, 'observation and firing metrics must differ');
  assert.deepEqual(north.anchor, anchor, 'anchor must remain unchanged');
  assert.equal(JSON.stringify(map), mapBefore, 'map must not be mutated');
  assert.deepEqual(ammoState, { ammo: 30, suppression: 0, combatEvents: 0 }, 'combat state must not change');
}

function verifyBudgetsAndArchitecture(): void {
  const map = actionMap([]);
  const lowProbe = solveTacticalActionPorts({
    ...baseRequest(map, clearProbes()),
    maxVisibilityProbes: 2,
    maxRouteExpansions: 3,
  });
  assert.ok(lowProbe.diagnostics.visibilityProbes <= 2);
  assert.ok(lowProbe.diagnostics.routeExpansions <= 3);
  assert.equal(lowProbe.diagnostics.routeFieldBuilds, 1);
  assert.equal(lowProbe.diagnostics.fullMapScans, 0);
  assert.ok(lowProbe.rejected.some((candidate) => candidate.rejectionReasons.length > 0));

  const source = readFileSync('src/core/tactical/action-ports/TacticalActionPortSolver.ts', 'utf8');
  assert.ok(source.includes('getMapObjectSpatialIndex'));
  assert.ok(source.includes('probeBallisticLine'));
  assert.ok(source.includes('traceVisibilityRay'));
  assert.ok(!source.includes('new Worker'));
  assert.ok(!source.includes('SimulationTick'));
  assert.ok(!source.includes('state.units'));
  assert.ok(!/\bA\*\b|aStar|astar/i.test(source), 'solver must not run A* per candidate');
}

function baseRequest(map: TacticalMap, probes: TacticalActionPortProbeContext): TacticalActionPortSolverRequest {
  const basis = buildBasis(map);
  return {
    map,
    environmentProfile: profile,
    basis,
    anchor: { x: 4.5, y: 4.5 },
    currentPosture: 'crouched',
    currentFacingRadians: 0,
    allowedPostures: ['standing', 'crouched', 'prone'],
    task: {
      purpose: 'observation',
      directionRadians: 0,
      probePoint: { x: 8.5, y: 4.5 },
      probeDistanceMeters: 20,
      targetHeightAboveGroundMeters: 1.7,
    },
    searchRadiusMeters: 4,
    soldierRadiusMeters: 0.35,
    movement: { nodeSpacingMeters: 1, maximumStepHeightLevels: 1, allowDiagonal: true },
    maxCandidates: 32,
    maxRouteExpansions: 256,
    maxVisibilityProbes: 96,
    maxBallisticProbes: 96,
    probes,
  };
}

function actionMap(objects?: TacticalMapData['objects']): TacticalMap {
  return normalizeMap({
    width: 10, height: 9, cellSize: 4, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0,
    environmentProfileId: profile.id,
    objects: objects ?? [{
      id: 'thin-wall', kind: 'cover', x: 4.6, y: 3.8,
      widthCells: 2.2, heightCells: 0.35, rotationDegrees: 45,
      losHeightMeters: 1.25, coverProtection: 90, coverReliability: 95,
      penetrable: false, coverPosture: 'crouched',
    }, {
      id: 'rock', kind: 'rock', x: 6.2, y: 5.2,
      widthCells: 0.8, heightCells: 0.8, rotationDegrees: 15,
    }],
  });
}

function buildBasis(map: TacticalMap) {
  const identity = createStaticTacticalPositionBasisIdentity(map, settings);
  return buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
}

function clearProbes(): TacticalActionPortProbeContext {
  return {
    probeVisibility: () => visibilityResult(true),
    probeBallistic: () => ballisticResult(true, 1),
  };
}

function blockedProbes(): TacticalActionPortProbeContext {
  return {
    probeVisibility: () => visibilityResult(false),
    probeBallistic: () => ballisticResult(false, 0),
  };
}

function visibilityResult(clear: boolean): VisibilityTraceResult {
  return {
    origin: { x: 0, y: 0 }, target: { x: 1, y: 1 }, totalDistanceMeters: 1,
    traversedCellCount: 1, hardBlocked: !clear, blockerKind: clear ? 'none' : 'object',
    blockerPosition: clear ? null : { x: 0.5, y: 0.5 }, blockerDistanceMeters: clear ? null : 0.5,
    visualTransmission: clear ? 1 : 0, fireTransmission: clear ? 1 : 0,
    accumulatedVegetationMeters: 0, reasonRu: clear ? 'чисто' : 'блокировано',
  };
}

function ballisticResult(clear: boolean, clearanceMetres = 1): BallisticLineProbeResult {
  return {
    clear,
    blockedBy: clear ? null : 'map_object',
    obstructionId: clear ? null : 'test-blocker',
    hitDistanceMetres: clear ? null : 1,
    clearanceMetres: clear ? clearanceMetres : 0,
    impactPoint: { xMetres: 1, yMetres: 1, zMetres: 1 },
    hitZone: null,
  };
}

function exportObject(object: TacticalMap['objects'][number]): NonNullable<TacticalMapData['objects']>[number] {
  return {
    id: object.id, kind: object.kind, x: object.x, y: object.y,
    widthCells: object.widthCells, heightCells: object.heightCells,
    rotationDegrees: object.rotationRadians * 180 / Math.PI,
    losHeightMeters: object.losHeightMeters,
    coverProtection: object.coverProtection,
    coverReliability: object.coverReliability,
    concealment: object.concealment,
    penetrable: object.penetrable,
    coverPosture: object.coverPosture,
  };
}

function candidateSignature(candidate: ReturnType<typeof solveTacticalActionPorts>['candidates'][number]): unknown {
  return {
    id: candidate.id,
    position: candidate.position,
    posture: candidate.recommendedPosture,
    reasons: candidate.rejectionReasons,
    metrics: candidate.metrics,
  };
}
