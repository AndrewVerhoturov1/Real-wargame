import type { CombatLabExperimentV1, CombatLabMarkerV1 } from '../../core/testing/combat-lab/experiment';
import type { CombatLabMapToolCoordinator } from '../map-tools/CombatLabMapToolCoordinator';
import type {
  CombatLabMapToolPointerV1,
  CombatLabMapToolTransactionV1,
} from '../map-tools/CombatLabMapToolTypes';
import type { CombatLabSelectionControllerV1 } from '../selection/CombatLabSelectionController';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import {
  buildCombatLabMarkerReferenceSummary,
  createCombatLabMarkerCascadeResult,
  nextCombatLabMarkerId,
  type CombatLabMarkerReferenceSummaryV1,
} from './CombatLabMarkerReferenceSummary';

export interface CombatLabMarkerEditTransactionCallbacksV1 {
  readonly onPreview: (marker: CombatLabMarkerV1) => void;
  readonly onCommit: (marker: CombatLabMarkerV1) => void;
  readonly onClearPreview: () => void;
}

export interface CombatLabMarkerUpdateV1 {
  readonly titleRu: string;
  readonly xMetres: number;
  readonly yMetres: number;
  readonly radiusMetres?: number;
}

export class CombatLabMarkerEditTransaction {
  private previewMarker: CombatLabMarkerV1;
  private finished = false;

  constructor(
    private readonly original: CombatLabMarkerV1,
    private readonly callbacks: CombatLabMarkerEditTransactionCallbacksV1,
    private readonly transform: (
      original: CombatLabMarkerV1,
      pointer: CombatLabMapToolPointerV1,
    ) => CombatLabMarkerV1 = moveMarker,
  ) {
    this.previewMarker = original;
  }

  preview(pointer: CombatLabMapToolPointerV1): void {
    if (this.finished) return;
    this.previewMarker = this.transform(this.original, pointer);
    this.callbacks.onPreview(this.previewMarker);
  }

  confirm(): void {
    if (this.finished) return;
    this.finished = true;
    this.callbacks.onClearPreview();
    this.callbacks.onCommit(this.previewMarker);
  }

  cancel(): void {
    if (this.finished) return;
    this.finished = true;
    this.callbacks.onClearPreview();
  }
}

export interface CombatLabMarkerManagerOptionsV1 {
  readonly draft: CombatLabExperimentDraft;
  readonly mapTools: Pick<CombatLabMapToolCoordinator, 'registerContributor' | 'begin' | 'cancel'>;
  readonly selection: Pick<CombatLabSelectionControllerV1, 'get' | 'select' | 'subscribe'>;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onPreviewChanged?: (marker: CombatLabMarkerV1 | null) => void;
  readonly onMessage?: (messageRu: string, error: boolean) => void;
}

export class CombatLabMarkerManager {
  private readonly unregisterMove: () => void;
  private readonly unregisterResize: () => void;
  private destroyed = false;

  private constructor(private readonly options: CombatLabMarkerManagerOptionsV1) {
    this.unregisterMove = options.mapTools.registerContributor<{ readonly markerId: string }>({
      mode: 'move_marker',
      createTransaction: ({ markerId }) => this.createTransaction('move_marker', markerId, moveMarker),
    });
    this.unregisterResize = options.mapTools.registerContributor<{ readonly markerId: string }>({
      mode: 'resize_circle_marker',
      createTransaction: ({ markerId }) => this.createTransaction('resize_circle_marker', markerId, resizeCircleMarker),
    });
  }

  static create(options: CombatLabMarkerManagerOptionsV1): CombatLabMarkerManager {
    return new CombatLabMarkerManager(options);
  }

  getSelectedMarker(): CombatLabMarkerV1 | null {
    const selection = this.options.selection.get();
    if (selection.kind !== 'marker') return null;
    return this.options.draft.getExperiment().markers.find((marker) => marker.markerId === selection.markerId) ?? null;
  }

  getReferenceSummary(markerId: string): CombatLabMarkerReferenceSummaryV1 {
    return buildCombatLabMarkerReferenceSummary(this.options.draft.getExperiment(), markerId);
  }

  select(markerId: string): void {
    if (!this.options.draft.getExperiment().markers.some((marker) => marker.markerId === markerId)) return;
    this.options.selection.select({ kind: 'marker', markerId });
  }

  update(markerId: string, value: CombatLabMarkerUpdateV1): void {
    const marker = this.requireMarker(markerId);
    const titleRu = value.titleRu.trim();
    if (!titleRu) throw new Error('Название метки не может быть пустым.');
    const next: CombatLabMarkerV1 = marker.kind === 'circle'
      ? {
          ...marker,
          titleRu,
          xMetres: finite(value.xMetres),
          yMetres: finite(value.yMetres),
          radiusMetres: Math.max(0.1, finite(value.radiusMetres ?? marker.radiusMetres)),
        }
      : {
          ...marker,
          titleRu,
          xMetres: finite(value.xMetres),
          yMetres: finite(value.yMetres),
        };
    this.commitMarker(next);
  }

  rename(markerId: string, titleRu: string): void {
    const marker = this.requireMarker(markerId);
    this.update(markerId, {
      titleRu,
      xMetres: marker.xMetres,
      yMetres: marker.yMetres,
      radiusMetres: marker.kind === 'circle' ? marker.radiusMetres : undefined,
    });
  }

  updateCoordinates(markerId: string, xMetres: number, yMetres: number, radiusMetres?: number): void {
    const marker = this.requireMarker(markerId);
    this.update(markerId, {
      titleRu: marker.titleRu,
      xMetres,
      yMetres,
      radiusMetres,
    });
  }

  duplicate(markerId: string): string {
    const marker = this.requireMarker(markerId);
    const experiment = this.options.draft.getExperiment();
    const duplicateId = nextCombatLabMarkerId(experiment.markers, marker.kind === 'circle' ? 'area' : 'point');
    const duplicate: CombatLabMarkerV1 = {
      ...marker,
      markerId: duplicateId,
      titleRu: `${marker.titleRu} — копия`,
      xMetres: marker.xMetres + 1,
      yMetres: marker.yMetres + 1,
    };
    this.options.draft.addMarker(duplicate);
    this.publish();
    this.select(duplicateId);
    this.message('Копия метки создана.', false);
    return duplicateId;
  }

  remove(markerId: string): void {
    const summary = this.getReferenceSummary(markerId);
    if (summary.references.length > 0) throw new Error(`${summary.messageRu}\nУдаление заблокировано.`);
    this.options.draft.removeMarker(markerId);
    this.publish();
    this.options.selection.select({ kind: 'none' });
    this.message('Метка удалена.', false);
  }

  removeCascade(markerId: string): CombatLabMarkerReferenceSummaryV1 {
    const summary = this.getReferenceSummary(markerId);
    const next = createCombatLabMarkerCascadeResult(this.options.draft.getExperiment(), markerId);
    this.options.draft.replaceExperiment(next);
    this.publish();
    this.options.selection.select({ kind: 'none' });
    this.message('Метка и все зависимые действия удалены.', false);
    return summary;
  }

  beginMove(markerId: string): void {
    this.select(markerId);
    this.options.mapTools.begin('move_marker', { markerId });
  }

  beginResize(markerId: string): void {
    const marker = this.requireMarker(markerId);
    if (marker.kind !== 'circle') throw new Error('Радиус есть только у круглой области.');
    this.select(markerId);
    this.options.mapTools.begin('resize_circle_marker', { markerId });
  }

  cancelActiveEdit(): void {
    this.options.mapTools.cancel();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unregisterMove();
    this.unregisterResize();
    this.options.onPreviewChanged?.(null);
  }

  private createTransaction<TMode extends 'move_marker' | 'resize_circle_marker'>(
    mode: TMode,
    markerId: string,
    transform: (original: CombatLabMarkerV1, pointer: CombatLabMapToolPointerV1) => CombatLabMarkerV1,
  ): CombatLabMapToolTransactionV1 & { readonly mode: TMode } {
    const marker = this.requireMarker(markerId);
    const transaction = new CombatLabMarkerEditTransaction(marker, {
      onPreview: (preview) => this.options.onPreviewChanged?.(preview),
      onClearPreview: () => this.options.onPreviewChanged?.(null),
      onCommit: (next) => this.commitMarker(next),
    }, transform);
    return {
      mode,
      preview: (pointer) => transaction.preview(pointer),
      confirm: () => transaction.confirm(),
      cancel: () => transaction.cancel(),
    };
  }

  private commitMarker(marker: CombatLabMarkerV1): void {
    this.options.draft.updateMarker(marker.markerId, marker);
    this.publish();
    this.select(marker.markerId);
    this.message('Метка обновлена.', false);
  }

  private requireMarker(markerId: string): CombatLabMarkerV1 {
    const marker = this.options.draft.getExperiment().markers.find((candidate) => candidate.markerId === markerId);
    if (!marker) throw new Error(`Метка «${markerId}» не найдена.`);
    return marker;
  }

  private publish(): void {
    this.options.onExperimentChanged(this.options.draft.getExperiment());
  }

  private message(messageRu: string, error: boolean): void {
    this.options.onMessage?.(messageRu, error);
  }
}

function moveMarker(original: CombatLabMarkerV1, pointer: CombatLabMapToolPointerV1): CombatLabMarkerV1 {
  return { ...original, xMetres: finite(pointer.xMetres), yMetres: finite(pointer.yMetres) };
}

function resizeCircleMarker(original: CombatLabMarkerV1, pointer: CombatLabMapToolPointerV1): CombatLabMarkerV1 {
  if (original.kind !== 'circle') return original;
  const dx = pointer.xMetres - original.xMetres;
  const dy = pointer.yMetres - original.yMetres;
  return { ...original, radiusMetres: Math.max(0.1, Math.hypot(dx, dy)) };
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Координата должна быть конечным числом.');
  return value;
}
