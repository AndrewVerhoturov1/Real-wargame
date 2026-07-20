import type { TacticalTraversalProfile } from './TacticalTraversalProfile';
import type { TacticalTraversalProfileDataV1 } from './TacticalTraversalProfileStore';

declare module '../units/UnitModel' {
  interface UnitData {
    tacticalTraversalProfile?: TacticalTraversalProfileDataV1;
  }

  interface UnitModel {
    tacticalTraversalProfile: TacticalTraversalProfile;
    tacticalTraversalProfileRevision: number;
  }
}

export {};
