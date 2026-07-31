import type {
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabScenarioStepV1,
} from './CombatLabExperimentContracts';
import type { CombatLabExperimentIssueV1 } from './CombatLabExperimentValidation';

export interface SceneUnitSummary {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly aiControl?: string;
  readonly aiBrain?: unknown;
  readonly primaryWeapon: Record<string, unknown> | null;
  readonly availableFireModes: readonly string[];
  readonly totalRounds: number;
  readonly capabilities: {
    readonly alive: boolean;
    readonly conscious: boolean;
    readonly canMove: boolean;
    readonly canUseWeapon: boolean;
  };
  readonly suppression: number;
  readonly contacts: readonly string[];
}

export interface StepLocation {
  readonly key: string;
  readonly trackId: string;
  readonly step: CombatLabScenarioStepV1;
  readonly path: string;
}

export function detectDependencyCycles(locations: readonly StepLocation[], issues: CombatLabExperimentIssueV1[]): void {
  const graph = new Map<string, string[]>();
  const pathByKey = new Map(locations.map((item) => [item.key, item.path]));
  for (const location of locations) {
    const dependencies: string[] = [];
    for (const [condition] of conditionsOfStep(location.step, location.path)) {
      if (condition.kind === 'step_state') dependencies.push(`${condition.trackId}/${condition.stepId}`);
    }
    graph.set(location.key, dependencies);
  }
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (key: string): void => {
    const current = state.get(key);
    if (current === 'visited') return;
    if (current === 'visiting') {
      const start = Math.max(0, stack.indexOf(key));
      const cycle = [...stack.slice(start), key];
      const signature = [...new Set(cycle)].sort().join('|');
      if (!reported.has(signature)) {
        reported.add(signature);
        issues.push(error('combat_lab_step_dependency_cycle', `Обнаружен цикл зависимостей шагов: ${cycle.join(' → ')}.`, pathByKey.get(key) ?? '$.tracks'));
      }
      return;
    }
    state.set(key, 'visiting');
    stack.push(key);
    for (const dependency of graph.get(key) ?? []) if (graph.has(dependency)) visit(dependency);
    stack.pop();
    state.set(key, 'visited');
  };
  for (const key of graph.keys()) visit(key);
}

export function conditionsOfStep(step: CombatLabScenarioStepV1, path: string): readonly [CombatLabConditionV1, string][] {
  const conditions: [CombatLabConditionV1, string][] = [[step.startCondition, `${path}.startCondition`]];
  if (step.completion.kind === 'condition') conditions.push([step.completion.condition, `${path}.completion.condition`]);
  if (step.repeat.kind === 'until_condition') conditions.push([step.repeat.condition, `${path}.repeat.condition`]);
  return conditions;
}
export function readSceneUnits(experiment: CombatLabExperimentV1): readonly SceneUnitSummary[] {
  const rows = Array.isArray(experiment.sceneSnapshot?.units) ? experiment.sceneSnapshot.units : [];
  return rows.flatMap((value): SceneUnitSummary[] => {
    const unit = asRecord(value);
    const id = text(unit?.id);
    if (!unit || !id) return [];
    const runtime = asRecord(unit.runtime);
    const combat = asRecord(runtime?.infantryCombat);
    const primaryWeapon = asRecord(combat?.primaryWeapon);
    const resolved = asRecord(primaryWeapon?.resolved);
    const weapon = asRecord(resolved?.weapon);
    const modes = Array.isArray(weapon?.availableFireModes) ? weapon.availableFireModes.filter((mode): mode is string => typeof mode === 'string') : [];
    const ammoInventory = asRecord(combat?.ammoInventory);
    const reserves = Array.isArray(ammoInventory?.reserves) ? ammoInventory.reserves : [];
    const reserveRounds = reserves.reduce((sum, entry) => sum + Math.max(0, finite(asRecord(entry)?.rounds)), 0);
    const wounds = asRecord(combat?.wounds);
    const capabilities = asRecord(wounds?.capabilities);
    const physiology = asRecord(combat?.physiology);
    const blood = asRecord(physiology?.blood);
    const bloodState = text(blood?.state, 'stable');
    const alive = capabilities?.alive !== false && bloodState !== 'dead';
    const conscious = alive && capabilities?.conscious !== false && bloodState !== 'unconscious';
    const perception = asRecord(unit.perceptionKnowledge);
    const contacts = Array.isArray(perception?.contacts)
      ? perception.contacts.flatMap((contact): string[] => {
        const record = asRecord(contact);
        const sourceUnitId = text(record?.sourceUnitId);
        return sourceUnitId && (record?.visibleNow === true || record?.observedNow === true || finite(record?.confidence) > 0) ? [sourceUnitId] : [];
      })
      : [];
    const suppression = asRecord(combat?.suppression);
    return [{
      id,
      aiControl: text(unit.aiControl) || undefined,
      aiBrain: unit.aiBrain,
      primaryWeapon,
      availableFireModes: modes,
      totalRounds: Math.max(0, finite(primaryWeapon?.roundsInWeapon)) + reserveRounds,
      capabilities: {
        alive,
        conscious,
        canMove: conscious && capabilities?.canMove !== false,
        canUseWeapon: conscious && capabilities?.canUseWeapon !== false,
      },
      suppression: finite(suppression?.suppressionLevel, finite(runtime?.suppression)),
      contacts,
    }];
  });
}

export function collectUniqueIds<T extends object>(
  rows: readonly T[],
  field: keyof T,
  basePath: string,
  code: string,
  labelRu: string,
  issues: CombatLabExperimentIssueV1[],
): Set<string> {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    const id = text(row[field]);
    if (!id || ids.has(id)) issues.push(error(code, `${labelRu} должна иметь непустой уникальный ID.`, `${basePath}[${index}].${String(field)}`));
    else ids.add(id);
  });
  return ids;
}

export function validateFiniteRange(value: unknown, minimum: number, maximum: number, path: string, code: string, messageRu: string, issues: CombatLabExperimentIssueV1[], minimumInclusive: boolean): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimumInclusive ? value < minimum : value <= minimum) || value > maximum) issues.push(error(code, messageRu, path));
}
export function missingReference(issues: CombatLabExperimentIssueV1[], code: string, messageRu: string, path: string): void { issues.push(error(code, messageRu, path)); }
export function error(code: string, messageRu: string, path: string): CombatLabExperimentIssueV1 { return { severity: 'error', code, messageRu, path }; }
export function warning(code: string, messageRu: string, path: string): CombatLabExperimentIssueV1 { return { severity: 'warning', code, messageRu, path }; }
export function asRecord(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
export function finite(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
