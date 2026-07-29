import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type {
  CombatLabExperimentV1,
  CombatLabFireModeV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabEditorActionKind } from './CombatLabEditorFactories';

export interface CombatLabActionAvailabilityV1 {
  readonly enabled: boolean;
  readonly reasonRu: string | null;
}

export interface CombatLabAccuracyEditorMountV1 {
  destroy(): void;
}

export interface CombatLabAccuracyControlsAdapterV1 {
  mount(
    host: HTMLElement,
    actorRoleId: string,
    current: CombatLabAccuracyOverridesV1 | null,
    onChange: (next: CombatLabAccuracyOverridesV1 | null) => void,
  ): CombatLabAccuracyEditorMountV1;
}

export interface CombatLabScenarioEditorCapabilitiesV1 {
  resolveActionAvailability?(
    experiment: CombatLabExperimentV1,
    actorRoleId: string,
    actionKind: CombatLabEditorActionKind,
    fireMode?: CombatLabFireModeV1,
  ): CombatLabActionAvailabilityV1;
  readonly accuracyControls?: CombatLabAccuracyControlsAdapterV1;
}

export interface CombatLabSelectedStepV1 {
  readonly trackId: string;
  readonly stepId: string;
}

export interface CombatLabStepMutationV1 {
  readonly trackId: string;
  readonly step: CombatLabScenarioStepV1;
}
