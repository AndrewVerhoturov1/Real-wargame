import type { SimulationState } from '../core/simulation/SimulationState';
import { selectUnit } from '../core/simulation/SimulationState';

export interface TacticalOrderVisualQaSnapshot {
  readonly selectedUnitId: string | null;
  readonly presetId: string | null;
  readonly navigationProfileId: string | null;
  readonly attentionPolicy: string | null;
  readonly contactPolicy: string | null;
  readonly firePolicy: string | null;
  readonly commandStatus: string | null;
  readonly playerCommandId: string | null;
  readonly movePlayerCommandId: string | null;
  readonly routeStatus: string | null;
  readonly target: { readonly x: number; readonly y: number } | null;
}

export interface TacticalOrderVisualQaApi {
  reset(): TacticalOrderVisualQaSnapshot;
  getSnapshot(): TacticalOrderVisualQaSnapshot;
}

declare global {
  interface Window {
    __realWargameTacticalOrderVisualQa?: TacticalOrderVisualQaApi;
  }
}

export function installTacticalOrderVisualQaHarness(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('visualQa') !== 'tactical-order-radial-menu') return () => undefined;

  const reset = (): TacticalOrderVisualQaSnapshot => {
    const unit = state.units.find((candidate) => candidate.side === 'blue') ?? state.units[0];
    for (const candidate of state.units) {
      candidate.playerCommand = null;
      candidate.order = null;
      candidate.plan = null;
    }
    selectUnit(state, unit?.id ?? null);
    (state as SimulationState & { paused?: boolean }).paused = true;
    onChanged();
    return snapshot(state);
  };

  const api: TacticalOrderVisualQaApi = {
    reset,
    getSnapshot: () => snapshot(state),
  };
  window.__realWargameTacticalOrderVisualQa = api;
  reset();

  return () => {
    if (window.__realWargameTacticalOrderVisualQa === api) {
      delete window.__realWargameTacticalOrderVisualQa;
    }
  };
}

function snapshot(state: SimulationState): TacticalOrderVisualQaSnapshot {
  const unit = state.units.find((candidate) => candidate.id === state.selectedUnitId) ?? null;
  const command = unit?.playerCommand ?? null;
  return {
    selectedUnitId: unit?.id ?? null,
    presetId: command?.intent.presetId ?? null,
    navigationProfileId: command?.intent.navigationProfileId ?? null,
    attentionPolicy: command?.intent.attentionPolicy ?? null,
    contactPolicy: command?.intent.contactPolicy ?? null,
    firePolicy: command?.intent.firePolicy ?? null,
    commandStatus: command?.status ?? null,
    playerCommandId: command?.id ?? null,
    movePlayerCommandId: unit?.order?.playerCommandId ?? null,
    routeStatus: unit?.order?.routeStatus ?? null,
    target: command ? { ...command.target } : null,
  };
}
