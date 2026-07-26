import { COMBAT_LAB_METRIC_IDS, type CombatLabBuiltScenarioV1, type CombatLabScenarioDefinitionV1, type CombatLabScenarioId } from './CombatLabContracts';
import { buildCombatLabScenarioState } from './CombatLabScenarioFactories';

export const COMBAT_LAB_SCENARIO_IDS = [
  'rifle-distance-baseline',
  'rifle-moving-target',
  'ppsh-burst-recoil',
  'dp27-portable-deployed',
  'dp27-assistant-ammo',
  'wounds-first-aid',
  'suppression-events',
  'combat-save-load-boundaries',
] as const satisfies readonly CombatLabScenarioId[];

const ALL_METRICS = [...COMBAT_LAB_METRIC_IDS];

const definitions: readonly CombatLabScenarioDefinitionV1[] = [
  scenario({
    scenarioId: 'rifle-distance-baseline',
    titleRu: 'Винтовка: дистанции',
    descriptionRu: 'Одиночные выстрелы по неподвижным бойцам на 25, 50, 100 и 200 метрах.',
    category: 'Винтовка',
    defaultSeed: 9041,
    stateFactoryId: 'rifle-distance-v1',
    focusUnitId: 'rifle-distance-shooter',
    roles: [
      role('shooter', 'rifle-distance-shooter', 'Стрелок', ['shooter']),
      role('target-25', 'rifle-target-25', 'Мишень 25 м', ['target']),
      role('target-50', 'rifle-target-50', 'Мишень 50 м', ['target']),
      role('target-100', 'rifle-target-100', 'Мишень 100 м', ['target']),
      role('target-200', 'rifle-target-200', 'Мишень 200 м', ['target']),
    ],
    distances: [25, 50, 100, 200].map((metres) => distance(`Дистанция ${metres} м`, 'rifle-distance-shooter', `rifle-target-${metres}`, metres)),
    manualStepsRu: [
      'Выберите стрелка и одну из четырёх мишеней.',
      'Задайте позу и нажмите «Открыть огонь» в одиночном режиме.',
      'Сравните время прицеливания, полёта, разброс, попадание и расход патрона.',
    ],
    program: [step('rifle-25-shot', 0.1, fire('rifle-distance-shooter', 'rifle-target-25', 'single', 0, 0.65))],
  }),
  scenario({
    scenarioId: 'rifle-moving-target',
    titleRu: 'Винтовка: движущаяся цель',
    descriptionRu: 'Повторяемое физическое движение цели и выстрел по ней после начала маршрута.',
    category: 'Винтовка',
    defaultSeed: 9042,
    stateFactoryId: 'rifle-moving-v1',
    focusUnitId: 'moving-rifle-shooter',
    roles: [
      role('shooter', 'moving-rifle-shooter', 'Стрелок', ['shooter']),
      role('moving-target', 'moving-rifle-target', 'Движущаяся цель', ['target']),
    ],
    distances: [distance('Начальная дистанция', 'moving-rifle-shooter', 'moving-rifle-target', 70)],
    manualStepsRu: [
      'Запустите движение цели по подготовленному маршруту.',
      'Выберите цель явно и откройте одиночный огонь.',
      'Сравните направление сопровождения, упреждение и точку выстрела.',
    ],
    program: [
      step('moving-target-start', 0.1, { kind: 'move', unitId: 'moving-rifle-target', targetGrid: { x: 80, y: 55 } }),
      step('moving-target-shot', 1, fire('moving-rifle-shooter', 'moving-rifle-target', 'single', 0, 0.55)),
    ],
  }),
  scenario({
    scenarioId: 'ppsh-burst-recoil',
    titleRu: 'ППШ: очередь и отдача',
    descriptionRu: 'Три дистанции для проверки темпа, отдельных пуль, отдачи, восстановления и подавления.',
    category: 'Автоматический огонь',
    defaultSeed: 9043,
    stateFactoryId: 'ppsh-recoil-v1',
    focusUnitId: 'ppsh-shooter',
    roles: [
      role('shooter', 'ppsh-shooter', 'Стрелок с ППШ', ['shooter']),
      role('target-15', 'ppsh-target-15', 'Мишень 15 м', ['target']),
      role('target-30', 'ppsh-target-30', 'Мишень 30 м', ['target']),
      role('target-60', 'ppsh-target-60', 'Мишень 60 м', ['target']),
    ],
    distances: [15, 30, 60].map((metres) => distance(`Дистанция ${metres} м`, 'ppsh-shooter', `ppsh-target-${metres}`, metres)),
    manualStepsRu: [
      'Выберите ППШ и мишень на 15, 30 или 60 метрах.',
      'Запустите короткую, затем длинную очередь.',
      'Наблюдайте отдельные пули, рост отдачи, восстановление и расход магазина.',
    ],
    program: [
      step('ppsh-short', 0.1, fire('ppsh-shooter', 'ppsh-target-15', 'short_burst', 0, 0.35)),
      step('ppsh-long', 3, fire('ppsh-shooter', 'ppsh-target-30', 'long_burst', 0, 0.3)),
    ],
  }),
  scenario({
    scenarioId: 'dp27-portable-deployed',
    titleRu: 'ДП-27: переносной и установленный огонь',
    descriptionRu: 'Огонь с рук, установка, якорь, сектор, отказ за сектором, снятие и перезарядка.',
    category: 'Пулемёт',
    defaultSeed: 9044,
    stateFactoryId: 'dp27-deployment-v1',
    focusUnitId: 'dp-portable-gunner',
    roles: [
      role('shooter', 'dp-portable-gunner', 'Пулемётчик', ['shooter']),
      role('target-50', 'dp-portable-target-50', 'Мишень 50 м', ['target']),
      role('target-100', 'dp-portable-target-100', 'Мишень 100 м', ['target']),
      role('target-150', 'dp-portable-target-150', 'Мишень 150 м', ['target']),
      role('outside-sector', 'dp-portable-outside-sector', 'Мишень вне сектора', ['target']),
    ],
    distances: [50, 100, 150].map((metres) => distance(`Дистанция ${metres} м`, 'dp-portable-gunner', `dp-portable-target-${metres}`, metres)),
    manualStepsRu: [
      'Откройте длинный огонь с рук и остановите задачу.',
      'Установите ДП-27 без помощника и повторите огонь.',
      'Проверьте цель внутри и вне сектора, затем снимите пулемёт и перезарядите.',
    ],
    program: [
      step('dp-portable-fire', 0.1, fire('dp-portable-gunner', 'dp-portable-target-50', 'long_burst', 0, 0.25)),
      step('dp-portable-cancel', 2.5, { kind: 'cancel_fire', unitId: 'dp-portable-gunner' }),
      step('dp-deploy', 2.7, { kind: 'deploy', unitId: 'dp-portable-gunner', helperUnitId: null }),
      step('dp-deployed-fire', 4.5, fire('dp-portable-gunner', 'dp-portable-target-100', 'short_burst', 0, 0.4)),
    ],
  }),
  scenario({
    scenarioId: 'dp27-assistant-ammo',
    titleRu: 'ДП-27: помощник и патроны',
    descriptionRu: 'Явный помощник, ускорение действий, потеря помощника и атомарная передача патронов.',
    category: 'Пулемёт',
    defaultSeed: 9045,
    stateFactoryId: 'dp27-assistant-v1',
    focusUnitId: 'dp-assistant-gunner',
    roles: [
      role('shooter', 'dp-assistant-gunner', 'Пулемётчик', ['shooter', 'ammo_target']),
      role('assistant', 'dp-assistant-helper', 'Помощник', ['assistant', 'ammo_source']),
      role('target', 'dp-assistant-target', 'Мишень', ['target']),
    ],
    distances: [
      distance('Помощник', 'dp-assistant-gunner', 'dp-assistant-helper', 1),
      distance('Мишень', 'dp-assistant-gunner', 'dp-assistant-target', 100),
    ],
    manualStepsRu: [
      'Явно выберите помощника и установите пулемёт.',
      'Сравните установку и перезарядку с помощником и без него.',
      'Передайте заданное число патронов и проверьте предел резерва.',
    ],
    program: [
      step('assistant-deploy', 0.1, { kind: 'deploy', unitId: 'dp-assistant-gunner', helperUnitId: 'dp-assistant-helper' }),
      step('assistant-transfer', 2, { kind: 'transfer', sourceUnitId: 'dp-assistant-helper', targetUnitId: 'dp-assistant-gunner', requestedRounds: 30 }),
    ],
  }),
  scenario({
    scenarioId: 'wounds-first-aid',
    titleRu: 'Ранения и медицина',
    descriptionRu: 'Контролируемые ранения четырёх зон, кровопотеря, ограничения и двухстадийная помощь.',
    category: 'Медицина',
    defaultSeed: 9046,
    stateFactoryId: 'wounds-first-aid-v1',
    focusUnitId: 'medical-actor',
    roles: [
      role('medic', 'medical-actor', 'Оказывающий помощь', ['first_aid_actor', 'shooter']),
      role('patient', 'medical-patient', 'Раненый', ['first_aid_target', 'target']),
      role('target', 'medical-fire-target', 'Контрольная мишень', ['target']),
    ],
    distances: [distance('Дистанция помощи', 'medical-actor', 'medical-patient', 1)],
    manualStepsRu: [
      'Выберите раненого и изучите зоны, тяжесть, кровь и capabilities.',
      'Начните первую помощь выбранной зоне или автоматическому приоритету.',
      'Для critical повторите помощь второй раз и убедитесь, что потерянная кровь не восстановилась.',
    ],
    program: [step('first-aid-stage', 0.1, { kind: 'first_aid', actorUnitId: 'medical-actor', targetUnitId: 'medical-patient', zone: null })],
  }),
  scenario({
    scenarioId: 'suppression-events',
    titleRu: 'Подавление',
    descriptionRu: 'Физические near miss, near impact и direct hit, накопление и спад подавления.',
    category: 'Подавление',
    defaultSeed: 9047,
    stateFactoryId: 'suppression-events-v1',
    focusUnitId: 'suppression-shooter',
    roles: [
      role('shooter', 'suppression-shooter', 'Стрелок', ['shooter']),
      role('near-miss', 'suppression-near-miss', 'Цель near miss', ['target']),
      role('near-impact', 'suppression-near-impact', 'Цель near impact', ['target']),
      role('direct-hit', 'suppression-direct-hit', 'Цель direct hit', ['target']),
    ],
    distances: [distance('Центр группы', 'suppression-shooter', 'suppression-near-impact', 45)],
    manualStepsRu: [
      'Выберите автоматическое оружие и точку в группе целей.',
      'Запустите suppress с явным радиусом.',
      'Сравните источники событий, накопление, объединение и спад подавления.',
    ],
    program: [step('suppression-fire', 0.1, fire('suppression-shooter', 'suppression-near-impact', 'suppress', 5, 0.15))],
  }),
  scenario({
    scenarioId: 'combat-save-load-boundaries',
    titleRu: 'Сохранение посреди действия',
    descriptionRu: 'Участники для контрольных точек во время прицеливания, полёта, очереди, установки, перезарядки, передачи и лечения.',
    category: 'Сохранение',
    defaultSeed: 9048,
    stateFactoryId: 'save-load-boundaries-v1',
    focusUnitId: 'save-rifleman',
    roles: [
      role('rifleman', 'save-rifleman', 'Винтовочник', ['shooter', 'first_aid_actor']),
      role('ppsh', 'save-ppsh', 'Стрелок с ППШ', ['shooter']),
      role('gunner', 'save-gunner', 'Пулемётчик', ['shooter', 'ammo_target']),
      role('assistant', 'save-assistant', 'Помощник', ['assistant', 'ammo_source']),
      role('patient', 'save-patient', 'Раненый', ['first_aid_target', 'target']),
      role('target', 'save-target', 'Мишень', ['target']),
    ],
    distances: [distance('Винтовочная цель', 'save-rifleman', 'save-target', 60)],
    manualStepsRu: [
      'Запустите нужное физическое действие и сохраните контрольную точку до его границы.',
      'Продвиньте время, затем восстановите точку.',
      'Убедитесь, что выстрел, пуля, очередь, deploy/reload/transfer/first aid продолжаются ровно один раз.',
    ],
    program: [step('save-rifle-shot', 0.1, fire('save-rifleman', 'save-target', 'single', 0, 0.7))],
  }),
];

const definitionsById = new Map(definitions.map((definition) => [definition.scenarioId, definition]));

export function listCombatLabScenarioDefinitions(): readonly CombatLabScenarioDefinitionV1[] {
  return definitions;
}

export function getCombatLabScenarioDefinition(scenarioId: string): CombatLabScenarioDefinitionV1 {
  const definition = definitionsById.get(scenarioId as CombatLabScenarioId);
  if (!definition) throw new Error(`Unknown Combat Lab scenario: ${scenarioId}`);
  return definition;
}

export function buildCombatLabInitialState(scenarioId: string, revision: number, seed: number): CombatLabBuiltScenarioV1 {
  const definition = getCombatLabScenarioDefinition(scenarioId);
  if (definition.revision !== revision) {
    throw new Error(`Combat Lab scenario revision mismatch for ${scenarioId}: requested ${revision}, available ${definition.revision}.`);
  }
  return buildCombatLabScenarioState(definition, normalizeSeed(seed));
}

function scenario(input: {
  readonly scenarioId: CombatLabScenarioId;
  readonly titleRu: string;
  readonly descriptionRu: string;
  readonly category: string;
  readonly defaultSeed: number;
  readonly stateFactoryId: string;
  readonly focusUnitId: string;
  readonly roles: CombatLabScenarioDefinitionV1['roles'];
  readonly distances: CombatLabScenarioDefinitionV1['controlDistances'];
  readonly manualStepsRu: CombatLabScenarioDefinitionV1['manualStepsRu'];
  readonly program: CombatLabScenarioDefinitionV1['defaultProgram'];
}): CombatLabScenarioDefinitionV1 {
  const definition: CombatLabScenarioDefinitionV1 = {
    schemaVersion: 1,
    scenarioId: input.scenarioId,
    revision: 1,
    titleRu: input.titleRu,
    descriptionRu: input.descriptionRu,
    category: input.category,
    defaultSeed: input.defaultSeed,
    stateFactoryId: input.stateFactoryId,
    defaultStopCondition: { kind: 'program_complete', maximumSimulationSeconds: 16 },
    supportedMetrics: ALL_METRICS,
    visualPreset: {
      schemaVersion: 1,
      recommendedLayerIds: [
        'active_projectiles', 'projectile_trails', 'impacts', 'last_hit_zone', 'aim_direction',
        'target_point', 'dp27_sector', 'dp27_anchor', 'suppression_events', 'distances', 'unit_ids',
      ],
      focusUnitId: input.focusUnitId,
      mapPaddingMetres: 8,
    },
    roles: Object.freeze([...input.roles]),
    controlDistances: Object.freeze([...input.distances]),
    manualStepsRu: Object.freeze([...input.manualStepsRu]),
    defaultProgram: Object.freeze([...input.program]),
  };
  return Object.freeze(definition);
}

function role(roleId: string, unitId: string, titleRu: string, selectableAs: CombatLabScenarioDefinitionV1['roles'][number]['selectableAs']): CombatLabScenarioDefinitionV1['roles'][number] {
  return { roleId, unitId, titleRu, selectableAs };
}
function distance(labelRu: string, fromUnitId: string, toUnitId: string, metres: number) {
  return { labelRu, fromUnitId, toUnitId, metres } as const;
}
function step(stepId: string, atSimulationSeconds: number, command: CombatLabScenarioDefinitionV1['defaultProgram'][number]['command']) {
  return { stepId, atSimulationSeconds, command } as const;
}
function fire(shooterUnitId: string, targetUnitId: string | null, mode: 'single' | 'short_burst' | 'long_burst' | 'suppress', targetRadiusMetres: number, minimumSolutionQuality: number, targetPointMetres: { xMetres: number; yMetres: number; zMetres: number } | null = null) {
  return { kind: 'fire', shooterUnitId, targetUnitId, targetPointMetres, mode, targetRadiusMetres, minimumSolutionQuality } as const;
}
function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}
