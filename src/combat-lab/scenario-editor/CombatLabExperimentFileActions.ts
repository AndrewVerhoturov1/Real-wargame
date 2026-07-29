import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';

export interface CombatLabExperimentIssueV1Like {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly messageRu: string;
  readonly path: string;
}

export interface CombatLabExperimentParseResultV1 {
  readonly experiment: CombatLabExperimentV1 | null;
  readonly issues: readonly CombatLabExperimentIssueV1Like[];
}

export interface CombatLabExperimentFileCodecV1 {
  serialize(experiment: CombatLabExperimentV1): string;
  parse(json: string): CombatLabExperimentParseResultV1;
}

export interface CombatLabExperimentImportResultV1 extends CombatLabExperimentParseResultV1 {
  readonly messageRu: string;
}

export function downloadCombatLabExperiment(
  experiment: CombatLabExperimentV1,
  codec: CombatLabExperimentFileCodecV1,
): void {
  const json = codec.serialize(experiment);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(experiment.experimentId)}.combat-lab.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readCombatLabExperimentFile(
  file: File,
  codec: CombatLabExperimentFileCodecV1,
): Promise<CombatLabExperimentImportResultV1> {
  let textContent: string;
  try {
    textContent = await file.text();
  } catch {
    return {
      experiment: null,
      issues: [{ severity: 'error', code: 'file_read_failed', messageRu: 'Не удалось прочитать выбранный файл.', path: '$' }],
      messageRu: 'Файл эксперимента не прочитан.',
    };
  }

  try {
    const result = codec.parse(textContent);
    const errors = result.issues.filter((issue) => issue.severity === 'error');
    const warnings = result.issues.filter((issue) => issue.severity === 'warning');
    return {
      ...result,
      experiment: errors.length > 0 ? null : result.experiment,
      messageRu: errors.length > 0
        ? `Импорт отклонён: ошибок ${errors.length}. Текущий эксперимент сохранён.`
        : warnings.length > 0
          ? `Эксперимент загружен с предупреждениями: ${warnings.length}.`
          : 'Эксперимент загружен без замечаний.',
    };
  } catch {
    return {
      experiment: null,
      issues: [{ severity: 'error', code: 'unexpected_parser_failure', messageRu: 'Парсер эксперимента завершился с ошибкой.', path: '$' }],
      messageRu: 'Импорт отклонён. Текущий эксперимент сохранён.',
    };
  }
}

export class CombatLabExperimentFileActions {
  readonly root = document.createElement('div');
  private readonly input = document.createElement('input');
  private destroyed = false;

  constructor(
    private readonly codec: CombatLabExperimentFileCodecV1,
    private readonly getExperiment: () => CombatLabExperimentV1,
    private readonly onImported: (experiment: CombatLabExperimentV1, issues: readonly CombatLabExperimentIssueV1Like[]) => void,
    private readonly onMessage: (messageRu: string, issues: readonly CombatLabExperimentIssueV1Like[]) => void,
  ) {
    this.root.className = 'combat-lab-experiment-file-actions';
    const exportButton = button('Экспорт .combat-lab.json', () => {
      try {
        downloadCombatLabExperiment(this.getExperiment(), this.codec);
        this.onMessage('Файл эксперимента подготовлен.', []);
      } catch {
        this.onMessage('Не удалось подготовить файл эксперимента.', [{ severity: 'error', code: 'export_failed', messageRu: 'Ошибка экспорта.', path: '$' }]);
      }
    });
    const importButton = button('Импорт', () => this.input.click());
    this.input.type = 'file';
    this.input.accept = '.combat-lab.json,application/json';
    this.input.hidden = true;
    this.input.addEventListener('change', this.handleImport);
    this.root.append(exportButton, importButton, this.input);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input.removeEventListener('change', this.handleImport);
    this.root.remove();
  }

  private readonly handleImport = async (): Promise<void> => {
    const file = this.input.files?.[0];
    this.input.value = '';
    if (!file) return;
    const result = await readCombatLabExperimentFile(file, this.codec);
    this.onMessage(result.messageRu, result.issues);
    if (result.experiment) this.onImported(result.experiment, result.issues);
  };
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'experiment';
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', onClick);
  return control;
}
