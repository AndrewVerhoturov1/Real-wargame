import {
  prepareCombatLabExperimentEnvelopeOpen,
  serializeCombatLabExperimentEnvelope,
  type CombatLabExperimentEnvelopeV1,
} from './CombatLabExperimentEnvelope';

export interface CombatLabExperimentEnvelopeFileReadResultV1 {
  readonly envelope: CombatLabExperimentEnvelopeV1 | null;
  readonly messageRu: string;
  readonly errorCode: string | null;
}

export function downloadCombatLabExperimentEnvelope(envelope: CombatLabExperimentEnvelopeV1): void {
  const json = serializeCombatLabExperimentEnvelope(envelope);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(envelope.experiment.experimentId)}.polygon-experiment.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readCombatLabExperimentEnvelopeFile(
  file: File,
): Promise<CombatLabExperimentEnvelopeFileReadResultV1> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return Object.freeze({
      envelope: null,
      messageRu: 'Не удалось прочитать файл полного эксперимента. Текущий эксперимент не изменён.',
      errorCode: 'file_read_failed',
    });
  }

  try {
    const envelope = prepareCombatLabExperimentEnvelopeOpen(text);
    return Object.freeze({
      envelope,
      messageRu: 'Полный эксперимент проверен и готов к открытию.',
      errorCode: null,
    });
  } catch (error) {
    return Object.freeze({
      envelope: null,
      messageRu: `Открытие отклонено. Текущий эксперимент не изменён: ${error instanceof Error ? error.message : String(error)}`,
      errorCode: 'envelope_validation_failed',
    });
  }
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'experiment';
}
