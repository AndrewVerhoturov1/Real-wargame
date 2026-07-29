import { saveMovementProfileRegistry } from '../ai-node-editor/MovementProfileBrowserStorage';
import {
  buildSceneSnapshot,
  restoreSimulationStateFromSceneSnapshot,
  type ExportedSceneData,
} from '../core/simulation/SceneSnapshot';
import type { SimulationState } from '../core/simulation/SimulationState';
import { buildStaticTacticalPositionArtifactForExport } from '../core/tactical/static/StaticTacticalPositionService';
import { getEnvironmentProfileRegistry, saveEnvironmentProfileRegistry } from './EnvironmentProfileStorage';

export type { ExportedSceneData } from '../core/simulation/SceneSnapshot';
export {
  normalizeSceneSnapshot as normalizeImportedScene,
  restoreSceneSnapshotCombatState as restoreImportedInfantryCombatState,
} from '../core/simulation/SceneSnapshot';

export async function loadSceneJsonFromFile(state: SimulationState, file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Файл не похож на правильный JSON.');
  }

  const restored = restoreSimulationStateFromSceneSnapshot(state, parsed, {
    fallbackEnvironmentProfiles: getEnvironmentProfileRegistry().toData(),
  });
  saveEnvironmentProfileRegistry(restored.environmentProfileRegistry);
  saveMovementProfileRegistry(restored.movementProfileRegistry);

  const runtimeMessage = restored.restoredRuntimeCount > 0
    ? ` Runtime восстановлен у бойцов: ${restored.restoredRuntimeCount}.`
    : restored.resetRuntimeCount > 0
      ? ` Runtime сброшен у бойцов: ${restored.resetRuntimeCount}.`
      : ' Старый формат сцены загружен без активного действия ИИ.';
  const basisMessage = restored.persistentBasis.ok
    ? ` Статическая тактическая основа загружена из предрасчёта (${formatBytes(restored.persistentBasis.decodedBytes)}, ${restored.persistentBasis.decodeMs} мс).`
    : restored.scene.staticTacticalPositionArtifact === undefined
      ? ' Предрасчёт статической тактической основы отсутствует; запущено штатное построение.'
      : ` Предрасчёт статической тактической основы отклонён (${restored.persistentBasis.reason}); запущено штатное построение.`;
  state.editor.lastMessage = `JSON сцены загружен в сетку ${state.map.metersPerCell} м: карта ${state.map.width}×${state.map.height}, юнитов ${state.units.length}, зон ${state.pressureZones.length}.${runtimeMessage}${basisMessage}`;
}

export function downloadCurrentSceneJson(state: SimulationState): void {
  const scene = buildExportedScene(state);
  const json = JSON.stringify(scene, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `real-wargame-scene-${buildTimestampForFileName()}.json`;
  link.click();
  URL.revokeObjectURL(url);

  const basisMessage = scene.staticTacticalPositionArtifact
    ? ` Предрасчёт статической тактической основы приложен (${formatBytes(scene.staticTacticalPositionArtifact.payload.byteLength)} без base64).`
    : ' Готового актуального предрасчёта нет; сцена сохранена без него.';
  state.editor.lastMessage = `JSON испытательной сцены скачан: ${state.map.metersPerCell} м/клетка.${basisMessage}`;
}

export function buildExportedScene(state: SimulationState): ExportedSceneData {
  return buildSceneSnapshot(state, {
    exportedAt: new Date().toISOString(),
    environmentProfiles: getEnvironmentProfileRegistry().toData(),
    staticTacticalPositionArtifact: buildStaticTacticalPositionArtifactForExport(state),
  });
}

function buildTimestampForFileName(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
    .replace('T', '_')
    .replace('Z', '');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} КБ`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} МБ`;
}
