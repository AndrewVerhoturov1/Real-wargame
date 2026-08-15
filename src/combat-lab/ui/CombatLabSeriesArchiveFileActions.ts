import {
  parseCombatLabSeriesArchive,
  serializeCombatLabSeriesArchive,
  type CombatLabSeriesArchiveV1,
} from '../../core/testing/combat-lab';

export interface CombatLabSeriesArchiveFileReadResultV1 {
  readonly archive: CombatLabSeriesArchiveV1 | null;
  readonly messageRu: string;
  readonly errorCode: string | null;
}

export function downloadCombatLabSeriesArchive(archive: CombatLabSeriesArchiveV1): void {
  const json = serializeCombatLabSeriesArchive(archive);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(archive.series.seriesId)}.combat-lab-series.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readCombatLabSeriesArchiveFile(
  file: File,
): Promise<CombatLabSeriesArchiveFileReadResultV1> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return Object.freeze({
      archive: null,
      messageRu: 'Не удалось прочитать файл Серии.',
      errorCode: 'file_read_failed',
    });
  }
  try {
    const archive = parseCombatLabSeriesArchive(text);
    return Object.freeze({
      archive,
      messageRu: `Серия ${archive.series.seriesId} проверена и готова к открытию.`,
      errorCode: null,
    });
  } catch (error) {
    return Object.freeze({
      archive: null,
      messageRu: `Файл Серии отклонён: ${error instanceof Error ? error.message : String(error)}`,
      errorCode: 'archive_validation_failed',
    });
  }
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'series';
}
