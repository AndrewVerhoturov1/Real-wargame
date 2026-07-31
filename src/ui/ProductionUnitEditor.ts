import type { AiGraph } from '../core/ai/AiGraph';
import type { BehaviorProfileId, SoldierCondition, SoldierTraits, UnitPosture } from '../core/behavior/BehaviorModel';
import type { DefinitionRef } from '../core/infantry-combat/catalogs/CombatCatalogTypes';
import type { UnitAiBrainBindingV1 } from '../core/units/UnitAiBrainBinding';
import type { UnitSide, UnitType } from '../core/units/UnitModel';

export interface ProductionUnitEditorGraphOptionV1 {
  readonly graphId: string;
  readonly titleRu: string;
  readonly graph: AiGraph;
}

export interface ProductionUnitEditorLoadoutOptionV1 {
  readonly ref: DefinitionRef;
  readonly titleRu: string;
  readonly weaponTitleRu: string;
  readonly magazineCapacity: number;
}

export interface ProductionUnitEditorPositionScaleV1 {
  readonly coordinateConvention: 'cell_centre';
  readonly metersPerCell: number;
  toDisplayMetres(storageCells: number): number;
  toStorageCells(displayMetres: number): number;
}

export interface ProductionUnitEditorSnapshotV1 {
  readonly roleId: string | null;
  readonly unitId: string;
  readonly titleRu: string;
  readonly side: UnitSide;
  readonly unitType: UnitType;
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: number;
  readonly posture: UnitPosture;
  readonly behaviorProfile: BehaviorProfileId;
  readonly speedCellsPerSecond: number;
  readonly viewAngleDegrees: number;
  readonly viewRangeCells: number;
  readonly soldierTraits: Readonly<SoldierTraits>;
  readonly soldierCondition: Readonly<SoldierCondition>;
  readonly stress: number;
  readonly suppression: number;
  readonly loadoutRef: DefinitionRef | null;
  readonly loadedRounds: number;
  readonly reserveRoundsByAmmoDefinitionId: Readonly<Record<string, number>>;
  readonly firstAidCharges: number;
  readonly bloodLoss: number;
  readonly aiBrain: UnitAiBrainBindingV1;
}

export interface ProductionUnitEditorPatchV1 {
  readonly titleRu?: string;
  readonly side?: UnitSide;
  readonly unitType?: UnitType;
  readonly x?: number;
  readonly y?: number;
  readonly facingDegrees?: number;
  readonly posture?: UnitPosture;
  readonly behaviorProfile?: BehaviorProfileId;
  readonly speedCellsPerSecond?: number;
  readonly viewAngleDegrees?: number;
  readonly viewRangeCells?: number;
  readonly soldierTraits?: Partial<SoldierTraits>;
  readonly soldierCondition?: Partial<SoldierCondition>;
  readonly stress?: number;
  readonly suppression?: number;
  readonly loadoutRef?: DefinitionRef | null;
  readonly loadedRounds?: number;
  readonly reserveRoundsByAmmoDefinitionId?: Readonly<Record<string, number>>;
  readonly firstAidCharges?: number;
  readonly bloodLoss?: number;
  readonly aiBrain?: UnitAiBrainBindingV1;
  readonly aiGraphDefinition?: AiGraph;
}

export interface ProductionUnitEditorAdapterV1 {
  readonly mode: 'live' | 'experiment_draft' | 'local_dialog_draft';
  readonly positionScale: ProductionUnitEditorPositionScaleV1;
  read(): ProductionUnitEditorSnapshotV1 | null;
  update(patch: ProductionUnitEditorPatchV1): void;
  listGraphOptions(): readonly ProductionUnitEditorGraphOptionV1[];
  listLoadoutOptions?(): readonly ProductionUnitEditorLoadoutOptionV1[];
  beginPlacement?(): void;
  beginFacing?(): void;
  onError?(messageRu: string): void;
}

export interface ProductionUnitEditorSectionOptionsV1 {
  readonly showTitle?: boolean;
  readonly collapsible?: boolean;
  readonly initiallyCollapsed?: boolean;
  readonly placementButtons?: boolean;
}

const SIDE_OPTIONS: ReadonlyArray<readonly [UnitSide, string]> = [['blue', 'Синие'], ['red', 'Красные']];
const TYPE_OPTIONS: ReadonlyArray<readonly [UnitType, string]> = [
  ['infantry_squad', 'Пехотинец'],
  ['scout_team', 'Разведчик'],
  ['support_team', 'Поддержка'],
];
const POSTURE_OPTIONS: ReadonlyArray<readonly [UnitPosture, string]> = [
  ['standing', 'Стоя'],
  ['crouched', 'Пригнувшись'],
  ['prone', 'Лёжа'],
];
const PROFILE_OPTIONS: ReadonlyArray<readonly [BehaviorProfileId, string]> = [
  ['green', 'Новобранец'],
  ['regular', 'Обычный'],
  ['veteran', 'Ветеран'],
  ['cautious', 'Осторожный'],
  ['reckless', 'Безрассудный'],
];
const TRAIT_FIELDS: ReadonlyArray<readonly [keyof SoldierTraits, string]> = [
  ['resilience', 'Стойкость'],
  ['caution', 'Осторожность'],
  ['decisiveness', 'Решительность'],
  ['discipline', 'Дисциплина'],
  ['initiative', 'Инициатива'],
  ['tactics', 'Тактика'],
  ['weaponSkill', 'Владение оружием'],
];
const CONDITION_FIELDS: ReadonlyArray<readonly [keyof SoldierCondition, string]> = [
  ['fatigue', 'Усталость'],
  ['morale', 'Мораль'],
  ['confusion', 'Замешательство'],
  ['health', 'Здоровье'],
  ['attention', 'Внимание'],
  ['view', 'Зрение'],
  ['intuition', 'Интуиция'],
  ['speed', 'Физическая скорость'],
  ['stealth', 'Скрытность'],
];

export function createProductionUnitEditorPositionScale(
  metersPerCell: number,
): ProductionUnitEditorPositionScaleV1 {
  if (!Number.isFinite(metersPerCell) || metersPerCell <= 0) {
    throw new Error('Масштаб карты metersPerCell должен быть больше нуля.');
  }
  return Object.freeze({
    coordinateConvention: 'cell_centre' as const,
    metersPerCell,
    toDisplayMetres: (storageCells: number) => roundThree((storageCells + 0.5) * metersPerCell),
    toStorageCells: (displayMetres: number) => roundThree(displayMetres / metersPerCell - 0.5),
  });
}

export function formatProductionUnitEditorGraphOptionLabel(
  option: Pick<ProductionUnitEditorGraphOptionV1, 'graphId' | 'titleRu'>,
): string {
  return `${option.titleRu} · ${option.graphId}`;
}

export function createProductionUnitEditorSection(
  adapter: ProductionUnitEditorAdapterV1,
  options: ProductionUnitEditorSectionOptionsV1 = {},
): HTMLElement {
  const root = document.createElement(options.collapsible ? 'details' : 'section');
  root.className = 'production-unit-editor';
  if (root instanceof HTMLDetailsElement) root.open = !options.initiallyCollapsed;
  const snapshot = adapter.read();
  if (!snapshot) {
    root.append(empty('Выберите бойца.'));
    return root;
  }

  if (root instanceof HTMLDetailsElement) {
    const summary = document.createElement('summary');
    summary.textContent = `Боец: ${snapshot.titleRu}`;
    root.append(summary);
  } else if (options.showTitle !== false) {
    root.append(heading('Редактор бойца'));
  }

  const report = (action: () => void) => {
    try { action(); }
    catch (error) { adapter.onError?.(error instanceof Error ? error.message : 'Не удалось изменить бойца.'); }
  };
  const apply = (patch: ProductionUnitEditorPatchV1) => report(() => adapter.update(patch));
  const positionScale = adapter.positionScale;

  root.append(
    section('Основное',
      textField('Имя', snapshot.titleRu, (value) => apply({ titleRu: value })),
      selectField('Сторона', SIDE_OPTIONS, snapshot.side, (side) => apply({ side })),
      selectField('Тип', TYPE_OPTIONS, snapshot.unitType, (unitType) => apply({ unitType })),
      selectField('Профиль поведения', PROFILE_OPTIONS, snapshot.behaviorProfile, (behaviorProfile) => apply({ behaviorProfile })),
      selectField('Поза', POSTURE_OPTIONS, snapshot.posture, (posture) => apply({ posture })),
    ),
    section('Размещение',
      numberField('X, м', positionScale.toDisplayMetres(snapshot.x), -1000000, 1000000, 0.1, (xMetres) => apply({
        x: positionScale.toStorageCells(xMetres),
      })),
      numberField('Y, м', positionScale.toDisplayMetres(snapshot.y), -1000000, 1000000, 0.1, (yMetres) => apply({
        y: positionScale.toStorageCells(yMetres),
      })),
      numberField('Направление, °', snapshot.facingDegrees, -3600, 3600, 1, (facingDegrees) => apply({ facingDegrees })),
      options.placementButtons === false ? empty('') : buttonRow(
        actionButton('Поставить на карте', () => adapter.beginPlacement?.()),
        actionButton('Задать направление', () => adapter.beginFacing?.()),
      ),
    ),
    createWeaponSection(adapter, snapshot, apply),
    section('Навыки и восприятие',
      numberField('Скорость, клеток/с', snapshot.speedCellsPerSecond, 0.01, 100, 0.05, (speedCellsPerSecond) => apply({ speedCellsPerSecond })),
      numberField('Угол обзора, °', snapshot.viewAngleDegrees, 1, 360, 1, (viewAngleDegrees) => apply({ viewAngleDegrees })),
      numberField('Дальность обзора, клеток', snapshot.viewRangeCells, 0.1, 10000, 0.5, (viewRangeCells) => apply({ viewRangeCells })),
      numericRecord('Черты бойца', TRAIT_FIELDS, snapshot.soldierTraits, (soldierTraits) => apply({ soldierTraits })),
      numericRecord('Состояние', CONDITION_FIELDS, snapshot.soldierCondition, (soldierCondition) => apply({ soldierCondition })),
    ),
    section('Здоровье и помощь',
      numberField('Здоровье, 0–100', snapshot.soldierCondition.health, 0, 100, 1, (health) => apply({ soldierCondition: { health } })),
      numberField('Потеря крови, 0–1', snapshot.bloodLoss, 0, 1, 0.01, (bloodLoss) => apply({ bloodLoss })),
      numberField('Средства первой помощи', snapshot.firstAidCharges, 0, 999, 1, (firstAidCharges) => apply({ firstAidCharges: Math.round(firstAidCharges) })),
    ),
    section('Тактика',
      numberField('Стресс', snapshot.stress, 0, 100, 1, (stress) => apply({ stress })),
      numberField('Подавление', snapshot.suppression, 0, 100, 1, (suppression) => apply({ suppression })),
      numberField('Тактический навык', snapshot.soldierTraits.tactics, 0, 100, 1, (tactics) => apply({ soldierTraits: { tactics } })),
      numberField('Осторожность', snapshot.soldierTraits.caution, 0, 100, 1, (caution) => apply({ soldierTraits: { caution } })),
    ),
    createBrainSection(adapter, snapshot, apply),
    createTechnicalDetails(snapshot, adapter.mode),
  );
  return root;
}

function createWeaponSection(
  adapter: ProductionUnitEditorAdapterV1,
  snapshot: ProductionUnitEditorSnapshotV1,
  apply: (patch: ProductionUnitEditorPatchV1) => void,
): HTMLElement {
  const loadouts = adapter.listLoadoutOptions?.() ?? [];
  const select = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Без оружия';
  select.append(none);
  for (const entry of loadouts) {
    const option = document.createElement('option');
    option.value = refKey(entry.ref);
    option.textContent = `${entry.titleRu} · ${entry.weaponTitleRu}`;
    select.append(option);
  }
  select.value = snapshot.loadoutRef ? refKey(snapshot.loadoutRef) : '';
  select.addEventListener('change', () => {
    if (!select.value) {
      apply({ loadoutRef: null, loadedRounds: 0, reserveRoundsByAmmoDefinitionId: {} });
      return;
    }
    const selected = loadouts.find((entry) => refKey(entry.ref) === select.value);
    if (selected) apply({ loadoutRef: selected.ref, loadedRounds: Math.min(snapshot.loadedRounds, selected.magazineCapacity) });
  });
  return section('Вооружение и боезапас',
    field('Комплект', select),
    numberField('Патронов в оружии', snapshot.loadedRounds, 0, 999, 1, (loadedRounds) => apply({ loadedRounds: Math.round(loadedRounds) })),
    ...Object.entries(snapshot.reserveRoundsByAmmoDefinitionId).map(([ammoDefinitionId, rounds]) => (
      numberField(`Запас: ${ammoDefinitionId}`, rounds, 0, 100000, 1, (value) => apply({
        reserveRoundsByAmmoDefinitionId: { ...snapshot.reserveRoundsByAmmoDefinitionId, [ammoDefinitionId]: Math.round(value) },
      }))
    )),
  );
}

function createBrainSection(
  adapter: ProductionUnitEditorAdapterV1,
  snapshot: ProductionUnitEditorSnapshotV1,
  apply: (patch: ProductionUnitEditorPatchV1) => void,
): HTMLElement {
  const graphs = adapter.listGraphOptions();
  const mode = document.createElement('select');
  mode.append(new Option('Ручное управление', 'manual'), new Option('Graph v2', 'graph'));
  mode.value = snapshot.aiBrain.kind;
  const graph = document.createElement('select');
  graph.append(new Option('Выберите граф Graph v2', ''));
  for (const entry of graphs) graph.append(new Option(formatProductionUnitEditorGraphOptionLabel(entry), entry.graphId));
  if (snapshot.aiBrain.kind === 'graph') {
    const selectedExists = graphs.some((entry) => entry.graphId === snapshot.aiBrain.graphId);
    if (!selectedExists) {
      const missing = new Option(`Граф не найден · ${snapshot.aiBrain.graphId}`, snapshot.aiBrain.graphId);
      missing.disabled = true;
      graph.append(missing);
    }
    graph.value = snapshot.aiBrain.graphId;
  }
  graph.disabled = mode.value !== 'graph';
  mode.addEventListener('change', () => {
    if (mode.value === 'manual') {
      graph.value = '';
      graph.disabled = true;
      apply({ aiBrain: { schemaVersion: 1, kind: 'manual' } });
      return;
    }
    graph.disabled = false;
    adapter.onError?.('Выберите точный граф Graph v2. Другой граф автоматически не подставляется.');
  });
  graph.addEventListener('change', () => {
    if (mode.value !== 'graph') return;
    const selected = graphs.find((entry) => entry.graphId === graph.value);
    if (!selected) return;
    apply({
      aiBrain: { schemaVersion: 1, kind: 'graph', graphId: selected.graphId },
      aiGraphDefinition: selected.graph,
    });
  });
  return section('Мозг', field('Управление', mode), field('Граф Graph v2', graph));
}

function createTechnicalDetails(
  snapshot: ProductionUnitEditorSnapshotV1,
  mode: ProductionUnitEditorAdapterV1['mode'],
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'production-unit-editor__technical-details';
  details.open = false;
  const summary = document.createElement('summary');
  summary.textContent = 'Технические сведения';
  details.append(
    summary,
    readOnlyField('roleId', snapshot.roleId ?? '—'),
    readOnlyField('unitId', snapshot.unitId),
    readOnlyField('Режим данных', mode),
  );
  return details;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const root = document.createElement('section');
  root.className = 'production-unit-editor__section';
  root.append(heading(title), ...children.filter((child) => child.textContent !== '' || child.children.length > 0));
  return root;
}

function heading(value: string): HTMLElement {
  const result = document.createElement('h3');
  result.className = 'production-unit-editor__heading';
  result.textContent = value;
  return result;
}

function textField(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  return field(label, input);
}

function numberField(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
  });
  return field(label, input);
}

function selectField<T extends string>(label: string, options: ReadonlyArray<readonly [T, string]>, value: T, onChange: (value: T) => void): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) select.append(new Option(optionLabel, optionValue));
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  return field(label, select);
}

function numericRecord<T extends Record<string, number>>(
  title: string,
  fields: ReadonlyArray<readonly [keyof T, string]>,
  values: T,
  onChange: (patch: Partial<T>) => void,
): HTMLElement {
  const details = document.createElement('details');
  details.className = 'production-unit-editor__nested';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary);
  for (const [key, label] of fields) {
    details.append(numberField(label, values[key], 0, 100, 1, (value) => onChange({ [key]: value } as Partial<T>)));
  }
  return details;
}

function readOnlyField(label: string, value: string): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.readOnly = true;
  return field(label, input);
}

function field(label: string, control: HTMLElement): HTMLElement {
  const root = document.createElement('label');
  root.className = 'production-unit-editor__field';
  const caption = document.createElement('span');
  caption.textContent = label;
  root.append(caption, control);
  return root;
}

function buttonRow(...children: HTMLElement[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'production-unit-editor__actions';
  root.append(...children);
  return root;
}

function actionButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function empty(value: string): HTMLElement {
  const result = document.createElement('div');
  result.className = 'production-unit-editor__empty';
  result.textContent = value;
  return result;
}

function refKey(ref: DefinitionRef): string {
  return `${ref.definitionId}@${ref.revision}`;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
