import type { CombatLabMetricId } from '../../core/testing/combat-lab/CombatLabContracts';

export const COMBAT_LAB_METRIC_LABELS_RU: Readonly<Record<CombatLabMetricId, string>> = Object.freeze({
  shotsCommitted: 'Выстрелы',
  roundsConsumed: 'Израсходовано патронов',
  projectilesCreated: 'Создано пуль',
  hits: 'Попадания',
  misses: 'Промахи',
  bodyImpacts: 'Попадания в тело',
  'woundsByZone.head': 'Ранения: голова',
  'woundsByZone.torso': 'Ранения: корпус',
  'woundsByZone.arms': 'Ранения: руки',
  'woundsByZone.legs': 'Ранения: ноги',
  'woundsBySeverity.light': 'Лёгкие ранения',
  'woundsBySeverity.severe': 'Тяжёлые ранения',
  'woundsBySeverity.critical': 'Критические ранения',
  suppressionEvents: 'События подавления',
  maximumSuppression: 'Максимальное подавление',
  actionCompletionSeconds: 'Длительность действия, с',
  reloadCompletionSeconds: 'Длительность перезарядки, с',
  deployCompletionSeconds: 'Длительность установки, с',
  transferRounds: 'Передано патронов',
  bloodLost: 'Потеря крови',
  firstAidStagesCompleted: 'Этапы первой помощи',
  overflowCount: 'Переполнения буферов',
  bufferResizeCount: 'Расширения буферов',
});

export function combatLabMetricLabelRu(metricId: string): string {
  return COMBAT_LAB_METRIC_LABELS_RU[metricId as CombatLabMetricId] ?? 'Неизвестная метрика';
}
