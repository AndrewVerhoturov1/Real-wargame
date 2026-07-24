import type { SimulationState } from '../../simulation/SimulationState';
import { tickInfantryPhysiologySimulation } from './InfantryPhysiologySimulation';
import type {
  TickInfantryCombatSimulationInput,
  TickInfantryCombatSimulationResult,
} from './InfantryCombatSimulationSegment';

export type {
  TickInfantryCombatSimulationInput,
  TickInfantryCombatSimulationResult,
} from './InfantryCombatSimulationSegment';

/** Public Stage 7 combat entry point with the shared blood/fatigue/medical clock. */
export function tickInfantryCombatSimulation(
  state: SimulationState,
  input: TickInfantryCombatSimulationInput,
): TickInfantryCombatSimulationResult {
  return tickInfantryPhysiologySimulation(state, input);
}
