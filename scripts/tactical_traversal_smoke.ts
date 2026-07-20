import type { UnitPosture } from '../src/core/behavior/BehaviorModel';
import type { GridPosition } from '../src/core/geometry';
import { getBuiltInMovementProfile } from '../src/core/movement/MovementProfileDefaults';
import type { TacticalTraversalFieldView } from '../src/core/navigation/TacticalTraversalFieldView';
import { resolveTacticalTraversalFacing } from '../src/core/navigation/TacticalTraversalFacing';
import { planTacticalTraversal, type TacticalTraversalPlannerInput } from '../src/core/navigation/TacticalTraversalPlanner';
import { createDefaultTacticalTraversalProfile } from '../src/core/navigation/TacticalTraversalProfile';
import { createDefaultTacticalPositionSettings } from '../src/core/tactical/TacticalPositionSettings';
import { evaluateTacticalPostures } from '../src/core/tactical/TacticalPostureEvaluation';

const assert = {
  equal(left: unknown, right: unknown, label: string): void {
    if (left !== right) throw new Error(`${label}: expected ${String(right)}, got ${String(left)}`);
  },
  ok(value: unknown, label: string): void {
    if (!value) throw new Error(label);
  },
  deepEqual(left: unknown, right: unknown, label: string): void {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a !== b) throw new Error(`${label}\nleft=${a}\nright=${b}`);
  },
};

function route(length: number): GridPosition[] {
  return Array.from({ length }, (_, x) => ({ x, y: 0 }));
}

function field(length: number): TacticalTraversalFieldView {
  return {
    width: length,
    height: 1,
    metersPerCell: 2,
    passable: new Uint8Array(length).fill(1),
    movementCost: new Float32Array(length).fill(1),
    danger: new Uint8Array(length),
    suppression: new Uint8Array(length),
    concealment: new Uint8Array(length),
    safety: new Uint8Array(length).fill(75),
    expectedProtectionAgainstThreat: new Uint8Array(length),
    uncertainty: new Uint8Array(length),
    reverseSlopeQuality: new Uint8Array(length),
    forwardSlopeRisk: new Uint8Array(length),
    staticProtectionByPosture: {
      standing: new Uint8Array(length),
      crouched: new Uint8Array(length),
      prone: new Uint8Array(length),
    },
    protectedThreatIndex: new Int16Array(length).fill(-1),
    threatIds: [],
  };
}

function plan(
  overrides: Partial<TacticalTraversalPlannerInput>
    & Pick<TacticalTraversalPlannerInput, 'routeCells' | 'field'>,
) {
  return planTacticalTraversal({
    routeRevision: 3,
    commandId: 'unit:command:1',
    commandRevision: 1,
    worldKey: 'world',
    fieldIdentity: 'field',
    knowledgeRevision: 5,
    tacticalPositionSettingsRevision: 2,
    movementProfileRevision: 8,
    intentVersion: 1,
    currentPosture: 'standing',
    referenceThreat: null,
    intentPresetId: 'move',
    baseMovementProfileId: 'normal_walk',
    profile: createDefaultTacticalTraversalProfile(),
    postureSettings: createDefaultTacticalPositionSettings(),
    ...overrides,
  });
}

function containsPosture(result: ReturnType<typeof plan>, posture: UnitPosture): boolean {
  return result.segments.some((segment) => segment.posture === posture);
}

{
  const cells = route(10);
  const result = plan({ routeCells: cells, field: field(cells.length) });
  assert.equal(result.segments.length, 1, 'safe route should remain one segment');
  assert.equal(result.segments[0]?.movementProfileId, 'normal_walk', 'safe route should use base profile');
  assert.equal(result.segments[0]?.posture, 'standing', 'safe route should stay standing');
}

{
  const cells = route(10);
  const view = field(cells.length);
  for (let index = 3; index <= 6; index += 1) {
    view.danger[index] = 55;
    view.safety[index] = 35;
    view.staticProtectionByPosture.crouched[index] = 62;
    view.staticProtectionByPosture.prone[index] = 72;
  }
  const result = plan({ routeCells: cells, field: view });
  assert.ok(containsPosture(result, 'crouched'), 'low cover should create a crouched segment');
  assert.ok(result.segments.some((segment) => segment.movementProfileId === 'crouched_move'), 'low cover should use crouched movement');
}

{
  const cells = route(5);
  const view = field(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    view.danger[index] = 68;
    view.safety[index] = 26;
    view.forwardSlopeRisk[index] = 35;
  }
  const result = plan({ routeCells: cells, field: view });
  assert.ok(result.segments.some((segment) => segment.movementProfileId === 'run' || segment.movementProfileId === 'sprint'), 'short open crossing should permit a fast segment');
}

{
  const cells = route(14);
  const view = field(cells.length);
  for (let index = 5; index <= 12; index += 1) {
    view.danger[index] = 92;
    view.suppression[index] = 75;
    view.safety[index] = 10;
    view.staticProtectionByPosture.prone[index] = 40;
  }
  const result = plan({ routeCells: cells, field: view });
  assert.ok(containsPosture(result, 'prone'), 'critical exposure should include prone');
  assert.ok(result.segments.some((segment) => segment.movementProfileId === 'crawl'), 'critical exposure should include crawl');
}

{
  const cells = route(10);
  const view = field(cells.length);
  for (let index = 2; index <= 8; index += 1) {
    view.danger[index] = 98;
    view.suppression[index] = 90;
    view.safety[index] = 4;
  }
  const result = plan({
    routeCells: cells,
    field: view,
    intentPresetId: 'assault',
    baseMovementProfileId: 'run',
  });
  const critical = result.segments.filter((segment) => (
    segment.startRouteCellIndex <= 8 && segment.endRouteCellIndex >= 2
  ));
  assert.ok(critical.every((segment) => segment.posture !== 'standing'), 'assault must respect critical standing prohibition');
}

{
  const cells = route(14);
  const view = field(cells.length);
  for (let index = 2; index <= 6; index += 1) {
    view.danger[index] = 94;
    view.suppression[index] = 72;
    view.safety[index] = 8;
  }
  for (let index = 8; index <= 13; index += 1) {
    view.danger[index] = 18;
    view.safety[index] = 82;
    view.reverseSlopeQuality[index] = 85;
  }
  const result = plan({ routeCells: cells, field: view });
  assert.ok(result.segments.some((segment) => segment.posture === 'prone'), 'crest approach should lower posture');
  assert.equal(result.segments.at(-1)?.posture, 'standing', 'reverse slope should allow standing again');
}

{
  const cells = route(30);
  const view = field(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    view.danger[index] = index % 2 === 0 ? 33 : 36;
    view.safety[index] = index % 2 === 0 ? 65 : 62;
  }
  const result = plan({ routeCells: cells, field: view });
  assert.ok(result.segments.length <= 2, 'minor oscillations should not create repeated switches');
}

{
  const cells = route(48);
  const view = field(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const band = Math.floor(index / 3) % 3;
    if (band === 1) {
      view.danger[index] = 58;
      view.safety[index] = 30;
      view.staticProtectionByPosture.crouched[index] = 65;
    } else if (band === 2) {
      view.danger[index] = 95;
      view.suppression[index] = 80;
      view.safety[index] = 8;
    }
  }
  const result = plan({
    routeCells: cells,
    field: view,
    profile: { ...createDefaultTacticalTraversalProfile(), maximumSegments: 4 },
  });
  assert.ok(result.segments.length <= 4, 'segment cap must be enforced');
  for (let index = 1; index < result.segments.length; index += 1) {
    const previous = result.segments[index - 1]!;
    const current = result.segments[index]!;
    assert.ok(previous.movementProfileId !== current.movementProfileId || previous.posture !== current.posture, 'adjacent equal segments must be merged');
  }
}

{
  const cells = route(12);
  const view = field(cells.length);
  for (let index = 5; index <= 10; index += 1) {
    view.danger[index] = 90;
    view.suppression[index] = 70;
    view.safety[index] = 12;
  }
  assert.deepEqual(
    plan({ routeCells: cells, field: view }),
    plan({ routeCells: cells, field: view }),
    'same inputs must produce identical plan',
  );
}

{
  const evaluation = evaluateTacticalPostures({
    danger: 70,
    protection: 10,
    safety: 35,
    staticProtectionByPosture: { standing: 0, crouched: 60, prone: 75 },
  }, 'standing', createDefaultTacticalPositionSettings());
  assert.equal(evaluation.evaluations.length, 3, 'all postures must be evaluated once');
  assert.ok(evaluation.reasonCodes.some((reason) => reason.startsWith('recommended_posture:')), 'posture choice must be explainable');
}

{
  const profile = createDefaultTacticalTraversalProfile();
  const threat = { id: 'known-right', position: { x: 2, y: 10 } };
  const walk = resolveTacticalTraversalFacing({
    from: { x: 2, y: 2 },
    to: { x: 10, y: 2 },
    movementProfile: getBuiltInMovementProfile('normal_walk'),
    intentPresetId: 'move',
    referenceThreat: threat,
    profile,
  });
  assert.equal(walk.bodyFacingPolicy, 'threat_biased', 'walk may bias body toward known threat');
  assert.equal(walk.attentionPolicy, 'blended', 'normal movement should blend route and known threat');
  assert.ok(walk.attentionCenterRadians > 0, 'right-side threat should pull attention right');

  const run = resolveTacticalTraversalFacing({
    from: { x: 2, y: 2 },
    to: { x: 10, y: 2 },
    movementProfile: getBuiltInMovementProfile('run'),
    intentPresetId: 'assault',
    referenceThreat: threat,
    profile,
  });
  assert.equal(run.bodyFacingPolicy, 'route_heading', 'run body must remain on route heading');
  assert.equal(run.bodyFacingRadians, 0, 'run body heading should remain physical route heading');
  assert.equal(run.attentionPolicy, 'reference_threat', 'assault attention should hold known threat');

  const unknown = resolveTacticalTraversalFacing({
    from: { x: 2, y: 2 },
    to: { x: 10, y: 2 },
    movementProfile: getBuiltInMovementProfile('normal_walk'),
    intentPresetId: 'move',
    referenceThreat: null,
    profile,
  });
  assert.equal(unknown.bodyFacingPolicy, 'route_heading', 'unknown threat must not affect body');
  assert.equal(unknown.attentionPolicy, 'route_heading', 'unknown threat must not affect attention');
}

console.log('tactical traversal smoke: ok');
