import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'prod';

function replaceExact(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`Expected source fragment not found in ${path}: ${before.slice(0, 120)}`);
  }
  writeFileSync(path, source.replace(before, after));
}

function appendBefore(path, marker, content) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(marker)) throw new Error(`Marker not found in ${path}: ${marker}`);
  writeFileSync(path, source.replace(marker, `${content}\n${marker}`));
}

if (mode === 'tests') {
  replaceExact(
    'scripts/tactical_position_tuning_smoke.mjs',
    `function verifyHighestSafePosture(): void {\n  const settings = createDefaultTacticalPositionSettings();\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 18, safety: 72, protection: 20 },\n    { posture: 'crouched', danger: 10, safety: 80, protection: 36 },\n    { posture: 'prone', danger: 4, safety: 90, protection: 52 },\n  ], settings).posture, 'standing');\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 42, safety: 52, protection: 20 },\n    { posture: 'crouched', danger: 28, safety: 66, protection: 42 },\n    { posture: 'prone', danger: 12, safety: 82, protection: 64 },\n  ], settings).posture, 'crouched');\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 76, safety: 20, protection: 8 },\n    { posture: 'crouched', danger: 61, safety: 34, protection: 24 },\n    { posture: 'prone', danger: 34, safety: 58, protection: 48 },\n  ], settings).posture, 'prone');\n}`,
    `function verifyHighestSafePosture(): void {\n  const settings = createDefaultTacticalPositionSettings();\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 18, safety: 72, protection: 20 },\n    { posture: 'crouched', danger: 15, safety: 75, protection: 28 },\n    { posture: 'prone', danger: 12, safety: 79, protection: 36 },\n  ], settings).posture, 'standing', 'small safety gains must not force a lower posture');\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 24, safety: 62, protection: 20 },\n    { posture: 'crouched', danger: 15, safety: 72, protection: 42 },\n    { posture: 'prone', danger: 12, safety: 76, protection: 52 },\n  ], settings).posture, 'crouched', 'meaningful crouched advantage must beat standing');\n  assert.equal(selectHighestSafePosture([\n    { posture: 'standing', danger: 24, safety: 62, protection: 20 },\n    { posture: 'crouched', danger: 15, safety: 72, protection: 42 },\n    { posture: 'prone', danger: 5, safety: 84, protection: 68 },\n  ], settings).posture, 'prone', 'meaningful prone advantage must beat crouched');\n}`,
  );

  replaceExact(
    'scripts/tactical_position_search_smoke.ts',
    `verifyConfiguredThresholdCanForceProne();\nverifyDeterministicBudgetsBoundRouteWork();`,
    `verifyConfiguredThresholdCanForceProne();\nverifyObjectivesPublishDistanceMetricsAndRankDirection();\nverifyDeterministicBudgetsBoundRouteWork();`,
  );
  appendBefore(
    'scripts/tactical_position_search_smoke.ts',
    `function verifyDeterministicBudgetsBoundRouteWork(): void {`,
    `function verifyObjectivesPublishDistanceMetricsAndRankDirection(): void {\n  const field = createField(16, 9);\n  setArea(field, 6, 2, 13, 6, { danger: 12, safety: 88, protection: 75, concealment: 42 });\n  const common = {\n    origin: { x: 2.5, y: 4.5 },\n    currentPosture: 'standing' as const,\n    orderTarget: { x: 13.5, y: 4.5 },\n    referenceThreatId: 'threat-1',\n    referenceThreatPosition: { x: 15.5, y: 4.5 },\n    threatCount: 1,\n    searchRadiusMeters: 30,\n    maxSampledCells: 260,\n    maxRouteExpansions: 260,\n    maxCandidates: 8,\n    minimumSeparationMeters: 2,\n  };\n  const advance = searchTacticalPositions(field, { ...common, objective: 'advance_to_threat' });\n  const withdraw = searchTacticalPositions(field, { ...common, objective: 'withdraw_from_threat' });\n  const continueOrder = searchTacticalPositions(field, { ...common, objective: 'continue_order' });\n  assert.ok(advance.candidates.length > 0 && withdraw.candidates.length > 0 && continueOrder.candidates.length > 0);\n  assert.ok((advance.candidates[0]!.metrics.threatDistanceDeltaMeters ?? 0) < 0, 'advance must prefer a position closer to the threat');\n  assert.ok((withdraw.candidates[0]!.metrics.threatDistanceDeltaMeters ?? 0) > (advance.candidates[0]!.metrics.threatDistanceDeltaMeters ?? 0), 'withdraw must rank a farther position above the advance winner');\n  assert.ok((continueOrder.candidates[0]!.metrics.distanceToOrderTargetMeters ?? 999) <= (continueOrder.candidates.at(-1)!.metrics.distanceToOrderTargetMeters ?? 999));\n  assert.equal(advance.candidates[0]!.metrics.referenceThreatId, 'threat-1');\n  assert.equal(typeof advance.candidates[0]!.metrics.distanceToThreatMeters, 'number');\n  assert.equal(typeof advance.candidates[0]!.metrics.objectiveAlignment, 'number');\n}\n`,
  );

  replaceExact(
    'scripts/tactical_query_system_smoke.ts',
    `verifyChangingWeightsChangesWinner();\nverifyCandidateBudgetStopsTheQuery();`,
    `verifyChangingWeightsChangesWinner();\nverifyObjectiveIsForwardedAndWinnerMetricsAreWritten();\nverifyCandidateBudgetStopsTheQuery();`,
  );
  appendBefore(
    'scripts/tactical_query_system_smoke.ts',
    `function verifyCandidateBudgetStopsTheQuery(): void {`,
    `function verifyObjectiveIsForwardedAndWinnerMetricsAreWritten(): void {\n  let receivedRequest: TacticalQueryGenerationRequest | undefined;\n  const host: AiGraphTacticalHost = {\n    generateCoverCandidates: (request) => {\n      receivedRequest = request;\n      return { candidates: [candidate('objective', 4, 0, {\n        objectiveAlignment: 92,\n        distanceToThreatMeters: 18,\n        threatDistanceDeltaMeters: -7,\n        distanceToOrderTargetMeters: 3,\n      })], elapsedMs: 1 };\n    },\n  };\n  const result = runAiGraph(runInput(graphWithPipeline({ objective: 'advance_to_threat', objectiveAlignmentWeight: 1 }), host));\n  assert.equal(receivedRequest?.objective, 'advance_to_threat');\n  assert.equal(result.blackboard.best_cover_position_distance_to_threat_meters, 18);\n  assert.equal(result.blackboard.best_cover_position_threat_distance_delta_meters, -7);\n  assert.equal(result.blackboard.best_cover_position_distance_to_order_target_meters, 3);\n}\n`,
  );
  replaceExact(
    'scripts/tactical_query_system_smoke.ts',
    `  readonly orderAlignmentWeight?: number;\n}`,
    `  readonly orderAlignmentWeight?: number;\n  readonly objectiveAlignmentWeight?: number;\n  readonly objective?: 'balanced' | 'advance_to_threat' | 'withdraw_from_threat' | 'continue_order';\n}`,
  );
  replaceExact(
    'scripts/tactical_query_system_smoke.ts',
    `          maxCalculationMs: 12,\n        },`,
    `          maxCalculationMs: 12,\n          objective: overrides.objective ?? 'balanced',\n        },`,
  );
  replaceExact(
    'scripts/tactical_query_system_smoke.ts',
    `          orderAlignmentWeight: overrides.orderAlignmentWeight ?? 0.35,\n        },`,
    `          orderAlignmentWeight: overrides.orderAlignmentWeight ?? 0.35,\n          objectiveAlignmentWeight: overrides.objectiveAlignmentWeight ?? 0.35,\n        },`,
  );

  console.log('Applied tactical core v2 tests.');
  process.exit(0);
}

replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `export interface TacticalPositionSettings {\n  standingMaximumDanger: number;`,
  `export type TacticalPositionSearchObjective =\n  | 'balanced'\n  | 'advance_to_threat'\n  | 'withdraw_from_threat'\n  | 'continue_order';\n\nexport interface TacticalPositionSettings {\n  standingMaximumDanger: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `  crouchedTransitionPenalty: number;\n  proneTransitionPenalty: number;`,
  `  crouchedTransitionPenalty: number;\n  proneTransitionPenalty: number;\n  crouchedSafetyAdvantageThreshold: number;\n  proneSafetyAdvantageThreshold: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `  routeSafetyWeight: number;\n  orderAlignmentWeight: number;`,
  `  routeSafetyWeight: number;\n  orderAlignmentWeight: number;\n  advanceToThreatWeight: number;\n  withdrawFromThreatWeight: number;\n  orderTargetDistanceWeight: number;\n  objectiveAlignmentWeight: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `    crouchedTransitionPenalty: 2,\n    proneTransitionPenalty: 4,`,
  `    crouchedTransitionPenalty: 2,\n    proneTransitionPenalty: 4,\n    crouchedSafetyAdvantageThreshold: 6,\n    proneSafetyAdvantageThreshold: 8,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `    routeSafetyWeight: 0.08,\n    orderAlignmentWeight: 0.04,`,
  `    routeSafetyWeight: 0.08,\n    orderAlignmentWeight: 0.04,\n    advanceToThreatWeight: 0.35,\n    withdrawFromThreatWeight: 0.35,\n    orderTargetDistanceWeight: 0.45,\n    objectiveAlignmentWeight: 0.4,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `    crouchedTransitionPenalty: bounded(source.crouchedTransitionPenalty, defaults.crouchedTransitionPenalty, 0, 50),\n    proneTransitionPenalty: bounded(source.proneTransitionPenalty, defaults.proneTransitionPenalty, 0, 50),`,
  `    crouchedTransitionPenalty: bounded(source.crouchedTransitionPenalty, defaults.crouchedTransitionPenalty, 0, 50),\n    proneTransitionPenalty: bounded(source.proneTransitionPenalty, defaults.proneTransitionPenalty, 0, 50),\n    crouchedSafetyAdvantageThreshold: bounded(source.crouchedSafetyAdvantageThreshold, defaults.crouchedSafetyAdvantageThreshold, 0, 100),\n    proneSafetyAdvantageThreshold: bounded(source.proneSafetyAdvantageThreshold, defaults.proneSafetyAdvantageThreshold, 0, 100),`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `    routeSafetyWeight: weight(source.routeSafetyWeight, defaults.routeSafetyWeight),\n    orderAlignmentWeight: weight(source.orderAlignmentWeight, defaults.orderAlignmentWeight),`,
  `    routeSafetyWeight: weight(source.routeSafetyWeight, defaults.routeSafetyWeight),\n    orderAlignmentWeight: weight(source.orderAlignmentWeight, defaults.orderAlignmentWeight),\n    advanceToThreatWeight: weight(source.advanceToThreatWeight, defaults.advanceToThreatWeight),\n    withdrawFromThreatWeight: weight(source.withdrawFromThreatWeight, defaults.withdrawFromThreatWeight),\n    orderTargetDistanceWeight: weight(source.orderTargetDistanceWeight, defaults.orderTargetDistanceWeight),\n    objectiveAlignmentWeight: weight(source.objectiveAlignmentWeight, defaults.objectiveAlignmentWeight),`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSettings.ts',
  `export function selectHighestSafePosture(\n  evaluations: readonly TacticalPostureEvaluation[],\n  settings: TacticalPositionSettings,\n): TacticalPostureEvaluation {\n  const standing = evaluations.find((item) => item.posture === 'standing');\n  if (\n    standing\n    && standing.danger <= settings.standingMaximumDanger\n    && standing.safety >= settings.standingMinimumSafety\n  ) return standing;\n\n  const crouched = evaluations.find((item) => item.posture === 'crouched');\n  if (\n    crouched\n    && crouched.danger <= settings.crouchedMaximumDanger\n    && crouched.safety >= settings.crouchedMinimumSafety\n  ) return crouched;\n\n  return evaluations.find((item) => item.posture === 'prone')\n    ?? crouched\n    ?? standing\n    ?? { posture: 'standing', danger: 100, protection: 0, safety: 0 };\n}`,
  `export function selectHighestSafePosture(\n  evaluations: readonly TacticalPostureEvaluation[],\n  settings: TacticalPositionSettings,\n): TacticalPostureEvaluation {\n  const standing = evaluations.find((item) => item.posture === 'standing');\n  const crouched = evaluations.find((item) => item.posture === 'crouched');\n  const prone = evaluations.find((item) => item.posture === 'prone');\n  const standingAllowed = Boolean(standing\n    && standing.danger <= settings.standingMaximumDanger\n    && standing.safety >= settings.standingMinimumSafety);\n  const crouchedAllowed = Boolean(crouched\n    && crouched.danger <= settings.crouchedMaximumDanger\n    && crouched.safety >= settings.crouchedMinimumSafety);\n\n  if (standingAllowed && standing) {\n    if (crouched && crouched.safety - standing.safety >= settings.crouchedSafetyAdvantageThreshold) {\n      if (prone && prone.safety - crouched.safety >= settings.proneSafetyAdvantageThreshold) return prone;\n      return crouched;\n    }\n    return standing;\n  }\n  if (crouchedAllowed && crouched) {\n    if (prone && prone.safety - crouched.safety >= settings.proneSafetyAdvantageThreshold) return prone;\n    return crouched;\n  }\n  return prone ?? crouched ?? standing\n    ?? { posture: 'standing', danger: 100, protection: 0, safety: 0 };\n}`,
);

replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  type TacticalPositionSettings,\n} from './TacticalPositionSettings';`,
  `  type TacticalPositionSearchObjective,\n  type TacticalPositionSettings,\n} from './TacticalPositionSettings';`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  readonly orderTarget: GridPosition | null;\n  readonly threatCount: number;`,
  `  readonly orderTarget: GridPosition | null;\n  readonly objective?: TacticalPositionSearchObjective;\n  readonly referenceThreatId?: string | null;\n  readonly referenceThreatPosition?: GridPosition | null;\n  readonly threatCount: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  readonly recommendedPosture: UnitPosture;\n  readonly routeCost: number;`,
  `  readonly recommendedPosture: UnitPosture;\n  readonly routeCost: number;\n  readonly referenceThreatId: string | null;\n  readonly distanceToThreatMeters: number | null;\n  readonly threatDistanceDeltaMeters: number | null;\n  readonly distanceToOrderTargetMeters: number | null;\n  readonly objectiveAlignment: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  const settings = request.settings ?? createDefaultTacticalPositionSettings();\n  const maxCandidates = clampInt(request.maxCandidates, 1, 256);`,
  `  const settings = request.settings ?? createDefaultTacticalPositionSettings();\n  const objective = request.objective ?? 'balanced';\n  const referenceThreatPosition = request.referenceThreatPosition ?? null;\n  const referenceThreatId = request.referenceThreatId ?? null;\n  const maxCandidates = clampInt(request.maxCandidates, 1, 256);`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  const originIndex = originY * field.width + originX;\n\n  if (request.threatCount <= 0 || field.passable[originIndex] !== 1 || radiusCells < 1) {`,
  `  const originIndex = originY * field.width + originX;\n  const originThreatDistanceMeters = referenceThreatPosition\n    ? Math.hypot(request.origin.x - referenceThreatPosition.x, request.origin.y - referenceThreatPosition.y) * field.metersPerCell\n    : null;\n\n  if (\n    field.passable[originIndex] !== 1\n    || radiusCells < 1\n    || ((objective === 'advance_to_threat' || objective === 'withdraw_from_threat') && !referenceThreatPosition)\n    || (objective === 'continue_order' && !request.orderTarget)\n    || (objective === 'balanced' && request.threatCount <= 0)\n  ) {`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `      const orderAlignment = request.orderTarget\n        ? clampPercent(100 - distanceBetweenCellAndPoint(point.x, point.y, request.orderTarget)\n          * field.metersPerCell / Math.max(1, request.searchRadiusMeters) * 100)\n        : 50;`,
  `      const distanceToOrderTargetMeters = request.orderTarget\n        ? distanceBetweenCellAndPoint(point.x, point.y, request.orderTarget) * field.metersPerCell\n        : null;\n      const distanceToThreatMeters = referenceThreatPosition\n        ? distanceBetweenCellAndPoint(point.x, point.y, referenceThreatPosition) * field.metersPerCell\n        : null;\n      const threatDistanceDeltaMeters = distanceToThreatMeters !== null && originThreatDistanceMeters !== null\n        ? roundTwo(distanceToThreatMeters - originThreatDistanceMeters)\n        : null;\n      const orderAlignment = distanceToOrderTargetMeters !== null\n        ? clampPercent(100 - distanceToOrderTargetMeters / Math.max(1, request.searchRadiusMeters) * 100)\n        : 50;\n      const objectiveAlignment = resolveObjectiveAlignment(\n        objective,\n        threatDistanceDeltaMeters,\n        distanceToOrderTargetMeters,\n        request.searchRadiusMeters,\n      );`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `          recommendedPosture: posture.posture,\n          routeCost: roundTwo(route.cost[routeIndex] ?? Number.POSITIVE_INFINITY),`,
  `          recommendedPosture: posture.posture,\n          routeCost: roundTwo(route.cost[routeIndex] ?? Number.POSITIVE_INFINITY),\n          referenceThreatId,\n          distanceToThreatMeters: distanceToThreatMeters === null ? null : roundTwo(distanceToThreatMeters),\n          threatDistanceDeltaMeters,\n          distanceToOrderTargetMeters: distanceToOrderTargetMeters === null ? null : roundTwo(distanceToOrderTargetMeters),\n          objectiveAlignment,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `        score: candidatePreselectionScore(candidate, current.danger, reverseSlope, forwardSlope, settings),`,
  `        score: candidatePreselectionScore(candidate, current.danger, reverseSlope, forwardSlope, settings, objective),`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `  settings: TacticalPositionSettings,\n): number {`,
  `  settings: TacticalPositionSettings,\n  objective: TacticalPositionSearchObjective,\n): number {`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearch.ts',
  `      + metrics.orderAlignment * settings.orderAlignmentWeight\n      - metrics.uncertainty * settings.uncertaintyPenaltyWeight`,
  `      + metrics.orderAlignment * settings.orderAlignmentWeight\n      + objectiveScore(metrics.objectiveAlignment, objective, settings)\n      - metrics.uncertainty * settings.uncertaintyPenaltyWeight`,
);
appendBefore(
  'src/core/tactical/TacticalPositionSearch.ts',
  `function sourceForCell(`,
  `function resolveObjectiveAlignment(\n  objective: TacticalPositionSearchObjective,\n  threatDistanceDeltaMeters: number | null,\n  distanceToOrderTargetMeters: number | null,\n  searchRadiusMeters: number,\n): number {\n  const radius = Math.max(1, searchRadiusMeters);\n  if (objective === 'advance_to_threat') {\n    return threatDistanceDeltaMeters === null ? 0 : clampPercent(50 - threatDistanceDeltaMeters / radius * 100);\n  }\n  if (objective === 'withdraw_from_threat') {\n    return threatDistanceDeltaMeters === null ? 0 : clampPercent(50 + threatDistanceDeltaMeters / radius * 100);\n  }\n  if (objective === 'continue_order') {\n    return distanceToOrderTargetMeters === null ? 0 : clampPercent(100 - distanceToOrderTargetMeters / radius * 100);\n  }\n  return 50;\n}\n\nfunction objectiveScore(\n  alignment: number,\n  objective: TacticalPositionSearchObjective,\n  settings: TacticalPositionSettings,\n): number {\n  if (objective === 'advance_to_threat') return alignment * settings.advanceToThreatWeight * settings.objectiveAlignmentWeight;\n  if (objective === 'withdraw_from_threat') return alignment * settings.withdrawFromThreatWeight * settings.objectiveAlignmentWeight;\n  if (objective === 'continue_order') return alignment * settings.orderTargetDistanceWeight * settings.objectiveAlignmentWeight;\n  return 0;\n}\n`,
);

replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  type TacticalPositionSettings,\n} from './TacticalPositionSettings';`,
  `  type TacticalPositionSearchObjective,\n  type TacticalPositionSettings,\n} from './TacticalPositionSettings';`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  | 'search_failed';`,
  `  | 'search_failed'\n  | 'reference_threat_missing'\n  | 'order_target_missing';`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `export interface TacticalPositionSearchParameters {\n  readonly searchRadiusMeters: number;`,
  `export interface TacticalPositionSearchParameters {\n  readonly objective: TacticalPositionSearchObjective;\n  readonly searchRadiusMeters: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  readonly currentPosture: UnitPosture;\n  readonly orderTarget: GridPosition | null;\n  readonly threatCount: number;`,
  `  readonly currentPosture: UnitPosture;\n  readonly orderTarget: GridPosition | null;\n  readonly referenceThreatId: string | null;\n  readonly referenceThreatPosition: GridPosition | null;\n  readonly threatCount: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `const DEFAULT_PARAMETERS: TacticalPositionSearchParameters = Object.freeze({\n  searchRadiusMeters: 50,`,
  `const DEFAULT_PARAMETERS: TacticalPositionSearchParameters = Object.freeze({\n  objective: 'balanced',\n  searchRadiusMeters: 50,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `      orderTarget: input.orderTarget ? { ...input.orderTarget } : null,\n      threatCount: input.threatCount,`,
  `      orderTarget: input.orderTarget ? { ...input.orderTarget } : null,\n      referenceThreatId: input.referenceThreatId,\n      referenceThreatPosition: input.referenceThreatPosition ? { ...input.referenceThreatPosition } : null,\n      threatCount: input.threatCount,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    if (request.kind !== 'cover') {`,
  `    if (request.kind !== 'cover') {`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    if (buildCurrentInputIdentity(this.state, unit, request) !== request.inputIdentity) {`,
  `    if ((request.objective === 'advance_to_threat' || request.objective === 'withdraw_from_threat') && !request.referenceThreatPosition) {\n      this.updateRequest(request, {\n        status: 'failed', reasonCode: 'reference_threat_missing',\n        reason: 'The selected search objective requires a known reference threat.',\n        reasonRu: 'Для выбранной цели поиска нужна известная опорная угроза.',\n      });\n      return;\n    }\n    if (request.objective === 'continue_order' && !request.orderTarget) {\n      this.updateRequest(request, {\n        status: 'failed', reasonCode: 'order_target_missing',\n        reason: 'Continue-order search requires an active order target.',\n        reasonRu: 'Для продолжения приказа нужна активная точка приказа.',\n      });\n      return;\n    }\n    if (buildCurrentInputIdentity(this.state, unit, request) !== request.inputIdentity) {`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    try {\n      this.localSearchCount += 1;\n      const result = this.searchPrepared(prepared, cloneRequest(request));`,
  `    try {\n      request.origin = { ...unit.position };\n      request.currentPosture = unit.behaviorRuntime.posture;\n      request.threatCount = unit.tacticalKnowledge.threats.length;\n      this.localSearchCount += 1;\n      const result = this.searchPrepared(prepared, cloneRequest(request));`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    orderTarget: request.orderTarget,\n    threatCount: request.threatCount,`,
  `    orderTarget: request.orderTarget,\n    objective: request.objective,\n    referenceThreatId: request.referenceThreatId,\n    referenceThreatPosition: request.referenceThreatPosition,\n    threatCount: request.threatCount,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  const origin = { ...unit.position };\n  const currentPosture = unit.behaviorRuntime.posture;\n  const orderTarget = unit.order ? { ...unit.order.target } : null;\n  const threatCount = unit.tacticalKnowledge.threats.length;`,
  `  const origin = { ...unit.position };\n  const currentPosture = unit.behaviorRuntime.posture;\n  const orderTarget = unit.order ? { ...unit.order.target } : null;\n  const referenceThreat = selectReferenceThreat(unit);\n  const referenceThreatId = referenceThreat?.id ?? null;\n  const referenceThreatPosition = referenceThreat ? { x: referenceThreat.x, y: referenceThreat.y } : null;\n  const threatCount = unit.tacticalKnowledge.threats.length;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    origin,\n    currentPosture,\n    orderTarget,\n    threatCount,`,
  `    origin,\n    currentPosture,\n    orderTarget,\n    referenceThreatId,\n    referenceThreatPosition,\n    threatCount,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  return { origin, currentPosture, orderTarget, threatCount, tacticalKnowledgeRevision, settingsRevision, settings, inputIdentity };`,
  `  return { origin, currentPosture, orderTarget, referenceThreatId, referenceThreatPosition, threatCount, tacticalKnowledgeRevision, settingsRevision, settings, inputIdentity };`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    origin: unit.position,\n    currentPosture: unit.behaviorRuntime.posture,\n    orderTarget: unit.order?.target ?? null,\n    threatCount: unit.tacticalKnowledge.threats.length,`,
  `    origin: request.origin,\n    currentPosture: request.currentPosture,\n    orderTarget: request.objective === 'continue_order' ? unit.order?.target ?? null : request.orderTarget,\n    referenceThreatId: request.referenceThreatId,\n    referenceThreatPosition: request.referenceThreatPosition,\n    threatCount: request.threatCount,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  orderTarget: GridPosition | null;\n  threatCount: number;`,
  `  orderTarget: GridPosition | null;\n  referenceThreatId: string | null;\n  referenceThreatPosition: GridPosition | null;\n  threatCount: number;`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  [
    "    `kind:${value.kind}`,",
    "    `origin:${quantize(value.origin.x)}:${quantize(value.origin.y)}`,",
    "    `posture:${value.currentPosture}`,",
    "    `order:${value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'none'}`,",
    "    `threats:${value.threatCount}:${value.tacticalKnowledgeRevision}`,",
  ].join('\n'),
  [
    "    `kind:${value.kind}`,",
    "    `objective:${value.parameters.objective}`,",
    "    `order:${value.parameters.objective === 'continue_order' && value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'ignored'}`,",
    "    `threat:${value.referenceThreatId ?? 'none'}:${value.referenceThreatPosition ? `${quantize(value.referenceThreatPosition.x)}:${quantize(value.referenceThreatPosition.y)}` : 'none'}`,",
  ].join('\n'),
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    origin: Object.freeze({ ...request.origin }),\n    orderTarget: request.orderTarget ? Object.freeze({ ...request.orderTarget }) : null,`,
  `    origin: Object.freeze({ ...request.origin }),\n    orderTarget: request.orderTarget ? Object.freeze({ ...request.orderTarget }) : null,\n    referenceThreatPosition: request.referenceThreatPosition ? Object.freeze({ ...request.referenceThreatPosition }) : null,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `  return {\n    searchRadiusMeters: bounded(value.searchRadiusMeters, DEFAULT_PARAMETERS.searchRadiusMeters, 1, 500),`,
  `  return {\n    objective: normalizeObjective(value.objective),\n    searchRadiusMeters: bounded(value.searchRadiusMeters, DEFAULT_PARAMETERS.searchRadiusMeters, 1, 500),`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    orderTarget: null,\n    threatCount: 0,`,
  `    orderTarget: null,\n    referenceThreatId: null,\n    referenceThreatPosition: null,\n    threatCount: 0,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    crouchedTransitionPenalty: 2, proneTransitionPenalty: 4,`,
  `    crouchedTransitionPenalty: 2, proneTransitionPenalty: 4,\n    crouchedSafetyAdvantageThreshold: 6, proneSafetyAdvantageThreshold: 8,`,
);
replaceExact(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `    routeSafetyWeight: 0.08, orderAlignmentWeight: 0.04,`,
  `    routeSafetyWeight: 0.08, orderAlignmentWeight: 0.04,\n    advanceToThreatWeight: 0.35, withdrawFromThreatWeight: 0.35,\n    orderTargetDistanceWeight: 0.45, objectiveAlignmentWeight: 0.4,`,
);
appendBefore(
  'src/core/tactical/TacticalPositionSearchService.ts',
  `function isReusableStatus(`,
  `function selectReferenceThreat(unit: UnitModel): UnitModel['tacticalKnowledge']['threats'][number] | null {\n  let best: UnitModel['tacticalKnowledge']['threats'][number] | null = null;\n  let bestScore = Number.NEGATIVE_INFINITY;\n  for (const threat of unit.tacticalKnowledge.threats) {\n    const score = threat.confidence * 2 + threat.strength + threat.suppression * 0.5 + (threat.visibleNow ? 1000 : 0);\n    if (score > bestScore || (score === bestScore && threat.id < (best?.id ?? '\\uffff'))) {\n      best = threat;\n      bestScore = score;\n    }\n  }\n  return best;\n}\n\nfunction normalizeObjective(value: unknown): TacticalPositionSearchObjective {\n  return value === 'advance_to_threat' || value === 'withdraw_from_threat' || value === 'continue_order'\n    ? value\n    : 'balanced';\n}\n`,
);

replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `import type { GridPosition } from '../../geometry';`,
  `import type { GridPosition } from '../../geometry';\nimport type { TacticalPositionSearchObjective } from '../../tactical/TacticalPositionSettings';`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `  readonly orderAlignment: number;\n  /** Position meaning`,
  `  readonly orderAlignment: number;\n  readonly referenceThreatId?: string | null;\n  readonly distanceToThreatMeters?: number | null;\n  readonly threatDistanceDeltaMeters?: number | null;\n  readonly distanceToOrderTargetMeters?: number | null;\n  readonly objectiveAlignment?: number;\n  /** Position meaning`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `  readonly orderAlignment: number;\n}`,
  `  readonly orderAlignment: number;\n  readonly objectiveAlignment: number;\n}`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `  readonly blackboard: Readonly<Record<string, unknown>>;`,
  `  readonly objective?: TacticalPositionSearchObjective;\n  readonly blackboard: Readonly<Record<string, unknown>>;`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `  readonly orderAlignment: number;\n}\n\nconst ZERO_BREAKDOWN`,
  `  readonly orderAlignment: number;\n  readonly objectiveAlignment: number;\n}\n\nconst ZERO_BREAKDOWN`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `  orderAlignment: 0,\n});`,
  `  orderAlignment: 0,\n  objectiveAlignment: 0,\n});`,
);
replaceExact(
  'src/core/ai/tactical/TacticalQuery.ts',
  `      orderAlignment: round(clampPercent(candidate.metrics.orderAlignment) * weights.orderAlignment),`,
  `      orderAlignment: round(clampPercent(candidate.metrics.orderAlignment) * weights.orderAlignment),\n      objectiveAlignment: round(clampPercent(candidate.metrics.objectiveAlignment ?? 50) * weights.objectiveAlignment),`,
);

replaceExact(
  'src/core/ai/AiGraphRunnerLegacy.ts',
  `  const budget = { maxCandidates: Math.max(1, Math.floor(readNumber(parameters.maxCandidates, 24))), searchRadiusMeters: Math.max(0, readNumber(parameters.searchRadiusMeters, 50)), maxCalculationMs: Math.max(0, readNumber(parameters.maxCalculationMs, 12)) };\n  const generation = context.tacticalHost?.generateCoverCandidates?.({ unitId: context.unitId, blackboard: context.blackboard, ...budget })`,
  `  const budget = { maxCandidates: Math.max(1, Math.floor(readNumber(parameters.maxCandidates, 24))), searchRadiusMeters: Math.max(0, readNumber(parameters.searchRadiusMeters, 50)), maxCalculationMs: Math.max(0, readNumber(parameters.maxCalculationMs, 12)) };\n  const objective = normalizeTacticalObjective(parameters.objective);\n  const generation = context.tacticalHost?.generateCoverCandidates?.({ unitId: context.unitId, objective, blackboard: context.blackboard, ...budget })`,
);
replaceExact(
  'src/core/ai/AiGraphRunnerLegacy.ts',
  `orderAlignment: Math.max(0, readNumber(parameters.orderAlignmentWeight, .35)) });`,
  `orderAlignment: Math.max(0, readNumber(parameters.orderAlignmentWeight, .35)), objectiveAlignment: Math.max(0, readNumber(parameters.objectiveAlignmentWeight, .35)) });`,
);
replaceExact(
  'src/core/ai/AiGraphRunnerLegacy.ts',
  `  writeMemory(context, readString(parameters.writeTo, 'best_cover_position'), { ...selection.winner.position }); return true;`,
  `  const writeTo = readString(parameters.writeTo, 'best_cover_position');\n  writeMemory(context, writeTo, { ...selection.winner.position });\n  writeMemory(context, \`${writeTo}_distance_to_threat_meters\`, selection.winner.metrics.distanceToThreatMeters ?? null);\n  writeMemory(context, \`${writeTo}_threat_distance_delta_meters\`, selection.winner.metrics.threatDistanceDeltaMeters ?? null);\n  writeMemory(context, \`${writeTo}_distance_to_order_target_meters\`, selection.winner.metrics.distanceToOrderTargetMeters ?? null);\n  return true;`,
);
appendBefore(
  'src/core/ai/AiGraphRunnerLegacy.ts',
  `function normalizeAiStateId(`,
  `function normalizeTacticalObjective(value: unknown): 'balanced' | 'advance_to_threat' | 'withdraw_from_threat' | 'continue_order' {\n  return value === 'advance_to_threat' || value === 'withdraw_from_threat' || value === 'continue_order'\n    ? value\n    : 'balanced';\n}\n\n`,
);

replaceExact(
  'src/core/ai/contracts/AiNodeContractRegistry.ts',
  `requiredParameter('maxCalculationMs','number','Calculation budget','Максимальное время расчёта',12,{minimum:0})]})`,
  `requiredParameter('maxCalculationMs','number','Calculation budget','Максимальное время расчёта',12,{minimum:0}),enumParameter('objective','Search objective','Цель поиска','balanced',[option('balanced','Balanced','Сбалансированный'),option('advance_to_threat','Advance to threat','Продвижение к угрозе'),option('withdraw_from_threat','Withdraw from threat','Отход от угрозы'),option('continue_order','Continue order','Продолжение приказа')])]})`,
);
replaceExact(
  'src/core/ai/contracts/AiNodeContractRegistry.ts',
  `requiredParameter('orderAlignmentWeight','number','Order alignment weight','Вес соответствия приказу',.35,{minimum:0})]})`,
  `requiredParameter('orderAlignmentWeight','number','Order alignment weight','Вес соответствия приказу',.35,{minimum:0}),requiredParameter('objectiveAlignmentWeight','number','Objective alignment weight','Вес соответствия цели поиска',.35,{minimum:0})]})`,
);

replaceExact(
  'src/core/tactical/SimulationTacticalPositionGeneration.ts',
  `    searchRadiusMeters: request.searchRadiusMeters,`,
  `    objective: request.objective ?? 'balanced',\n    searchRadiusMeters: request.searchRadiusMeters,`,
);

console.log('Applied tactical core v2 production changes.');
