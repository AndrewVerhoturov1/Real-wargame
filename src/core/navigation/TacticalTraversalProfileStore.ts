import type { UnitData, UnitModel } from '../units/UnitModel';
import {
  createDefaultTacticalTraversalProfile,
  normalizeTacticalTraversalProfile,
  type TacticalTraversalProfile,
  type TacticalTraversalProfileInput,
} from './TacticalTraversalProfile';

export interface TacticalTraversalProfileDataV1 {
  readonly version: 1;
  readonly revision: number;
  readonly values: TacticalTraversalProfile;
}

type TacticalTraversalCarrier = UnitModel & {
  tacticalTraversalProfile?: TacticalTraversalProfile;
  tacticalTraversalProfileRevision?: number;
};

export function initializeTacticalTraversalProfiles(
  units: readonly UnitModel[],
  sourceUnits: readonly UnitData[],
): void {
  const sourceById = new Map(sourceUnits.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    const source = sourceById.get(unit.id) as (UnitData & {
      tacticalTraversalProfile?: TacticalTraversalProfileInput | TacticalTraversalProfileDataV1;
    }) | undefined;
    initializeTacticalTraversalProfile(unit, source?.tacticalTraversalProfile);
  }
}

export function initializeTacticalTraversalProfile(
  unit: UnitModel,
  input?: TacticalTraversalProfileInput | TacticalTraversalProfileDataV1 | null,
): TacticalTraversalProfile {
  const carrier = unit as TacticalTraversalCarrier;
  const values = isEnvelope(input) ? input.values : input;
  const profile = normalizeTacticalTraversalProfile(values ?? createDefaultTacticalTraversalProfile());
  const revision = isEnvelope(input)
    ? Math.max(0, Math.floor(input.revision))
    : Math.max(0, Math.floor(profile.revision));
  carrier.tacticalTraversalProfile = { ...profile, revision };
  carrier.tacticalTraversalProfileRevision = revision;
  return carrier.tacticalTraversalProfile;
}

export function getUnitTacticalTraversalProfile(unit: UnitModel): TacticalTraversalProfile {
  const carrier = unit as TacticalTraversalCarrier;
  if (!carrier.tacticalTraversalProfile) initializeTacticalTraversalProfile(unit, null);
  return carrier.tacticalTraversalProfile!;
}

export function setUnitTacticalTraversalProfile(
  unit: UnitModel,
  input: TacticalTraversalProfileInput,
): TacticalTraversalProfile {
  const current = getUnitTacticalTraversalProfile(unit);
  const revision = Math.max(
    current.revision,
    (unit as TacticalTraversalCarrier).tacticalTraversalProfileRevision ?? 0,
  ) + 1;
  const profile = { ...normalizeTacticalTraversalProfile(input), revision };
  const carrier = unit as TacticalTraversalCarrier;
  carrier.tacticalTraversalProfile = profile;
  carrier.tacticalTraversalProfileRevision = revision;
  return profile;
}

export function serializeUnitTacticalTraversalProfile(
  unit: UnitModel,
): TacticalTraversalProfileDataV1 {
  const profile = getUnitTacticalTraversalProfile(unit);
  return {
    version: 1,
    revision: profile.revision,
    values: {
      ...profile,
      allowedMovementProfileIds: [...profile.allowedMovementProfileIds],
      weights: { ...profile.weights },
    },
  };
}

function isEnvelope(
  value: TacticalTraversalProfileInput | TacticalTraversalProfileDataV1 | null | undefined,
): value is TacticalTraversalProfileDataV1 {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as Partial<TacticalTraversalProfileDataV1>).version === 1
    && (value as Partial<TacticalTraversalProfileDataV1>).values,
  );
}
