import type {
  CombatLabMapPointerV1,
  CombatLabMapToolContributorV1,
  CombatLabMapToolTransactionV1,
} from '../map-tools/CombatLabMapToolTypes';
import type { CombatLabParticipantMutationPortV1 } from './CombatLabParticipantMutationPort';

export interface CombatLabParticipantPlacementPreviewV1 {
  readonly roleId: string;
  readonly x: number;
  readonly y: number;
}

export interface CombatLabParticipantFacingPreviewV1 {
  readonly roleId: string;
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: number;
}

export interface CombatLabParticipantMapPreviewPortV1 {
  setParticipantPlacementPreview(value: CombatLabParticipantPlacementPreviewV1 | null): void;
  setParticipantFacingPreview?(value: CombatLabParticipantFacingPreviewV1 | null): void;
}

export interface CombatLabParticipantPlacementInputV1 {
  readonly roleId: string;
  readonly initialX: number;
  readonly initialY: number;
}

export interface CombatLabParticipantFacingInputV1 {
  readonly roleId: string;
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: number;
}

export interface CombatLabParticipantPlacementTransactionV1 extends CombatLabMapToolTransactionV1 {
  readonly mode: 'place_participant';
  pin(pointer: CombatLabMapPointerV1): void;
  getCandidate(): { readonly x: number; readonly y: number };
}

export interface CombatLabParticipantFacingTransactionV1 extends CombatLabMapToolTransactionV1 {
  readonly mode: 'rotate_participant';
  pin(pointer: CombatLabMapPointerV1): void;
  getCandidateDegrees(): number;
}

interface PlacementContributorOptionsV1 {
  readonly metersPerCell: number;
  readonly participantMutations: Pick<CombatLabParticipantMutationPortV1, 'update'>;
  readonly preview: Pick<CombatLabParticipantMapPreviewPortV1, 'setParticipantPlacementPreview'>;
  readonly onTransactionCreated?: (transaction: CombatLabParticipantPlacementTransactionV1) => void;
}

interface FacingContributorOptionsV1 {
  readonly metersPerCell: number;
  readonly participantMutations: Pick<CombatLabParticipantMutationPortV1, 'update'>;
  readonly preview: Pick<CombatLabParticipantMapPreviewPortV1, 'setParticipantFacingPreview'>;
  readonly onTransactionCreated?: (transaction: CombatLabParticipantFacingTransactionV1) => void;
}

export function createCombatLabParticipantPlacementContributor(
  options: PlacementContributorOptionsV1,
): CombatLabMapToolContributorV1 & {
  createTransaction(input: CombatLabParticipantPlacementInputV1): CombatLabParticipantPlacementTransactionV1;
} {
  const metersPerCell = requireMetersPerCell(options.metersPerCell);
  return {
    mode: 'place_participant',
    statusRu: 'Размещение бойца: укажите точку, затем подтвердите Enter.',
    createTransaction: (rawInput: unknown) => {
      const input = requirePlacementInput(rawInput);
      let candidate = { x: input.initialX, y: input.initialY };
      let pinned = false;
      let completed = false;
      const publishPreview = () => options.preview.setParticipantPlacementPreview({
        roleId: input.roleId,
        x: candidate.x,
        y: candidate.y,
      });
      const transaction: CombatLabParticipantPlacementTransactionV1 = {
        mode: 'place_participant',
        preview(pointer) {
          if (completed || pinned) return;
          candidate = pointerToSceneCell(pointer, metersPerCell);
          publishPreview();
        },
        pin(pointer) {
          if (completed) return;
          candidate = pointerToSceneCell(pointer, metersPerCell);
          pinned = true;
          publishPreview();
        },
        getCandidate() {
          return Object.freeze({ ...candidate });
        },
        confirm() {
          if (completed) return;
          completed = true;
          options.participantMutations.update(input.roleId, () => ({
            scenePatch: { x: candidate.x, y: candidate.y },
          }));
          options.preview.setParticipantPlacementPreview(null);
        },
        cancel() {
          if (completed) return;
          completed = true;
          options.preview.setParticipantPlacementPreview(null);
        },
      };
      options.onTransactionCreated?.(transaction);
      publishPreview();
      return transaction;
    },
  };
}

export function createCombatLabParticipantFacingContributor(
  options: FacingContributorOptionsV1,
): CombatLabMapToolContributorV1 & {
  createTransaction(input: CombatLabParticipantFacingInputV1): CombatLabParticipantFacingTransactionV1;
} {
  const metersPerCell = requireMetersPerCell(options.metersPerCell);
  return {
    mode: 'rotate_participant',
    statusRu: 'Направление бойца: укажите взгляд, затем подтвердите Enter.',
    createTransaction: (rawInput: unknown) => {
      const input = requireFacingInput(rawInput);
      let candidateDegrees = normalizeDegrees(input.facingDegrees);
      let pinned = false;
      let completed = false;
      const publishPreview = () => options.preview.setParticipantFacingPreview?.({
        roleId: input.roleId,
        x: input.x,
        y: input.y,
        facingDegrees: candidateDegrees,
      });
      const updateCandidate = (pointer: CombatLabMapPointerV1) => {
        const centreXMetres = (input.x + 0.5) * metersPerCell;
        const centreYMetres = (input.y + 0.5) * metersPerCell;
        const dx = pointer.xMetres - centreXMetres;
        const dy = pointer.yMetres - centreYMetres;
        if (Math.hypot(dx, dy) < 0.001) return;
        candidateDegrees = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
      };
      const transaction: CombatLabParticipantFacingTransactionV1 = {
        mode: 'rotate_participant',
        preview(pointer) {
          if (completed || pinned) return;
          updateCandidate(pointer);
          publishPreview();
        },
        pin(pointer) {
          if (completed) return;
          updateCandidate(pointer);
          pinned = true;
          publishPreview();
        },
        getCandidateDegrees() {
          return candidateDegrees;
        },
        confirm() {
          if (completed) return;
          completed = true;
          options.participantMutations.update(input.roleId, () => ({
            scenePatch: { facingDegrees: candidateDegrees },
          }));
          options.preview.setParticipantFacingPreview?.(null);
        },
        cancel() {
          if (completed) return;
          completed = true;
          options.preview.setParticipantFacingPreview?.(null);
        },
      };
      options.onTransactionCreated?.(transaction);
      publishPreview();
      return transaction;
    },
  };
}

export function createCombatLabParticipantMapPreviewEventPort(
  target: EventTarget = window,
): CombatLabParticipantMapPreviewPortV1 {
  const dispatch = (detail: unknown) => target.dispatchEvent(new CustomEvent('combat-lab:participant-map-preview', { detail }));
  return {
    setParticipantPlacementPreview: (value) => dispatch(value ? { kind: 'placement', ...value } : null),
    setParticipantFacingPreview: (value) => dispatch(value ? { kind: 'facing', ...value } : null),
  };
}

function pointerToSceneCell(pointer: CombatLabMapPointerV1, metersPerCell: number): { x: number; y: number } {
  return {
    x: roundThree(pointer.xMetres / metersPerCell - 0.5),
    y: roundThree(pointer.yMetres / metersPerCell - 0.5),
  };
}

function requirePlacementInput(value: unknown): CombatLabParticipantPlacementInputV1 {
  const record = requireRecord(value, 'Не заданы данные размещения бойца.');
  return {
    roleId: requireText(record.roleId, 'Не выбран боец для размещения.'),
    initialX: requireFinite(record.initialX, 'Начальная координата X некорректна.'),
    initialY: requireFinite(record.initialY, 'Начальная координата Y некорректна.'),
  };
}

function requireFacingInput(value: unknown): CombatLabParticipantFacingInputV1 {
  const record = requireRecord(value, 'Не заданы данные направления бойца.');
  return {
    roleId: requireText(record.roleId, 'Не выбран боец для поворота.'),
    x: requireFinite(record.x, 'Координата X бойца некорректна.'),
    y: requireFinite(record.y, 'Координата Y бойца некорректна.'),
    facingDegrees: normalizeDegrees(requireFinite(record.facingDegrees, 'Начальное направление некорректно.')),
  };
}

function requireMetersPerCell(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Масштаб карты metersPerCell должен быть больше нуля.');
  return value;
}

function requireFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(message);
  return value;
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return roundThree(normalized < 0 ? normalized + 360 : normalized);
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}