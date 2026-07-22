export interface DefinitionRef {
  definitionId: string;
  revision: number;
}

export type WeaponClass = 'rifle' | 'submachine_gun' | 'machine_gun' | 'pistol';
export type FireMode = 'single' | 'short_burst' | 'long_burst' | 'suppress';
export type WeaponProficiency = 'untrained' | 'trained' | 'specialist';
export type ReloadStageKind = 'open' | 'load' | 'close';
export type CatalogEntryStatus = 'draft' | 'published' | 'archived';

export interface AmmoDefinitionV1 {
  schemaVersion: 1;
  ammoDefinitionId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  projectileMassKilograms: number;
  muzzleVelocityMetersPerSecond: number;
  bodyPenetrationBudget: number;
  woundEffectMultiplier: number;
  tracer: boolean;
  tracerVisualProfileId: string | null;
  maximumLifetimeSeconds: number;
}

export interface ReloadStageDefinitionV1 {
  stageId: string;
  kind: ReloadStageKind;
  durationSeconds: number;
  interruptible: boolean;
  movementAllowed: boolean;
  loadedRoundsAppliedAtCompletion: boolean;
}

export interface WeaponDefinitionV1 {
  schemaVersion: 1;
  weaponDefinitionId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  weaponClass: WeaponClass;
  ammo: DefinitionRef;
  availableFireModes: FireMode[];
  roundsPerMinute: number;
  shortBurstRounds: number;
  longBurstRounds: number;
  capacityRounds: number;
  baseDispersionRadians: number;
  aimQualityPerSecond: number;
  recoilPitchRadiansPerShot: number;
  recoilYawRadiansPerShot: number;
  recoilRecoveryPerSecond: number;
  readySeconds: number;
  recoverySeconds: number;
  reloadStages: ReloadStageDefinitionV1[];
  allowFireWhileMoving: boolean;
  movingDispersionMultiplier: number;
  postureDispersionMultiplier: Record<'standing' | 'crouched' | 'prone', number>;
  deploySeconds: number;
  undeploySeconds: number;
  deployedTraverseArcRadians: number;
  undeployedSustainedFireMultiplier: number;
  assistantDeployMultiplier: number;
  assistantReloadMultiplier: number;
  soundRadiusMeters: number;
  muzzleFlashVisibility: number;
  muzzleForwardOffsetMeters: number;
}

export interface LoadoutWeaponTemplateV1 {
  definition: DefinitionRef;
  loadedRounds: number;
}

export interface LoadoutTemplateV1 {
  schemaVersion: 1;
  loadoutTemplateId: string;
  revision: number;
  status: CatalogEntryStatus;
  nameEn: string;
  nameRu: string;
  primary: LoadoutWeaponTemplateV1;
  secondary: LoadoutWeaponTemplateV1 | null;
  reserveRoundsByAmmoDefinitionId: Record<string, number>;
  maximumReserveRoundsByAmmoDefinitionId: Record<string, number>;
  firstAidCharges: number;
  role: 'rifleman' | 'submachine_gunner' | 'machine_gunner' | 'assistant_machine_gunner';
  proficiencyByWeaponClass: Record<WeaponClass, WeaponProficiency>;
}

export interface CombatCatalogBundleV1 {
  formatVersion: 1;
  revision: number;
  ammoDefinitions: AmmoDefinitionV1[];
  weaponDefinitions: WeaponDefinitionV1[];
  loadoutTemplates: LoadoutTemplateV1[];
}

export interface CatalogValidationIssue {
  path: string;
  code: string;
  severity: 'error' | 'warning';
  messageRu: string;
}

export interface CatalogValidationResult {
  valid: boolean;
  issues: CatalogValidationIssue[];
}
