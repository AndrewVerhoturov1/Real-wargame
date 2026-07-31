import { listAvailableAiGraphCatalogEntries, addGraphToInstalledCatalog } from '../core/ai/AiGraphCatalog';
import {
  createBehaviorSettings,
  createSoldierParameters,
  type UnitPosture,
} from '../core/behavior/BehaviorModel';
import {
  getGameEditorDrafts,
  resetObjectDraftForKind,
  resetUnitDraftForProfile,
  syncLegacyEditorFields,
  type EditorBrushShape,
  type GameEditorDrafts,
} from '../core/editor/GameEditorDrafts';
import { clearForestLayer, clearHeightLayer } from '../core/map/MapPaint';
import {
  resolveObjectCoverProperties,
  type CoverPosture,
  type MapObject,
  type MapObjectKind,
} from '../core/map/MapModel';
import {
  resolvePressureZoneSettings,
  type PressureZone,
  type PressureZoneMode,
  type PressureZoneShape,
} from '../core/pressure/PressureZone';
import {
  clearEditorScene,
  deleteSelectedEditorTargets,
  getSelectedMapObject,
  getSelectedPressureZone,
  getSelectedUnit,
  type SimulationState,
} from '../core/simulation/SimulationState';
import {
  createUnitManualBrainBinding,
  installUnitAiBrainBinding,
  readUnitAiBrainBinding,
} from '../core/units/UnitAiBrainBinding';
import type { UnitModel } from '../core/units/UnitModel';
import {
  createProductionUnitEditorSection,
  type ProductionUnitEditorAdapterV1,
  type ProductionUnitEditorPatchV1,
  type ProductionUnitEditorSnapshotV1,
} from './ProductionUnitEditor';
import './production-unit-editor.css';

const OBJECT_KIND_OPTIONS: Array<[MapObjectKind, string]> = [
  ['cover', 'Укрытие'], ['structure', 'Здание'], ['ditch', 'Канава'], ['logs', 'Брёвна'],
  ['rock', 'Камень'], ['crates', 'Ящики'], ['fence', 'Забор'], ['tree', 'Дерево'],
  ['post', 'Пост'], ['well', 'Колодец'], ['bridge', 'Мост'],
];
const POSTURE_OPTIONS: Array<[UnitPosture, string]> = [
  ['standing', 'Стоя'], ['crouched', 'Пригнувшись'], ['prone', 'Лёжа'],
];
const SHAPE_OPTIONS: Array<[PressureZoneShape, string]> = [['circle', 'Круг'], ['rect', 'Прямоугольник']];
const THREAT_MODE_OPTIONS: Array<[PressureZoneMode, string]> = [
  ['area', 'Область опасности'], ['directional_fire', 'Направленный огонь'],
];
const BRUSH_SHAPE_OPTIONS: Array<[EditorBrushShape, string]> = [['circle', 'Круглая'], ['square', 'Квадратная']];

type WorkbenchTab = 'object' | 'unit' | 'threat' | 'terrain' | 'scene';

export function installGameEditorWorkbench(
  debugPanel: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
): void {
  const hud = debugPanel.closest<HTMLElement>('#hud');
  if (!hud) return;

  const drafts = getGameEditorDrafts(state);
  syncLegacyEditorFields(state);

  const root = document.createElement('div');
  root.className = 'editor-controls game-editor-workbench';
  const header = document.createElement('div');
  header.className = 'game-editor-header';
  const tabRow = document.createElement('div');
  tabRow.className = 'game-editor-tabs';
  const body = document.createElement('div');
  body.className = 'game-editor-body';
  const status = document.createElement('div');
  status.className = 'game-editor-status';
  const sceneToolsSlot = document.createElement('div');
  sceneToolsSlot.className = 'editor-scene-tools-slot';
  sceneToolsSlot.hidden = true;
  let activeTab: WorkbenchTab = 'object';
  let lastSelectionKey = '';

  const render = () => {
    renderHeader(header, state, onChanged, render);
    renderTabs(tabRow, activeTab, (tab) => {
      activeTab = tab;
      state.editor.tool = 'select';
      state.editor.lastMessage = `Открыта вкладка: ${tabLabel(tab)}. Сначала настрой шаблон, затем включи постановку.`;
      render();
    });
    body.replaceChildren();
    if (activeTab !== 'scene') {
      sceneToolsSlot.hidden = true;
      root.appendChild(sceneToolsSlot);
    }
    if (activeTab === 'object') renderObjectPanel(body, state, drafts, onChanged, render);
    if (activeTab === 'unit') renderUnitPanel(body, state, drafts, onChanged, render);
    if (activeTab === 'threat') renderThreatPanel(body, state, drafts, onChanged, render);
    if (activeTab === 'terrain') renderTerrainPanel(body, state, drafts, onChanged, render);
    if (activeTab === 'scene') renderScenePanel(body, state, onChanged, render, sceneToolsSlot);
    renderStatus(status, state);
  };

  root.append(header, tabRow, body, status, sceneToolsSlot);
  const section = document.createElement('section');
  section.className = 'hud-section editor-section game-editor-section';
  section.append(root);
  hud.appendChild(section);
  render();

  window.setInterval(() => {
    const nextKey = `${state.editor.selectedObjectId ?? ''}|${state.selectedUnitId ?? ''}|${state.editor.selectedZoneId ?? ''}|${state.editor.tool}`;
    if (nextKey !== lastSelectionKey) {
      lastSelectionKey = nextKey;
      render();
    } else {
      renderStatus(status, state);
      refreshHeaderButtons(header, state);
    }
  }, 250);
}

function renderHeader(
  target: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
  rerender: () => void,
): void {
  target.replaceChildren();
  const title = document.createElement('div');
  title.className = 'game-editor-title';
  title.innerHTML = '<strong>Редактор сцены</strong><span>Настрой шаблон → поставь на карту → выбери и исправь</span>';
  const tools = document.createElement('div');
  tools.className = 'game-editor-global-tools';
  tools.append(
    toolButton('Выбрать / двигать', 'select', state, rerender),
    toolButton('Удалять кликом', 'delete', state, rerender),
    actionButton('Удалить выбранное', () => {
      deleteSelectedEditorTargets(state);
      onChanged();
      rerender();
    }, 'danger'),
    actionButton('Вернуться в игру', () => {
      state.editor.enabled = false;
      state.editor.panelOpen = false;
      state.editor.tool = 'select';
      state.editor.lastMessage = 'Редактор закрыт.';
      onChanged();
      rerender();
    }, 'primary'),
  );
  target.append(title, tools);
}

function renderTabs(target: HTMLElement, active: WorkbenchTab, onSelect: (tab: WorkbenchTab) => void): void {
  target.replaceChildren();
  for (const tab of ['object', 'unit', 'threat', 'terrain', 'scene'] as WorkbenchTab[]) {
    const button = actionButton(tabLabel(tab), () => onSelect(tab));
    button.classList.toggle('active', tab === active);
    target.appendChild(button);
  }
}

function renderObjectPanel(
  target: HTMLElement,
  state: SimulationState,
  drafts: GameEditorDrafts,
  onChanged: () => void,
  rerender: () => void,
): void {
  const draft = drafts.object;
  const selected = getSelectedMapObject(state);
  target.append(
    panelHeading('Новый предмет', 'Все свойства задаются до клика по карте. Инструмент постановки остаётся включённым для серии одинаковых предметов.'),
    selectField('Тип', OBJECT_KIND_OPTIONS, draft.kind, (value) => {
      resetObjectDraftForKind(draft, value);
      syncLegacyEditorFields(state);
      rerender();
    }),
    textField('Название', draft.name, (value) => { draft.name = value; }),
    numberField('Ширина, клеток', draft.widthCells, 0.1, 30, 0.1, (value) => { draft.widthCells = value; syncLegacyEditorFields(state); }),
    numberField('Глубина, клеток', draft.heightCells, 0.1, 30, 0.1, (value) => { draft.heightCells = value; syncLegacyEditorFields(state); }),
    numberField('Поворот, градусов', draft.rotationDegrees, -360, 360, 5, (value) => { draft.rotationDegrees = value; syncLegacyEditorFields(state); }),
    numberField('Физическая высота, м', draft.losHeightMeters, 0, 20, 0.1, (value) => { draft.losHeightMeters = value; }),
    groupHeading('Укрытие и видимость'),
    numberField('Защита, 0–100', draft.coverProtection, 0, 100, 1, (value) => { draft.coverProtection = value; }),
    numberField('Маскировка, 0–100', draft.concealment, 0, 100, 1, (value) => { draft.concealment = value; }),
    checkboxField('Простреливаемое', draft.penetrable, (value) => { draft.penetrable = value; }),
    selectField('Какую позу закрывает', POSTURE_OPTIONS, draft.coverPosture, (value) => { draft.coverPosture = value; }),
    buttonRow([
      toolButton('Ставить предмет', 'spawn_object', state, rerender, 'primary'),
      actionButton('Взять параметры выбранного', () => {
        if (!selected) return;
        copyObjectToDraft(selected, draft);
        syncLegacyEditorFields(state);
        rerender();
      }),
      actionButton('Применить к выбранному', () => {
        if (!selected) return;
        applyObjectDraft(selected, draft);
        state.editor.lastMessage = `Параметры применены к предмету: ${selected.id}`;
        onChanged();
        rerender();
      }),
    ]),
    selectedSummary('Выбранный предмет', selected ? `${selected.labels?.ru ?? selected.kind} · ${selected.id}` : 'не выбран'),
  );
}

function renderUnitPanel(
  target: HTMLElement,
  state: SimulationState,
  drafts: GameEditorDrafts,
  onChanged: () => void,
  rerender: () => void,
): void {
  const selected = getSelectedUnit(state);
  const adapter = createGameWorkbenchUnitAdapter(state, drafts, selected, onChanged);
  target.append(
    panelHeading(
      selected ? 'Выбранный боец' : 'Новый боец',
      selected
        ? 'Поля изменяют выбранного бойца напрямую. Это тот же production-редактор, который используется в Combat Lab.'
        : 'Настрой шаблон бойца, затем включи постановку на карту.',
    ),
    createProductionUnitEditorSection(adapter, {
      showTitle: false,
      placementButtons: false,
    }),
    buttonRow([
      toolButton('Ставить бойца', 'spawn_unit', state, rerender, 'primary'),
      actionButton('Взять выбранного как шаблон', () => {
        if (!selected) return;
        copyUnitToDraft(selected, drafts.unit);
        syncLegacyEditorFields(state);
        state.editor.lastMessage = `Шаблон бойца скопирован из ${selected.id}.`;
        rerender();
      }),
      actionButton('Редактировать новый шаблон', () => {
        state.selectedUnitId = null;
        state.editor.lastMessage = 'Редактируется шаблон нового бойца.';
        rerender();
      }),
    ]),
    selectedSummary('Источник данных', selected ? `${selected.labels.ru} · ${selected.id}` : 'шаблон нового бойца'),
  );
}

function createGameWorkbenchUnitAdapter(
  state: SimulationState,
  drafts: GameEditorDrafts,
  selected: UnitModel | null | undefined,
  onChanged: () => void,
): ProductionUnitEditorAdapterV1 {
  return {
    mode: 'live',
    read: () => selected ? snapshotFromLiveUnit(selected) : snapshotFromUnitDraft(drafts.unit),
    update: (patch) => {
      if (selected) applyProductionPatchToLiveUnit(state, selected, patch);
      else applyProductionPatchToDraft(drafts.unit, patch);
      syncLegacyEditorFields(state);
      onChanged();
    },
    listGraphOptions: () => listAvailableAiGraphCatalogEntries().map((entry) => ({
      graphId: entry.graphId,
      titleRu: entry.titleRu,
      graph: entry.graph,
    })),
    listLoadoutOptions: () => {
      const runtime = selected?.infantryCombatRuntime;
      const ref = runtime?.ammoInventory.loadoutRef;
      const weapon = runtime?.primaryWeapon;
      if (!ref || !weapon) return [];
      return [{
        ref,
        titleRu: ref.definitionId,
        weaponTitleRu: weapon.resolved.weapon.nameRu,
        magazineCapacity: weapon.resolved.weapon.capacityRounds,
      }];
    },
    onError: (messageRu) => { state.editor.lastMessage = messageRu; },
  };
}

function snapshotFromLiveUnit(unit: UnitModel): ProductionUnitEditorSnapshotV1 {
  const runtime = unit.infantryCombatRuntime;
  return {
    roleId: null,
    unitId: unit.id,
    titleRu: unit.labels.ru,
    side: unit.side,
    unitType: unit.type,
    x: unit.position.x - 0.5,
    y: unit.position.y - 0.5,
    facingDegrees: radiansToDegrees(unit.facingRadians),
    posture: unit.behaviorRuntime.posture,
    behaviorProfile: unit.behaviorProfile,
    speedCellsPerSecond: unit.speedCellsPerSecond,
    viewAngleDegrees: radiansToDegrees(unit.viewAngleRadians),
    viewRangeCells: unit.viewRangeCells,
    soldierTraits: { ...unit.soldier.traits },
    soldierCondition: { ...unit.soldier.condition },
    stress: unit.behaviorRuntime.stress,
    suppression: unit.behaviorRuntime.suppression,
    loadoutRef: runtime.ammoInventory.loadoutRef ? { ...runtime.ammoInventory.loadoutRef } : null,
    loadedRounds: runtime.primaryWeapon?.roundsInWeapon ?? unit.behaviorRuntime.ammo,
    reserveRoundsByAmmoDefinitionId: Object.fromEntries(runtime.ammoInventory.reserves.map((entry) => [entry.ammoDefinitionId, entry.rounds])),
    firstAidCharges: runtime.medical.firstAidCharges,
    bloodLoss: runtime.physiology.blood.bloodLoss,
    aiBrain: readUnitAiBrainBinding(unit),
  };
}

function snapshotFromUnitDraft(draft: GameEditorDrafts['unit']): ProductionUnitEditorSnapshotV1 {
  return {
    roleId: null,
    unitId: 'new-unit-template',
    titleRu: draft.name,
    side: draft.side,
    unitType: draft.type,
    x: 0,
    y: 0,
    facingDegrees: draft.facingDegrees,
    posture: draft.posture,
    behaviorProfile: draft.profile,
    speedCellsPerSecond: draft.speedCellsPerSecond,
    viewAngleDegrees: draft.viewAngleDegrees,
    viewRangeCells: draft.viewRangeCells,
    soldierTraits: { ...draft.traits },
    soldierCondition: { ...draft.condition },
    stress: draft.stress,
    suppression: draft.suppression,
    loadoutRef: null,
    loadedRounds: draft.ammo,
    reserveRoundsByAmmoDefinitionId: {},
    firstAidCharges: 0,
    bloodLoss: 0,
    aiBrain: createUnitManualBrainBinding(),
  };
}

function applyProductionPatchToDraft(
  draft: GameEditorDrafts['unit'],
  patch: ProductionUnitEditorPatchV1,
): void {
  if (patch.titleRu !== undefined) draft.name = patch.titleRu;
  if (patch.side !== undefined) draft.side = patch.side;
  if (patch.unitType !== undefined) draft.type = patch.unitType;
  if (patch.facingDegrees !== undefined) draft.facingDegrees = patch.facingDegrees;
  if (patch.posture !== undefined) draft.posture = patch.posture;
  if (patch.behaviorProfile !== undefined) resetUnitDraftForProfile(draft, patch.behaviorProfile);
  if (patch.speedCellsPerSecond !== undefined) draft.speedCellsPerSecond = patch.speedCellsPerSecond;
  if (patch.viewAngleDegrees !== undefined) draft.viewAngleDegrees = patch.viewAngleDegrees;
  if (patch.viewRangeCells !== undefined) draft.viewRangeCells = patch.viewRangeCells;
  if (patch.soldierTraits !== undefined) Object.assign(draft.traits, patch.soldierTraits);
  if (patch.soldierCondition !== undefined) Object.assign(draft.condition, patch.soldierCondition);
  if (patch.stress !== undefined) draft.stress = patch.stress;
  if (patch.suppression !== undefined) draft.suppression = patch.suppression;
  if (patch.loadedRounds !== undefined) draft.ammo = Math.round(patch.loadedRounds);
  if (patch.loadoutRef === null) {
    draft.ammo = 0;
    draft.weaponReady = false;
  }
}

function applyProductionPatchToLiveUnit(
  state: SimulationState,
  unit: UnitModel,
  patch: ProductionUnitEditorPatchV1,
): void {
  if (patch.titleRu !== undefined) unit.labels = { en: patch.titleRu || unit.id, ru: patch.titleRu || unit.id };
  if (patch.side !== undefined) unit.side = patch.side;
  if (patch.unitType !== undefined) unit.type = patch.unitType;
  if (patch.x !== undefined || patch.y !== undefined) {
    unit.position = {
      x: (patch.x ?? unit.position.x - 0.5) + 0.5,
      y: (patch.y ?? unit.position.y - 0.5) + 0.5,
    };
  }
  if (patch.facingDegrees !== undefined) unit.facingRadians = degreesToRadians(patch.facingDegrees);
  if (patch.posture !== undefined) {
    unit.behaviorRuntime.posture = patch.posture;
    unit.behaviorRuntime.previousPosture = patch.posture;
  }
  if (patch.behaviorProfile !== undefined) {
    unit.behaviorProfile = patch.behaviorProfile;
    unit.behaviorSettings = createBehaviorSettings(patch.behaviorProfile);
  }
  if (patch.speedCellsPerSecond !== undefined) unit.speedCellsPerSecond = patch.speedCellsPerSecond;
  if (patch.viewAngleDegrees !== undefined) unit.viewAngleRadians = degreesToRadians(patch.viewAngleDegrees);
  if (patch.viewRangeCells !== undefined) unit.viewRangeCells = patch.viewRangeCells;
  if (patch.soldierTraits !== undefined || patch.soldierCondition !== undefined) {
    unit.soldier = createSoldierParameters(unit.behaviorProfile, {
      traits: { ...unit.soldier.traits, ...patch.soldierTraits },
      condition: { ...unit.soldier.condition, ...patch.soldierCondition },
    });
  }
  if (patch.stress !== undefined) unit.behaviorRuntime.stress = patch.stress;
  if (patch.suppression !== undefined) unit.behaviorRuntime.suppression = patch.suppression;
  if (patch.loadedRounds !== undefined) {
    if (unit.infantryCombatRuntime.primaryWeapon) {
      unit.infantryCombatRuntime.primaryWeapon.roundsInWeapon = Math.round(patch.loadedRounds);
    }
    unit.behaviorRuntime.ammo = Math.round(patch.loadedRounds);
  }
  if (patch.reserveRoundsByAmmoDefinitionId !== undefined) {
    for (const entry of unit.infantryCombatRuntime.ammoInventory.reserves) {
      const rounds = patch.reserveRoundsByAmmoDefinitionId[entry.ammoDefinitionId];
      if (rounds !== undefined) entry.rounds = Math.max(0, Math.round(rounds));
    }
  }
  if (patch.firstAidCharges !== undefined) unit.infantryCombatRuntime.medical.firstAidCharges = Math.max(0, Math.round(patch.firstAidCharges));
  if (patch.bloodLoss !== undefined) unit.infantryCombatRuntime.physiology.blood.bloodLoss = Math.max(0, Math.min(1, patch.bloodLoss));
  if (patch.loadoutRef === null) clearLiveUnitLoadout(unit);
  if (patch.aiBrain !== undefined) installUnitAiBrainBinding(unit, patch.aiBrain);
  if (patch.aiGraphDefinition !== undefined) addGraphToInstalledCatalog(state, patch.aiGraphDefinition);
  state.editor.lastMessage = `Параметры бойца ${unit.id} изменены.`;
}

function clearLiveUnitLoadout(unit: UnitModel): void {
  unit.infantryCombatRuntime.primaryWeapon = null;
  unit.infantryCombatRuntime.ammoInventory.loadoutRef = null;
  unit.infantryCombatRuntime.ammoInventory.reserves = [];
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.activeTransfer = null;
  unit.behaviorRuntime.ammo = 0;
  unit.behaviorRuntime.weaponReady = false;
}

function renderThreatPanel(
  target: HTMLElement,
  state: SimulationState,
  drafts: GameEditorDrafts,
  onChanged: () => void,
  rerender: () => void,
): void {
  const draft = drafts.threat;
  const selected = getSelectedPressureZone(state);
  target.append(
    panelHeading('Новая угроза', 'Можно создать обычную область опасности или направленный сектор огня. Красная стрелка показывает направление стрельбы.'),
    textField('Название', draft.name, (value) => { draft.name = value; }),
    selectField('Тип', THREAT_MODE_OPTIONS, draft.mode, (value) => { draft.mode = value; }),
    selectField('Форма области', SHAPE_OPTIONS, draft.shape, (value) => { draft.shape = value; syncLegacyEditorFields(state); }),
    numberField('Радиус круга, клеток', draft.radiusCells, 0.5, 100, 0.5, (value) => { draft.radiusCells = value; syncLegacyEditorFields(state); }),
    numberField('Ширина прямоугольника', draft.widthCells, 0.5, 100, 0.5, (value) => { draft.widthCells = value; syncLegacyEditorFields(state); }),
    numberField('Высота прямоугольника', draft.heightCells, 0.5, 100, 0.5, (value) => { draft.heightCells = value; syncLegacyEditorFields(state); }),
    numberField('Опасность, 0–100', draft.strength, 0, 100, 1, (value) => { draft.strength = value; syncLegacyEditorFields(state); }),
    numberField('Подавление, 0–100', draft.suppression, 0, 100, 1, (value) => { draft.suppression = value; }),
    numberField('Стресс в секунду', draft.stressPerSecond, 0, 100, 1, (value) => { draft.stressPerSecond = value; syncLegacyEditorFields(state); }),
    groupHeading('Направленный огонь'),
    numberField('Направление, °', draft.directionDegrees, 0, 359, 1, (value) => { draft.directionDegrees = value; }),
    numberField('Угол сектора, °', draft.arcDegrees, 1, 360, 1, (value) => { draft.arcDegrees = value; }),
    numberField('Дальность, клеток', draft.rangeCells, 0.5, 100, 0.5, (value) => { draft.rangeCells = value; }),
    numberField('Ближняя граница', draft.minRangeCells, 0, 100, 0.5, (value) => { draft.minRangeCells = value; }),
    numberField('Падение силы к краю, %', draft.falloffPercent, 0, 100, 1, (value) => { draft.falloffPercent = value; }),
    checkboxField('Угроза включена', draft.enabled, (value) => { draft.enabled = value; }),
    checkboxField('Источник виден бойцу', draft.sourceVisible, (value) => { draft.sourceVisible = value; }),
    checkboxField('Источник известен бойцу', draft.sourceKnown, (value) => { draft.sourceKnown = value; }),
    buttonRow([
      toolButton('Ставить угрозу', 'spawn_zone', state, rerender, 'primary'),
      actionButton('Взять параметры выбранной', () => {
        if (!selected) return;
        copyThreatToDraft(selected, draft);
        syncLegacyEditorFields(state);
        rerender();
      }),
      actionButton('Применить к выбранной', () => {
        if (!selected) return;
        applyThreatDraft(selected, draft);
        state.editor.lastMessage = `Параметры применены к угрозе: ${selected.id}`;
        onChanged();
        rerender();
      }),
    ]),
    selectedSummary('Выбранная угроза', selected ? `${selected.labels.ru} · ${selected.id}` : 'не выбрана'),
  );
}

function renderTerrainPanel(
  target: HTMLElement,
  state: SimulationState,
  drafts: GameEditorDrafts,
  onChanged: () => void,
  rerender: () => void,
): void {
  const draft = drafts.terrain;
  target.append(
    panelHeading('Рельеф и слои', 'Сначала выбери форму и размер кисти, затем точное значение слоя. Кисть рисует непрерывно при удержании мыши.'),
    selectField('Форма кисти', BRUSH_SHAPE_OPTIONS, draft.brushShape, (value) => { draft.brushShape = value; syncLegacyEditorFields(state); }),
    numberField('Размер кисти, клеток', draft.brushSizeCells, 1, 30, 1, (value) => { draft.brushSizeCells = value; syncLegacyEditorFields(state); }),
    selectField('Высота', [
      [-2, '-2 глубокая низина'], [-1, '-1 низина'], [0, '0 ровно / стереть'],
      [1, '+1 подъём'], [2, '+2 холм'], [3, '+3 высокая местность'], [4, '+4 вершина'],
    ], draft.heightBrushLevel, (value) => { draft.heightBrushLevel = value; syncLegacyEditorFields(state); }),
    selectField('Лес', [[0, 'Нет леса / стереть'], [1, 'Редкий лес'], [2, 'Густой лес']], draft.forestBrushKind, (value) => {
      draft.forestBrushKind = value;
      syncLegacyEditorFields(state);
    }),
    buttonRow([
      toolButton('Рисовать высоту', 'paint_height', state, rerender, 'primary'),
      toolButton('Рисовать лес', 'paint_forest', state, rerender, 'primary'),
      toolButton('Выбрать объекты', 'select', state, rerender),
    ]),
    buttonRow([
      actionButton('Очистить все высоты', () => {
        if (!window.confirm('Сбросить весь слой высот к нулю?')) return;
        clearHeightLayer(state); onChanged(); rerender();
      }, 'danger'),
      actionButton('Очистить весь лес', () => {
        if (!window.confirm('Удалить весь слой леса?')) return;
        clearForestLayer(state); onChanged(); rerender();
      }, 'danger'),
    ]),
    selectedSummary('Активная кисть', `${draft.brushShape === 'circle' ? 'круг' : 'квадрат'} · ${draft.brushSizeCells} клеток · высота ${formatSigned(draft.heightBrushLevel)} · лес ${draft.forestBrushKind}`),
  );
}

function renderScenePanel(
  target: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
  rerender: () => void,
  sceneToolsSlot: HTMLElement,
): void {
  const layers = document.createElement('div');
  layers.className = 'game-editor-layer-grid';
  layers.append(
    checkboxField('Показывать предметы', state.editor.layers.objects, (value) => { state.editor.layers.objects = value; onChanged(); }),
    checkboxField('Показывать бойцов', state.editor.layers.units, (value) => { state.editor.layers.units = value; onChanged(); }),
    checkboxField('Показывать угрозы', state.editor.layers.pressureZones, (value) => { state.editor.layers.pressureZones = value; onChanged(); }),
  );
  sceneToolsSlot.hidden = false;
  target.append(
    panelHeading('Сцена', 'Видимость слоёв, сохранение, загрузка и очистка всей испытательной сцены.'),
    layers,
    sceneToolsSlot,
    actionButton('Очистить предметы, бойцов и угрозы', () => {
      if (!window.confirm('Полностью очистить сцену? Высоты и лес останутся.')) return;
      clearEditorScene(state);
      onChanged();
      rerender();
    }, 'danger'),
  );
}

function toolButton(
  text: string,
  tool: string,
  state: SimulationState,
  rerender: () => void,
  tone?: string,
): HTMLButtonElement {
  const button = actionButton(text, () => {
    (state.editor as unknown as { tool: string }).tool = tool;
    state.editor.lastMessage = `Инструмент: ${text}.`;
    rerender();
  }, tone);
  button.dataset.editorTool = tool;
  button.classList.toggle('active', String(state.editor.tool) === tool);
  return button;
}

function actionButton(text: string, onClick: () => void, tone?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (tone) button.classList.add(tone);
  button.addEventListener('click', onClick);
  return button;
}

function buttonRow(buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'game-editor-button-row';
  row.append(...buttons);
  return row;
}

function panelHeading(title: string, hint: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'game-editor-panel-heading';
  block.innerHTML = `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(hint)}</p>`;
  return block;
}

function groupHeading(text: string): HTMLElement {
  const title = document.createElement('div');
  title.className = 'game-editor-group-title';
  title.textContent = text;
  return title;
}

function selectedSummary(label: string, value: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'game-editor-selected-summary';
  block.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return block;
}

function textField(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value.trim()));
  return wrapField(label, input);
}

function numberField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(round(value, step));
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = String(next);
    onChange(next);
  });
  return wrapField(label, input);
}

function selectField<T extends string | number>(
  label: string,
  options: Array<[T, string]>,
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = String(optionValue);
    option.textContent = optionLabel;
    select.appendChild(option);
  }
  select.value = String(value);
  let committedValue = select.value;
  const commitSelection = () => {
    if (select.value === committedValue) return;
    committedValue = select.value;
    const matched = options.find(([candidate]) => String(candidate) === select.value)?.[0];
    if (matched !== undefined) onChange(matched);
  };
  select.addEventListener('input', commitSelection);
  select.addEventListener('change', commitSelection);
  return wrapField(label, select);
}

function checkboxField(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const wrapper = wrapField(label, input);
  wrapper.classList.add('checkbox');
  return wrapper;
}

function wrapField(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'game-editor-field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function copyObjectToDraft(object: MapObject, draft: GameEditorDrafts['object']): void {
  const cover = resolveObjectCoverProperties(object);
  Object.assign(draft, {
    name: object.labels?.ru ?? object.id,
    kind: object.kind,
    widthCells: object.widthCells,
    heightCells: object.heightCells,
    rotationDegrees: radiansToDegrees(object.rotationRadians),
    losHeightMeters: object.losHeightMeters ?? 1,
    coverProtection: cover.coverProtection,
    concealment: cover.concealment,
    penetrable: cover.penetrable,
    coverPosture: cover.coverPosture,
  });
}

function applyObjectDraft(object: MapObject, draft: GameEditorDrafts['object']): void {
  object.kind = draft.kind;
  object.labels = { en: draft.name || object.id, ru: draft.name || object.id };
  object.widthCells = draft.widthCells;
  object.heightCells = draft.heightCells;
  object.rotationRadians = degreesToRadians(draft.rotationDegrees);
  object.losHeightMeters = draft.losHeightMeters;
  object.coverProtection = draft.coverProtection;
  object.concealment = draft.concealment;
  object.penetrable = draft.penetrable;
  object.coverPosture = draft.coverPosture;
}

function copyUnitToDraft(unit: UnitModel, draft: GameEditorDrafts['unit']): void {
  Object.assign(draft, {
    name: unit.labels.ru,
    side: unit.side,
    type: unit.type,
    heldItem: unit.heldItem,
    profile: unit.behaviorProfile,
    speedCellsPerSecond: unit.speedCellsPerSecond,
    facingDegrees: radiansToDegrees(unit.facingRadians),
    viewAngleDegrees: radiansToDegrees(unit.viewAngleRadians),
    viewRangeCells: unit.viewRangeCells,
    posture: unit.behaviorRuntime.posture,
    stress: unit.behaviorRuntime.stress,
    suppression: unit.behaviorRuntime.suppression,
    ammo: unit.behaviorRuntime.ammo,
    weaponReady: unit.behaviorRuntime.weaponReady,
    traits: { ...unit.soldier.traits },
    condition: { ...unit.soldier.condition },
  });
}

function copyThreatToDraft(zone: PressureZone, draft: GameEditorDrafts['threat']): void {
  const settings = resolvePressureZoneSettings(zone);
  Object.assign(draft, {
    name: zone.labels.ru,
    shape: zone.shape,
    mode: settings.mode,
    radiusCells: zone.radiusCells,
    widthCells: zone.widthCells,
    heightCells: zone.heightCells,
    strength: zone.strength,
    suppression: settings.suppression,
    stressPerSecond: zone.stressPerSecond,
    directionDegrees: settings.directionDegrees,
    arcDegrees: settings.arcDegrees,
    rangeCells: settings.rangeCells,
    minRangeCells: settings.minRangeCells,
    falloffPercent: settings.falloffPercent,
    enabled: settings.enabled,
    sourceVisible: settings.sourceVisible,
    sourceKnown: settings.sourceKnown,
  });
}

function applyThreatDraft(zone: PressureZone, draft: GameEditorDrafts['threat']): void {
  zone.labels = { en: draft.name || zone.id, ru: draft.name || zone.id };
  zone.shape = draft.shape;
  zone.mode = draft.mode;
  zone.radiusCells = draft.radiusCells;
  zone.widthCells = draft.widthCells;
  zone.heightCells = draft.heightCells;
  zone.strength = draft.strength;
  zone.suppression = draft.suppression;
  zone.stressPerSecond = draft.stressPerSecond;
  zone.directionDegrees = draft.directionDegrees;
  zone.arcDegrees = draft.arcDegrees;
  zone.rangeCells = draft.rangeCells;
  zone.minRangeCells = draft.minRangeCells;
  zone.falloffPercent = draft.falloffPercent;
  zone.enabled = draft.enabled;
  zone.sourceVisible = draft.sourceVisible;
  zone.sourceKnown = draft.sourceKnown;
}

function renderStatus(target: HTMLElement, state: SimulationState): void {
  const selectedObject = getSelectedMapObject(state);
  const selectedUnit = getSelectedUnit(state);
  const selectedThreat = getSelectedPressureZone(state);
  target.innerHTML = [
    `<strong>Инструмент:</strong> ${escapeHtml(toolLabel(String(state.editor.tool)))}`,
    `<span>Предмет: ${escapeHtml(selectedObject?.id ?? '—')}</span>`,
    `<span>Боец: ${escapeHtml(selectedUnit?.id ?? '—')}</span>`,
    `<span>Угроза: ${escapeHtml(selectedThreat?.id ?? '—')}</span>`,
    `<em>${escapeHtml(state.editor.lastMessage)}</em>`,
  ].join('');
}

function refreshHeaderButtons(header: HTMLElement, state: SimulationState): void {
  for (const button of header.querySelectorAll<HTMLButtonElement>('[data-editor-tool]')) {
    button.classList.toggle('active', button.dataset.editorTool === String(state.editor.tool));
  }
}

function tabLabel(tab: WorkbenchTab): string {
  const labels: Record<WorkbenchTab, string> = {
    object: 'Предмет', unit: 'Боец', threat: 'Угроза', terrain: 'Рельеф', scene: 'Сцена',
  };
  return labels[tab];
}

function toolLabel(tool: string): string {
  const labels: Record<string, string> = {
    select: 'выбор и перемещение', delete: 'удаление кликом', spawn_object: 'постановка предмета',
    spawn_unit: 'постановка бойца', spawn_zone: 'постановка угрозы', paint_height: 'кисть высоты',
    paint_forest: 'кисть леса',
  };
  return labels[tool] ?? tool;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function round(value: number, step: number): number {
  return Number(value.toFixed(step < 1 ? 2 : 0));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}