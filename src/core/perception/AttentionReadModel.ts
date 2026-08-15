import { rearAngleDegrees, type AttentionMode, type AttentionZone } from './AttentionModel';
import { getAttentionProfileRegistry } from './AttentionProfileStorage';
import type { PerceptionContactMemory } from './PerceptionContact';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export interface AttentionZoneReadModel {
  readonly zone: Exclude<AttentionZone, 'near' | 'outside'>;
  readonly angleDegrees: number;
  readonly weight: number;
  readonly checkIntervalSeconds: number;
  readonly sampleDurationSeconds: number;
  readonly maximumRangeMeters: number | null;
}

export interface AttentionContactReadModel {
  readonly id: string;
  readonly sourceUnitId: string | null;
  readonly labelRu: string;
  readonly stage: PerceptionContactMemory['stage'];
  readonly source: PerceptionContactMemory['source'];
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly lastKnownPosition: { readonly x: number; readonly y: number };
  readonly displayPosition: { readonly x: number; readonly y: number };
  readonly linkedUnitId: string | null;
  readonly visibleNow: boolean;
  readonly observedNow: boolean;
  readonly explanationRu: readonly string[];
}

export interface AttentionReadModel {
  readonly unitId: string;
  readonly unitPosition: { readonly x: number; readonly y: number };
  readonly mode: AttentionMode;
  readonly modeSource: UnitModel['attentionRuntime']['modeSource'];
  readonly profileId: string | null;
  readonly profileNameRu: string;
  readonly availableProfiles: readonly { readonly id: string; readonly nameRu: string }[];
  readonly focusDirectionRadians: number;
  readonly focusTargetId: string | null;
  readonly searchCenterRadians: number;
  readonly searchArcRadians: number;
  readonly maximumVisualRangeMeters: number;
  readonly distanceFalloffStartMeters: number;
  readonly distanceFalloffExponent: number;
  readonly zones: readonly AttentionZoneReadModel[];
  readonly contacts: readonly AttentionContactReadModel[];
  readonly perceptionRevision: number;
  readonly revisionKey: string;
}

/** Read-only projection for the accepted Polygon attention panel. */
export function buildAttentionReadModel(state: SimulationState, unit: UnitModel): AttentionReadModel {
  const registry = getAttentionProfileRegistry();
  const profileId = unit.playerAttentionProfileId ?? null;
  const registered = profileId && registry.hasProfile(profileId) ? registry.getProfile(profileId) : null;
  const modeProfile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  const maximumVisualRangeMeters = unit.attentionSettings.vision.maximumVisualRangeMeters;
  const zones: AttentionZoneReadModel[] = [
    zone('focus', modeProfile.focusAngleDegrees, modeProfile.focusWeight, modeProfile.focusCheckIntervalSeconds, modeProfile.focusSampleDurationSeconds, maximumVisualRangeMeters),
    zone('direct', modeProfile.directAngleDegrees, modeProfile.directWeight, modeProfile.directCheckIntervalSeconds, modeProfile.directSampleDurationSeconds, maximumVisualRangeMeters),
    zone('peripheral', modeProfile.peripheralAngleDegrees, modeProfile.peripheralWeight, modeProfile.peripheralCheckIntervalSeconds, modeProfile.peripheralSampleDurationSeconds, maximumVisualRangeMeters),
    zone('rear', rearAngleDegrees(modeProfile), modeProfile.rearWeight, modeProfile.rearCheckIntervalSeconds, modeProfile.rearSampleDurationSeconds, modeProfile.rearMaximumRangeMeters),
  ];
  const contacts = unit.perceptionKnowledge.contacts.map((contact) => {
    const linkedUnit = contact.visibleNow && contact.sourceUnitId
      ? state.units.find((candidate) => candidate.id === contact.sourceUnitId) ?? null
      : null;
    return {
      id: contact.id,
      sourceUnitId: contact.sourceUnitId,
      labelRu: contact.labelRu,
      stage: contact.stage,
      source: contact.source,
      confidence: contact.confidence,
      uncertaintyCells: contact.uncertaintyCells,
      lastKnownPosition: { ...contact.lastKnownPosition },
      displayPosition: linkedUnit ? { ...linkedUnit.position } : { ...contact.lastKnownPosition },
      linkedUnitId: linkedUnit?.id ?? null,
      visibleNow: contact.visibleNow,
      observedNow: contact.observedNow,
      explanationRu: [...contact.explanationRu],
    };
  });
  const revisionKey = [
    unit.id,
    profileId ?? 'individual',
    fixed(unit.position.x),
    fixed(unit.position.y),
    unit.attentionRuntime.mode,
    unit.attentionRuntime.modeSource,
    fixed(unit.attentionRuntime.focusDirectionRadians),
    unit.attentionRuntime.focusTargetId ?? 'none',
    fixed(unit.attentionRuntime.searchCenterRadians),
    fixed(unit.attentionRuntime.searchArcRadians),
    unit.perceptionKnowledge.revision,
  ].join(':');

  return {
    unitId: unit.id,
    unitPosition: { ...unit.position },
    mode: unit.attentionRuntime.mode,
    modeSource: unit.attentionRuntime.modeSource,
    profileId,
    profileNameRu: registered?.nameRu ?? 'Индивидуальный',
    availableProfiles: registry.listProfiles().map((profile) => ({ id: profile.id, nameRu: profile.nameRu })),
    focusDirectionRadians: unit.attentionRuntime.focusDirectionRadians,
    focusTargetId: unit.attentionRuntime.focusTargetId,
    searchCenterRadians: unit.attentionRuntime.searchCenterRadians,
    searchArcRadians: unit.attentionRuntime.searchArcRadians,
    maximumVisualRangeMeters,
    distanceFalloffStartMeters: unit.attentionSettings.vision.distanceFalloffStartMeters,
    distanceFalloffExponent: unit.attentionSettings.vision.distanceFalloffExponent,
    zones,
    contacts,
    perceptionRevision: unit.perceptionKnowledge.revision,
    revisionKey,
  };
}

function zone(
  zoneName: AttentionZoneReadModel['zone'],
  angleDegrees: number,
  weight: number,
  checkIntervalSeconds: number,
  sampleDurationSeconds: number,
  maximumRangeMeters: number,
): AttentionZoneReadModel {
  return {
    zone: zoneName,
    angleDegrees,
    weight,
    checkIntervalSeconds,
    sampleDurationSeconds,
    maximumRangeMeters: Number.isFinite(maximumRangeMeters) ? maximumRangeMeters : null,
  };
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : '0';
}
