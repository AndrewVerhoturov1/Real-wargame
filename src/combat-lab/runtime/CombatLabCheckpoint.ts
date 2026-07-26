import { createMovementProfileRegistry } from '../../core/movement/MovementProfiles';
import { replaceSceneAtRuntimeResolution } from '../../core/simulation/ResolutionAwareScene';
import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  buildExportedScene,
  normalizeImportedScene,
  restoreImportedInfantryCombatState,
  type ExportedSceneData,
} from '../../ui/SceneExport';

export interface CombatLabCheckpointV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly seed: number;
  readonly simulatedSeconds: number;
  readonly interactive: boolean;
  readonly savePayload: ExportedSceneData;
}

export function createCombatLabCheckpoint(
  state: SimulationState,
  metadata: Omit<CombatLabCheckpointV1, 'schemaVersion' | 'simulatedSeconds' | 'savePayload'>,
): CombatLabCheckpointV1 {
  return {
    schemaVersion: 1,
    scenarioId: metadata.scenarioId,
    scenarioRevision: metadata.scenarioRevision,
    seed: metadata.seed,
    simulatedSeconds: state.simulationTimeSeconds,
    interactive: metadata.interactive,
    savePayload: buildExportedScene(state),
  };
}

export function restoreExportedScene(state: SimulationState, payload: ExportedSceneData): void {
  const scene = normalizeImportedScene(payload);
  replaceSceneAtRuntimeResolution(state, scene.map, scene.units, scene.pressureZones);
  restoreImportedInfantryCombatState(state, scene);
  state.movementProfiles = createMovementProfileRegistry(scene.movementProfiles);
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  state.editor.tool = 'select';
  state.editor.nextObjectIndex = nextIndex(scene.map.objects ?? [], 'editor_object_');
  state.editor.nextUnitIndex = nextIndex(scene.units, 'editor_unit_');
  state.editor.nextZoneIndex = nextIndex(scene.pressureZones, 'editor_zone_');
}

export function restoreCombatLabCheckpoint(
  state: SimulationState,
  checkpoint: CombatLabCheckpointV1,
): void {
  if (checkpoint.schemaVersion !== 1) throw new Error(`Unsupported Combat Lab checkpoint schema: ${checkpoint.schemaVersion}.`);
  restoreExportedScene(state, checkpoint.savePayload);
}

function nextIndex(items: Array<{ id?: string }>, prefix: string): number {
  let maximum = 0;
  for (const item of items) {
    if (!item.id?.startsWith(prefix)) continue;
    const suffix = Number.parseInt(item.id.slice(prefix.length), 10);
    if (Number.isFinite(suffix)) maximum = Math.max(maximum, suffix);
  }
  return maximum + 1;
}
