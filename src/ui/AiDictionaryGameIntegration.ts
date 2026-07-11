import { buildBlackboardForUnit } from '../core/ai/AiGameBridge';
import type { AiConceptDefinition, AiConceptNodeTemplate } from '../core/ai/AiConceptCatalog';
import type { AiBlackboardValue } from '../core/ai/AiBlackboard';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { setSimulationLayerMode, setVisibilityProbe } from '../core/ui/RuntimeUiState';
import { installAiDictionaryPanel, type AiDictionarySnapshot } from './AiDictionaryPanel';

const PENDING_NODE_KEY = 'real-wargame.ai-dictionary.pending-node.v1';
const FOCUS_KEY = 'real-wargame.ai-dictionary.focus.v1';
const SNAPSHOT_KEY = 'real-wargame.ai-dictionary.snapshot.v1';
let lastSnapshotSignature = '';

export function installAiDictionaryGameIntegration(state: SimulationState, onChanged: () => void): () => void {
  const panel = installAiDictionaryPanel({
    mode: 'game',
    getSnapshot: () => buildSnapshot(state),
    onAddNode: (concept, template) => openEditorWithNode(concept, template),
    onShowOnMap: (concept, value) => showConceptOnMap(state, concept, value, onChanged),
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ai-dictionary-open-button';
  button.dataset.action = 'ai-dictionary';
  button.textContent = 'Словарь ИИ';
  button.title = 'Открыть интерактивный словарь данных, проверок и действий ИИ';
  button.addEventListener('click', () => panel.open());

  const topActions = document.querySelector('.workspace-top-actions');
  const aiEditorButton = topActions?.querySelector('[data-action="ai-editor"]');
  if (topActions) topActions.insertBefore(button, aiEditorButton ?? topActions.firstChild);
  else document.body.append(button);

  const focusRequest = readJson<{ conceptKey?: string }>(FOCUS_KEY);
  if (focusRequest?.conceptKey) {
    localStorage.removeItem(FOCUS_KEY);
    window.setTimeout(() => panel.open(focusRequest.conceptKey), 100);
  }

  return () => { button.remove(); panel.destroy(); };
}

function buildSnapshot(state: SimulationState): AiDictionarySnapshot {
  const unit = getSelectedUnit(state);
  const values: Record<string, AiBlackboardValue> = unit ? {
    ...buildBlackboardForUnit(state, unit),
    resilience: unit.soldier.traits.resilience,
    caution: unit.soldier.traits.caution,
    decisiveness: unit.soldier.traits.decisiveness,
    discipline: unit.soldier.traits.discipline,
    initiative: unit.soldier.traits.initiative,
    tactics: unit.soldier.traits.tactics,
    weaponSkill: unit.soldier.traits.weaponSkill,
    confusion: unit.soldier.condition.confusion,
    attention: unit.soldier.condition.attention,
    view: unit.soldier.condition.view,
    intuition: unit.soldier.condition.intuition,
    speed: unit.soldier.condition.speed,
    stealth: unit.soldier.condition.stealth,
    posture: unit.behaviorRuntime.posture,
    behaviorProfile: unit.behaviorProfile,
  } : {};
  const snapshot: AiDictionarySnapshot = { unitId: unit?.id ?? null, unitLabel: unit?.labels.ru ?? 'Боец не выбран', values, updatedAtMs: Date.now() };
  persistSnapshot(snapshot);
  return snapshot;
}

function persistSnapshot(snapshot: AiDictionarySnapshot): void {
  try {
    const signature = JSON.stringify([snapshot.unitId, snapshot.values]);
    if (signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The dictionary remains usable in the current tab when storage is unavailable.
  }
}

function openEditorWithNode(concept: AiConceptDefinition, template: AiConceptNodeTemplate): void {
  localStorage.setItem(PENDING_NODE_KEY, JSON.stringify({ conceptKey: concept.key, nodeType: template.nodeType, parameters: template.parameters, requestedAtMs: Date.now() }));
  window.open('/ai-node-editor.html#ai-dictionary-add', '_blank');
}

function showConceptOnMap(state: SimulationState, concept: AiConceptDefinition, value: AiBlackboardValue | undefined, onChanged: () => void): string {
  if (concept.mapFocus === 'threat' || concept.mapFocus === 'cover' || concept.mapFocus === 'route') setSimulationLayerMode(state, 'danger');
  else if (concept.mapFocus === 'memory') setSimulationLayerMode(state, 'memory');
  else setSimulationLayerMode(state, 'info');
  if (isPosition(value)) setVisibilityProbe(state, true, value);
  onChanged();
  if (isPosition(value)) return `Показана точка ${Math.round(value.x * 10) / 10}, ${Math.round(value.y * 10) / 10}.`;
  if (concept.mapFocus === 'memory') return 'Открыт слой личной памяти выбранного бойца.';
  if (concept.mapFocus === 'threat') return 'Открыт слой опасности и источников угроз.';
  if (concept.mapFocus === 'cover') return 'Открыт слой опасности и доступных укрытий.';
  if (concept.mapFocus === 'route') return 'Открыт слой опасности маршрута.';
  return 'Открыт информационный слой выбранного бойца.';
}

function isPosition(value: AiBlackboardValue | undefined): value is { x: number; y: number } {
  return typeof value === 'object' && value !== null && typeof value.x === 'number' && typeof value.y === 'number';
}
function readJson<T>(key: string): T | null { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; } }
