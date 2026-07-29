import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentFileCodecV1 } from './CombatLabExperimentFileActions';

const STORAGE_PREFIX = 'real-wargame.combat-lab.experiment.v1.';
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const MAX_RECENT_EXPERIMENTS = 10;

export interface CombatLabStoredExperimentSummaryV1 {
  readonly experimentId: string;
  readonly titleRu: string;
  readonly revision: number;
  readonly savedAt: string;
}

export interface CombatLabLocalStoreResultV1<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly messageRu: string;
}

export class CombatLabExperimentLocalStore {
  constructor(
    private readonly codec: CombatLabExperimentFileCodecV1,
    private readonly storage: Storage = window.localStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  save(experiment: CombatLabExperimentV1): CombatLabLocalStoreResultV1<CombatLabStoredExperimentSummaryV1> {
    try {
      const savedAt = this.now().toISOString();
      const summary: CombatLabStoredExperimentSummaryV1 = {
        experimentId: experiment.experimentId,
        titleRu: experiment.titleRu,
        revision: experiment.revision,
        savedAt,
      };
      this.storage.setItem(storageKey(experiment.experimentId), this.codec.serialize(experiment));
      const nextIndex = this.readIndexUnsafe().filter((entry) => entry.experimentId !== experiment.experimentId);
      nextIndex.push(summary);
      nextIndex.sort(compareOldestFirst);
      while (nextIndex.length > MAX_RECENT_EXPERIMENTS) {
        const removed = nextIndex.shift()!;
        this.storage.removeItem(storageKey(removed.experimentId));
      }
      this.storage.setItem(INDEX_KEY, JSON.stringify(nextIndex));
      return { ok: true, value: summary, messageRu: 'Эксперимент сохранён в этом браузере.' };
    } catch {
      return { ok: false, value: null, messageRu: 'Браузер не разрешил локальное сохранение. Текущая сессия продолжает работать.' };
    }
  }

  load(experimentId: string): CombatLabLocalStoreResultV1<CombatLabExperimentV1> {
    try {
      const json = this.storage.getItem(storageKey(experimentId));
      if (!json) return { ok: false, value: null, messageRu: 'Сохранённый эксперимент не найден.' };
      const parsed = this.codec.parse(json);
      const errors = parsed.issues.filter((issue) => issue.severity === 'error');
      if (!parsed.experiment || errors.length > 0) {
        return { ok: false, value: null, messageRu: 'Сохранённый эксперимент повреждён или имеет неподдерживаемую версию.' };
      }
      return { ok: true, value: parsed.experiment, messageRu: 'Локальный эксперимент загружен.' };
    } catch {
      return { ok: false, value: null, messageRu: 'Не удалось прочитать локальное сохранение.' };
    }
  }

  remove(experimentId: string): CombatLabLocalStoreResultV1<null> {
    try {
      this.storage.removeItem(storageKey(experimentId));
      const next = this.readIndexUnsafe().filter((entry) => entry.experimentId !== experimentId);
      this.storage.setItem(INDEX_KEY, JSON.stringify(next));
      return { ok: true, value: null, messageRu: 'Локальное сохранение удалено.' };
    } catch {
      return { ok: false, value: null, messageRu: 'Не удалось удалить локальное сохранение.' };
    }
  }

  list(): CombatLabLocalStoreResultV1<readonly CombatLabStoredExperimentSummaryV1[]> {
    try {
      const entries = this.readIndexUnsafe().sort(compareNewestFirst);
      return { ok: true, value: entries, messageRu: entries.length > 0 ? `Локальных экспериментов: ${entries.length}.` : 'Локальных экспериментов пока нет.' };
    } catch {
      return { ok: false, value: null, messageRu: 'Не удалось прочитать список локальных экспериментов.' };
    }
  }

  private readIndexUnsafe(): CombatLabStoredExperimentSummaryV1[] {
    const raw = this.storage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => isSummary(value) ? [value] : []);
  }
}

function storageKey(experimentId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(experimentId)}`;
}

function compareOldestFirst(a: CombatLabStoredExperimentSummaryV1, b: CombatLabStoredExperimentSummaryV1): number {
  return a.savedAt.localeCompare(b.savedAt) || a.experimentId.localeCompare(b.experimentId);
}

function compareNewestFirst(a: CombatLabStoredExperimentSummaryV1, b: CombatLabStoredExperimentSummaryV1): number {
  return b.savedAt.localeCompare(a.savedAt) || a.experimentId.localeCompare(b.experimentId);
}

function isSummary(value: unknown): value is CombatLabStoredExperimentSummaryV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.experimentId === 'string'
    && typeof record.titleRu === 'string'
    && typeof record.revision === 'number'
    && typeof record.savedAt === 'string';
}
