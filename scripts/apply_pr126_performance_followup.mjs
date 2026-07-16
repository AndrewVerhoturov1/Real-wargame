import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  if (!content.includes(before)) throw new Error(`Missing replacement anchor: ${label}`);
  return content.replace(before, after);
}

function patchRouteCostField() {
  const path = 'src/core/navigation/RouteCostField.ts';
  let source = read(path);
  source = replaceExact(source,
`import {
  getDirectionalTacticalField,
  type DirectionalTacticalField,
} from '../terrain/DirectionalTacticalField';
`,
`import {
  getDirectionalTacticalField,
  type DirectionalTacticalField,
} from '../terrain/DirectionalTacticalField';
import { getDirectionalTerrainSectorBasis } from '../terrain/DirectionalTerrainSectorBasis';
`, 'route basis import');

  source = replaceExact(source,
`  const knowledgeRevision = tacticalContext?.knowledgeRevision ?? 0;
  const knownThreats = tacticalContext?.knownThreats ?? [];
  const hasOrigin = Number.isFinite(tacticalContext?.originX) && Number.isFinite(tacticalContext?.originY);
  const tacticalField = hasOrigin
    ? getDirectionalTacticalField(map, {
      unitId: tacticalContext?.unitId ?? 'route',
      originX: tacticalContext?.originX ?? 0,
      originY: tacticalContext?.originY ?? 0,
      knowledgeRevision,
      threats: knownThreats,
    })
    : null;
  const dangerContext = buildSoldierDangerFieldContext(tacticalContext);
  const dangerField = dangerContext
    ? getSoldierDangerField(map, dangerContext, { directionalField: tacticalField ?? undefined })
    : null;
  const dynamicKey = [
    staticKey,
    tacticalContext?.unitId ?? 'none',
    quantizedCoordinate(tacticalContext?.originX),
    quantizedCoordinate(tacticalContext?.originY),
    knowledgeRevision,
    tacticalContext?.exposureRevision ?? 0,
    tacticalContext?.territoryRevision ?? 0,
    dangerField?.key ?? 'no-danger',
  ].join(':');
`,
`  const knowledgeRevision = tacticalContext?.knowledgeRevision ?? 0;
  const knownThreats = tacticalContext?.knownThreats ?? [];
  const hasKnownThreats = knownThreats.length > 0;
  const hasOrigin = Number.isFinite(tacticalContext?.originX) && Number.isFinite(tacticalContext?.originY);
  const needsDanger = hasKnownThreats && profile.dangerWeight > 0;
  const needsDirectionalTerrain = hasKnownThreats && hasOrigin && hasDirectionalTerrainWeights(profile);
  const usesTacticalKnowledge = needsDanger || needsDirectionalTerrain;
  const effectiveKnowledgeRevision = usesTacticalKnowledge ? knowledgeRevision : 0;
  const directionalBasis = needsDanger ? getDirectionalTerrainSectorBasis(map) : undefined;
  const tacticalField = needsDirectionalTerrain
    ? getDirectionalTacticalField(map, {
      unitId: tacticalContext?.unitId ?? 'route',
      originX: tacticalContext?.originX ?? 0,
      originY: tacticalContext?.originY ?? 0,
      knowledgeRevision,
      threats: knownThreats,
    })
    : null;
  const dangerContext = needsDanger ? buildSoldierDangerFieldContext(tacticalContext) : null;
  const dangerField = dangerContext
    ? getSoldierDangerField(map, dangerContext, { directionalBasis })
    : null;
  const dynamicKey = [
    staticKey,
    needsDirectionalTerrain ? tacticalContext?.unitId ?? 'route' : 'none',
    needsDirectionalTerrain ? quantizedCoordinate(tacticalContext?.originX) : 'none',
    needsDirectionalTerrain ? quantizedCoordinate(tacticalContext?.originY) : 'none',
    effectiveKnowledgeRevision,
    profile.exposureWeight > 0 ? tacticalContext?.exposureRevision ?? 0 : 0,
    tacticalContext?.territoryRevision ?? 0,
    dangerField?.key ?? 'no-danger',
    tacticalField?.key ?? 'no-directional',
  ].join(':');
`, 'lazy route danger block');

  source = replaceExact(source,
`    profileRevision: profile.revision,
    knowledgeRevision,
    dangerFieldKey: dynamicField.dangerFieldKey,
`,
`    profileRevision: profile.revision,
    knowledgeRevision: effectiveKnowledgeRevision,
    dangerFieldKey: dynamicField.dangerFieldKey,
`, 'route effective revision output');
  source = replaceExact(source,
`  cache.diagnostics.knowledgeRevision = knowledgeRevision;
`,
`  cache.diagnostics.knowledgeRevision = effectiveKnowledgeRevision;
`, 'route effective revision diagnostics');
  write(path, source);
}

function patchAwarenessGrid() {
  const path = 'src/core/knowledge/SoldierAwarenessGrid.ts';
  let source = read(path);
  source = replaceExact(source,
`import type { SimulationState } from '../simulation/SimulationState';
import {
  getDirectionalTacticalField,
`,
`import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTerrainSectorBasis } from '../terrain/DirectionalTerrainSectorBasis';
import {
  getDirectionalTacticalField,
`, 'awareness basis import');
  source = replaceExact(source,
`  const staticField = getAwarenessStaticField(state.map, unit.behaviorRuntime.posture);
  const directionalField = getDirectionalTacticalField(state.map, {
`,
`  const staticField = getAwarenessStaticField(state.map, unit.behaviorRuntime.posture);
  const directionalBasis = getDirectionalTerrainSectorBasis(state.map);
  const directionalField = getDirectionalTacticalField(state.map, {
`, 'awareness basis build');
  source = replaceExact(source,
`  }, { staticField, directionalField });
`,
`  }, { staticField, directionalBasis });
`, 'awareness danger dependencies');
  write(path, source);
}

function patchPerformanceMonitor() {
  const path = 'src/core/debug/PerformanceMonitor.ts';
  let source = read(path);
  source = replaceExact(source,
`import { getAwarenessStaticFieldDiagnostics } from '../knowledge/AwarenessStaticField';
`,
`import { getAwarenessStaticFieldDiagnostics } from '../knowledge/AwarenessStaticField';
import { getSoldierDangerFieldDiagnostics } from '../knowledge/SoldierDangerField';
`, 'performance danger import');
  source = replaceExact(source,
`        awarenessDynamicRescore: selectedUnit
          ? getAwarenessDynamicRescoreDiagnostics(selectedUnit)
          : null,
        awarenessMovement: getAwarenessMovementDiagnostics(),
`,
`        awarenessDynamicRescore: selectedUnit
          ? getAwarenessDynamicRescoreDiagnostics(selectedUnit)
          : null,
        soldierDangerField: getSoldierDangerFieldDiagnostics(state.map),
        awarenessMovement: {
          ...getAwarenessMovementDiagnostics(),
          mainThreadSoldierDangerField: getSoldierDangerFieldDiagnostics(state.map),
        },
`, 'performance danger telemetry');
  write(path, source);
}

function patchVisualHarness() {
  const path = 'src/testing/CombatTacticalIntegrationVisualQaHarness.ts';
  let source = read(path);
  source = replaceExact(source,
`import { fullMapRegion, getMapRevisionSnapshot, markMapCellsDirty, markMapObjectsDirty } from '../core/map/MapRuntimeState';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
`,
`import { fullMapRegion, getMapRevisionSnapshot, markMapCellsDirty, markMapObjectsDirty } from '../core/map/MapRuntimeState';
import { buildUnitTacticalRouteContext } from '../core/navigation/NavigationRuntime';
import { createRouteCostFieldCache, getRouteCostFields } from '../core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../core/navigation/NavigationProfiles';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import { findGridPath } from '../core/pathfinding/GridPathfinder';
`, 'harness route imports');
  source = replaceExact(source,
`import type { UnitModel } from '../core/units/UnitModel';
`,
`import type { KnownThreatMemory, UnitModel } from '../core/units/UnitModel';
`, 'harness threat type');
  source = replaceExact(source,
`  getRealReliefOverlayState,
`,
`  getRealReliefOverlayState,
  getSimulationLayerState,
`, 'harness layer getter');
  source = replaceExact(source,
`  | 'slice1-detected-shooter-alias';
`,
`  | 'slice1-detected-shooter-alias'
  | 'danger-route-cost-parity';
`, 'harness scenario union');
  source = replaceExact(source,
`  readonly routeWaypointCount: number;
  readonly mapVisualRevision: number;
}
`,
`  readonly routeWaypointCount: number;
  readonly mapVisualRevision: number;
  readonly dangerFieldKey?: string;
  readonly parity?: DangerParitySnapshot;
}

export type DangerParityPhase = 'single-rifle' | 'two-rifles' | 'rifle-and-machine-gun' | 'overlay-hidden-route';

export interface DangerParitySnapshot {
  readonly phase: DangerParityPhase;
  readonly overlayMode: string;
  readonly threatCount: number;
  readonly exposedCell: { x: number; y: number; danger: number; expectedProtectionAgainstThreat: number };
  readonly protectedCell: { x: number; y: number; danger: number; expectedProtectionAgainstThreat: number };
  readonly awarenessDangerFieldKey: string;
  readonly routeDangerFieldKey: string;
  readonly routeDangerAvailable: boolean;
  readonly routeCells: readonly { x: number; y: number }[];
  readonly orderWaypointCount: number;
}
`, 'harness parity snapshot');
  source = replaceExact(source,
`  setScenario(scenario: CombatTacticalVisualScenario): CombatTacticalVisualSnapshot;
  getSnapshot(): CombatTacticalVisualSnapshot | null;
  stepDangerPerformanceDynamicUpdate(step: number): void;
`,
`  setScenario(scenario: CombatTacticalVisualScenario): CombatTacticalVisualSnapshot;
  getSnapshot(): CombatTacticalVisualSnapshot | null;
  setDangerParityPhase(phase: DangerParityPhase): CombatTacticalVisualSnapshot;
  stepDangerPerformanceDynamicUpdate(step: number): void;
  stepDangerPerformanceGeometryUpdate(step: number): void;
`, 'harness API methods');
  source = replaceExact(source,
`const VISUAL_OBJECT_PREFIX = 'combat-tactical-visual-';
`,
`const VISUAL_OBJECT_PREFIX = 'combat-tactical-visual-';
const dangerParityRouteCache = createRouteCostFieldCache();
let activeDangerParityPhase: DangerParityPhase = 'single-rifle';
`, 'harness parity globals');
  source = replaceExact(source,
`      if (scenario === 'wall-cover' || scenario === 'slice1-wall-evidence-attenuation') {
`,
`      if (scenario === 'wall-cover' || scenario === 'slice1-wall-evidence-attenuation' || scenario === 'danger-route-cost-parity') {
`, 'harness parity wall');
  source = replaceExact(source,
`      } else if (scenario === 'slice1-detected-shooter-alias') {
        installDetectedShooterAliasEvidence(state, observer, shooter);
        memorySynced = true;
      } else {
        fireNearObserver(state, observer, shooter, scenario);
      }
`,
`      } else if (scenario === 'slice1-detected-shooter-alias') {
        installDetectedShooterAliasEvidence(state, observer, shooter);
        memorySynced = true;
      } else if (scenario === 'danger-route-cost-parity') {
        activeDangerParityPhase = 'single-rifle';
        installDangerParityThreats(observer, shooter, activeDangerParityPhase);
        memorySynced = true;
      } else {
        fireNearObserver(state, observer, shooter, scenario);
      }
`, 'harness parity setup');
  source = replaceExact(source,
`      observer.playerNavigationProfileId = 'retreat';
`,
`      observer.playerNavigationProfileId = scenario === 'danger-route-cost-parity' ? 'cautious' : 'retreat';
`, 'harness parity profile');
  source = replaceExact(source,
`    stepDangerPerformanceDynamicUpdate(step): void {
`,
`    setDangerParityPhase(phase): CombatTacticalVisualSnapshot {
      if (activeScenario !== 'danger-route-cost-parity') throw new Error('Danger parity phase requires the danger-route-cost-parity scenario.');
      const [observer, shooter] = resolveFixtureUnits(state);
      activeDangerParityPhase = phase;
      installDangerParityThreats(observer, shooter, phase);
      setSimulationLayerMode(state, phase === 'overlay-hidden-route' ? 'info' : 'danger');
      observer.playerNavigationProfileId = 'cautious';
      state.selectedUnitId = observer.id;
      state.selectedUnitIds = [observer.id];
      issueRoutedMoveOrderToSelectedUnits(state, parityRouteTarget(state, observer));
      const report = buildSoldierAwarenessReport(state, observer);
      onChanged();
      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
      return buildSnapshot(state, observer, shooter, activeScenario, report);
    },
    stepDangerPerformanceDynamicUpdate(step): void {
`, 'harness phase method');
  source = replaceExact(source,
`      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
    },
  };
}
`,
`      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
    },
    stepDangerPerformanceGeometryUpdate(step): void {
      if (!activeScenario) throw new Error('Set a combat tactical visual scenario before geometry updates.');
      const observer = state.units.find((unit) => unit.id === state.selectedUnitId) ?? state.units[0];
      if (!observer || observer.tacticalKnowledge.threats.length === 0) throw new Error('Danger geometry update requires known threats.');
      const moving = observer.tacticalKnowledge.threats[Math.abs(Math.floor(step)) % observer.tacticalKnowledge.threats.length];
      moving.x = clamp(moving.x + 0.35, 0.5, state.map.width - 0.5);
      observer.tacticalKnowledge.revision += 1;
      window.dispatchEvent(new CustomEvent('real-wargame:combat-tactical-visual-qa-updated'));
    },
  };
}
`, 'harness geometry update');
  source = replaceExact(source,
`function fireNearObserver(
`,
`function installDangerParityThreats(
  observer: UnitModel,
  shooter: UnitModel,
  phase: DangerParityPhase,
): void {
  const primary = dangerParityThreat('unit:visual-parity-rifle-primary', shooter, 78, 92, 'rifle_fire', 34);
  const weaker = dangerParityThreat('unit:visual-parity-rifle-weaker', shooter, 42, 88, 'rifle_fire', 22);
  const machineGun = dangerParityThreat('unit:visual-parity-machine-gun', shooter, 66, 86, 'machine_gun_fire', 58);
  observer.tacticalKnowledge.threats = phase === 'single-rifle'
    ? [primary]
    : phase === 'two-rifles'
      ? [primary, weaker]
      : [primary, weaker, machineGun];
  observer.tacticalKnowledge.revision += 1;
}

function dangerParityThreat(
  id: string,
  shooter: UnitModel,
  strength: number,
  confidence: number,
  fireThreatClass: 'rifle_fire' | 'machine_gun_fire',
  suppression: number,
): KnownThreatMemory {
  return {
    id,
    labelRu: id,
    mode: 'directional_fire',
    x: shooter.position.x,
    y: shooter.position.y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength,
    suppression,
    stressPerSecond: 4,
    directionDegrees: 180,
    arcDegrees: 150,
    rangeCells: 80,
    minRangeCells: 0,
    falloffPercent: 20,
    confidence,
    uncertaintyCells: 0,
    source: 'seen',
    visibleNow: true,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
    fireThreatClass,
  } as KnownThreatMemory;
}

function parityRouteTarget(state: SimulationState, observer: UnitModel) {
  return {
    x: clamp(observer.position.x + state.map.width * 0.42, 0.5, state.map.width - 0.5),
    y: observer.position.y,
  };
}

function fireNearObserver(
`, 'harness parity helpers');
  source = replaceExact(source,
`    | 'slice1-repeated-unknown-fire-merged'
    | 'slice1-detected-shooter-alias'>,
`,
`    | 'slice1-repeated-unknown-fire-merged'
    | 'slice1-detected-shooter-alias'
    | 'danger-route-cost-parity'>,
`, 'harness fire exclusion');
  source = replaceExact(source,
`function buildSnapshot(
`,
`function buildDangerParitySnapshot(
  state: SimulationState,
  observer: UnitModel,
  report: ReturnType<typeof buildSoldierAwarenessReport>,
): DangerParitySnapshot {
  const wall = state.map.objects.find((object) => object.id === \`${VISUAL_OBJECT_PREFIX}wall\`);
  if (!wall) throw new Error('Danger parity wall fixture is missing.');
  const y = Math.max(0, Math.min(state.map.height - 1, Math.floor(observer.position.y)));
  const protectedX = Math.max(0, Math.floor(wall.x) - 1);
  const exposedX = Math.min(state.map.width - 1, Math.ceil(wall.x + wall.widthCells) + 1);
  const protectedCell = report.cells[y * state.map.width + protectedX];
  const exposedCell = report.cells[y * state.map.width + exposedX];
  if (!protectedCell || !exposedCell) throw new Error('Danger parity awareness cells are unavailable.');
  const profile = getBuiltInNavigationProfile('cautious');
  const context = buildUnitTacticalRouteContext(observer);
  const routeFields = getRouteCostFields(state.map, profile, context, dangerParityRouteCache);
  const route = findGridPath(state.map, observer.position, parityRouteTarget(state, observer), {
    navigationProfile: profile,
    tacticalContext: context,
    costFieldCache: dangerParityRouteCache,
  });
  if (!route.ok) throw new Error(route.reason);
  const reportRecord = report as unknown as { dangerFieldKey?: string };
  const fieldsRecord = routeFields as unknown as { dangerFieldKey?: string };
  return {
    phase: activeDangerParityPhase,
    overlayMode: getSimulationLayerState(state).mode,
    threatCount: observer.tacticalKnowledge.threats.length,
    exposedCell: {
      x: exposedX,
      y,
      danger: exposedCell.danger,
      expectedProtectionAgainstThreat: exposedCell.expectedProtectionAgainstThreat,
    },
    protectedCell: {
      x: protectedX,
      y,
      danger: protectedCell.danger,
      expectedProtectionAgainstThreat: protectedCell.expectedProtectionAgainstThreat,
    },
    awarenessDangerFieldKey: reportRecord.dangerFieldKey ?? '',
    routeDangerFieldKey: fieldsRecord.dangerFieldKey ?? '',
    routeDangerAvailable: routeFields.availability.danger,
    routeCells: route.cells.map((cell) => ({ x: cell.x, y: cell.y })),
    orderWaypointCount: observer.order?.waypoints?.length ?? 0,
  };
}

function buildSnapshot(
`, 'harness parity snapshot builder');
  source = replaceExact(source,
`  return {
    scenario,
`,
`  const reportRecord = report as unknown as { dangerFieldKey?: string };
  const parity = scenario === 'danger-route-cost-parity'
    ? buildDangerParitySnapshot(state, observer, report)
    : undefined;
  return {
    scenario,
`, 'harness snapshot prelude');
  source = replaceExact(source,
`    routeWaypointCount: observer.order?.waypoints?.length ?? 0,
    mapVisualRevision: getMapRevisionSnapshot(state.map).visual,
  };
`,
`    routeWaypointCount: observer.order?.waypoints?.length ?? 0,
    mapVisualRevision: getMapRevisionSnapshot(state.map).visual,
    dangerFieldKey: reportRecord.dangerFieldKey,
    parity,
  };
`, 'harness snapshot parity fields');
  write(path, source);
}

function patchBrowserWorkflow() {
  const path = '.github/workflows/danger-layer-browser-performance.yml';
  let source = read(path);
  source = source.replace(`          cp source/src/core/debug/PerformanceMonitor.ts baseline/src/core/debug/PerformanceMonitor.ts\n`, '');
  source = replaceExact(source,
`      - name: Compare browser performance acceptance
        shell: bash
        run: |
          set +e
          node source/scripts/compare_danger_layer_browser_performance.mjs \\
            browser-artifacts/before.json \\
            browser-artifacts/after.json \\
            browser-artifacts/comparison.json
          first_status=$?
          set -e
          if [ "$first_status" = "0" ]; then
            exit 0
          fi

          echo "First strict comparison failed; repeating the exact candidate measurement once to reject hosted-runner jitter without changing any threshold."
          (
            cd candidate
            REAL_WARGAME_BRANCH='\${{ github.event.pull_request.head.ref }}' \\
            REAL_WARGAME_COMMIT_SHA='\${{ github.event.pull_request.head.sha }}' \\
            DANGER_PERF_EXPECTED_BRANCH='\${{ github.event.pull_request.head.ref }}' \\
            DANGER_PERF_EXPECTED_SHA='\${{ github.event.pull_request.head.sha }}' \\
            DANGER_PERF_LABEL='after-head-retry' \\
            DANGER_PERF_OUTPUT='../browser-artifacts/after-retry.json' \\
            npx playwright test tests/danger-layer-browser-performance.spec.ts \\
              --config=playwright.performance.config.ts \\
              --project=chromium \\
              --reporter=line 2>&1 | tee ../browser-artifacts/after-retry-playwright.log
          )
          node source/scripts/compare_danger_layer_browser_performance.mjs \\
            browser-artifacts/before.json \\
            browser-artifacts/after-retry.json \\
            browser-artifacts/comparison-retry.json
          cp browser-artifacts/after-retry.json browser-artifacts/after.json
          cp browser-artifacts/comparison-retry.json browser-artifacts/comparison.json
`,
`      - name: Compare browser performance acceptance
        shell: bash
        run: node source/scripts/compare_danger_layer_browser_performance.mjs browser-artifacts/before.json browser-artifacts/after.json browser-artifacts/comparison.json
`, 'symmetric browser comparison');
  write(path, source);
}

function patchDocs() {
  const path = 'docs/subprojects/ai-single-unit-editor/TACTICAL_ROUTE_COST_V1.md';
  let source = read(path);
  source = replaceExact(source,
`\`SoldierDangerField\` is the renderer-independent source of per-cell danger semantics for machine consumers. It is built from the observing soldier's subjective \`UnitTacticalKnowledge.threats\` and reuses the existing static awareness, \`ThreatRelativeCoverField\`, and \`DirectionalTacticalField\` caches.
`,
`\`SoldierDangerField\` is the renderer-independent source of per-cell danger semantics for machine consumers. It is built from the observing soldier's subjective \`UnitTacticalKnowledge.threats\` and reuses the existing static awareness, \`ThreatRelativeCoverField\`, and static \`DirectionalTerrainSectorBasis\` caches. Weighted \`DirectionalTacticalField\` output is not part of the danger geometry key.
`, 'docs basis contract');
  source = replaceExact(source,
`Danger computation has two bounded layers:

\`\`\`text
geometry cache
  positions, sectors, range/falloff, uncertainty geometry,
  cover and directional terrain relationships

scored field cache
  strength, suppression, confidence and fire class
\`\`\`

Changing only profile does not rebuild either danger layer. Changing fire class or confidence invalidates the scored field. For a stable single-source geometry it reuses the geometry arrays. Static map geometry changes invalidate through existing map/static-field revision keys.
`,
`Danger computation has two bounded layers:

\`\`\`text
per-threat geometry cache (maximum 24 entries)
  threat identity, position, shape, direction, range/falloff and uncertainty,
  posture, static map geometry and directional-sector-basis revision

scored field cache (maximum 12 entries)
  canonical threat order plus strength, suppression, confidence and fire class
\`\`\`

Changing profile, strength, suppression, confidence, fire class, or array order does not rebuild threat geometry. Scored content changes create or reuse a scored field; a pure reorder reuses the same field key. Moving one threat rebuilds only that threat geometry. Diagnostics publish cached threat geometries, scored fields, map scans, cache hits, and retained typed-array bytes.

A profile with \`dangerWeight = 0\` and all directional-terrain weights equal to zero does not request \`SoldierDangerField\` or \`DirectionalTacticalField\`. Its route key ignores tactical-knowledge revisions that cannot affect cost.
`, 'docs per-threat cache contract');
  source = replaceExact(source,
`- Threat-relative cover and directional terrain fields are reused.
`,
`- Threat-relative cover and the static directional sector basis are reused.
- Non-tactical profiles skip danger and weighted directional-field construction entirely.
`, 'docs performance bullets');
  write(path, source);
}

patchRouteCostField();
patchAwarenessGrid();
patchPerformanceMonitor();
patchVisualHarness();
patchBrowserWorkflow();
patchDocs();
fs.rmSync('scripts/apply_pr126_performance_followup.mjs');
fs.rmSync('.github/workflows/apply-pr126-performance-followup.yml');
