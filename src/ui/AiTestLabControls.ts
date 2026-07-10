import {
  createBehaviorSettings,
  createSoldierParameters,
  type BehaviorProfileId,
  type SoldierCondition,
  type SoldierTraits,
  type UnitPosture,
} from '../core/behavior/BehaviorModel';
import { findBestCoverForThreat } from '../core/cover/CoverEvaluation';
import { resolveObjectCoverProperties, type CoverPosture, type MapObject } from '../core/map/MapModel';
import { resolvePressureZoneSettings, type PressureZone, type PressureZoneMode } from '../core/pressure/PressureZone';
import { evaluateThreatsAtPosition } from '../core/pressure/ThreatEvaluation';
import {
  getSelectedMapObject,
  getSelectedPressureZone,
  getSelectedUnit,
  type SimulationState,
} from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import {
  AI_TEST_TIME_SCALES,
  getAiTestPaused,
  getAiTestTimeScale,
  refreshAiTestLabSceneSnapshot,
  rememberSelectedUnitForTest,
  resetAiTestScene,
  resetSelectedUnitForTest,
  setAiTestPaused,
  setAiTestTimeScale,
} from '../core/testing/AiTestLabRuntime';
import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';

const PROFILE_OPTIONS: Array<[BehaviorProfileId, string]> = [
  ['green', 'Новобранец'],
  ['regular', 'Обычный'],
  ['veteran', 'Ветеран'],
  ['cautious', 'Осторожный'],
  ['reckless', 'Безрассудный'],
];

const POSTURE_OPTIONS: Array<[UnitPosture, string]> = [
  ['standing', 'Стоя'],
  ['crouched', 'Пригнувшись'],
  ['prone', 'Лёжа'],
];

const TRAIT_FIELDS: Array<[keyof SoldierTraits, string]> = [
  ['resilience', 'Стойкость'],
  ['caution', 'Осторожность'],
  ['decisiveness', 'Решительность'],
  ['discipline', 'Дисциплина'],
  ['initiative', 'Инициатива'],
  ['tactics', 'Тактика'],
  ['weaponSkill', 'Владение оружием'],
];

const CONDITION_FIELDS: Array<[keyof SoldierCondition, string]> = [
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

type LabTab = 'fighter' | 'threat' | 'cover' | 'test';

export function installAiTestLabControls(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): void {
  const root = document.createElement('details');
  root.className = 'ai-test-lab';
  root.open = false;

  const summary = document.createElement('summary');
  summary.textContent = 'Полигон ИИ';

  const tabRow = document.createElement('div');
  tabRow.className = 'ai-test-lab-tabs';
  const body = document.createElement('div');
  body.className = 'ai-test-lab-body';
  const diagnostics = document.createElement('pre');
  diagnostics.className = 'ai-test-lab-diagnostics';

  let activeTab: LabTab = 'fighter';
  let selectionKey = '';
  let statusMessage = 'Выберите бойца, угрозу или укрытие на карте.';

  const render = () => {
    body.replaceChildren();
    if (activeTab === 'fighter') renderFighterTab(body, state, onChanged);
    if (activeTab === 'threat') renderThreatTab(body, state, onChanged);
    if (activeTab === 'cover') renderCoverTab(body, state, onChanged);
    if (activeTab === 'test') {
      renderTestTab(body, state, aiBridge, onChanged, () => statusMessage, (value) => {
        statusMessage = value;
        updateDiagnostics(diagnostics, state, statusMessage);
      });
    }
  };

  for (const [id, label] of [
    ['fighter', 'Боец'],
    ['threat', 'Угроза'],
    ['cover', 'Укрытие'],
    ['test', 'Испытание'],
  ] as Array<[LabTab, string]>) {
    const button = createButton(label);
    button.addEventListener('click', () => {
      activeTab = id;
      for (const item of tabRow.querySelectorAll('button')) item.classList.remove('active');
      button.classList.add('active');
      render();
    });
    if (id === activeTab) button.classList.add('active');
    tabRow.appendChild(button);
  }

  root.append(summary, tabRow, body, diagnostics);
  document.body.appendChild(root);
  render();
  updateDiagnostics(diagnostics, state, statusMessage);

  window.setInterval(() => {
    const nextSelectionKey = [
      state.selectedUnitId ?? '',
      state.editor.selectedZoneId ?? '',
      state.editor.selectedObjectId ?? '',
    ].join('|');

    if (nextSelectionKey !== selectionKey) {
      selectionKey = nextSelectionKey;
      rememberSelectedUnitForTest(state);
      render();
    }

    updateDiagnostics(diagnostics, state, statusMessage);
  }, 250);
}

function renderFighterTab(container: HTMLElement, state: SimulationState, onChanged: () => void): void {
  const unit = getSelectedUnit(state);
  if (!unit) {
    container.append(createHint('Выберите бойца на карте. В редакторе карты бойца можно перетащить в нужную точку.'));
    return;
  }

  rememberSelectedUnitForTest(state);
  container.append(createTitle(`${unit.labels.ru} — ${unit.id}`));

  container.append(createTextControl('Имя', unit.labels.ru, (value) => {
    unit.labels.ru = value || unit.id;
    unit.labels.en = value || unit.id;
    onChanged();
  }));

  container.append(createSelectControl('Профиль', PROFILE_OPTIONS, unit.behaviorProfile, (value) => {
    unit.behaviorProfile = value;
    unit.behaviorSettings = createBehaviorSettings(value);
    unit.soldier = createSoldierParameters(value);
    onChanged();
  }));

  container.append(createNumberControl('Скорость, клеток/с', unit.speedCellsPerSecond, 0.1, 1.5, 0.05, (value) => {
    unit.speedCellsPerSecond = value;
    onChanged();
  }));
  container.append(createHint(`При масштабе карты это ${(unit.speedCellsPerSecond * state.map.metersPerCell).toFixed(1)} м/с.`));
  container.append(createNumberControl('Дальность обзора, клеток', unit.viewRangeCells, 1, 50, 0.5, (value) => {
    unit.viewRangeCells = value;
    onChanged();
  }));
  container.append(createNumberControl('Угол обзора, градусов', radiansToDegrees(unit.viewAngleRadians), 1, 360, 1, (value) => {
    unit.viewAngleRadians = degreesToRadians(value);
    onChanged();
  }));
  container.append(createSelectControl('Поза', POSTURE_OPTIONS, unit.behaviorRuntime.posture, (value) => {
    unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.posture = value;
    onChanged();
  }));

  container.append(createGroupTitle('Текущее состояние'));
  container.append(createNumberControl('Стресс', unit.behaviorRuntime.stress, 0, 100, 1, (value) => {
    unit.behaviorRuntime.stress = value;
  }));
  container.append(createNumberControl('Подавление', unit.behaviorRuntime.suppression, 0, 100, 1, (value) => {
    unit.behaviorRuntime.suppression = value;
  }));
  container.append(createNumberControl('Патроны', unit.behaviorRuntime.ammo, 0, 999, 1, (value) => {
    unit.behaviorRuntime.ammo = Math.round(value);
  }));
  container.append(createCheckboxControl('Оружие готово', unit.behaviorRuntime.weaponReady, (value) => {
    unit.behaviorRuntime.weaponReady = value;
  }));

  container.append(createGroupTitle('Черты'));
  for (const [key, label] of TRAIT_FIELDS) {
    container.append(createNumberControl(label, unit.soldier.traits[key], 0, 100, 1, (value) => {
      unit.soldier.traits[key] = value;
    }));
  }

  container.append(createGroupTitle('Состояние бойца'));
  for (const [key, label] of CONDITION_FIELDS) {
    container.append(createNumberControl(label, unit.soldier.condition[key], 0, 100, 1, (value) => {
      unit.soldier.condition[key] = value;
    }));
  }
}

function renderThreatTab(container: HTMLElement, state: SimulationState, onChanged: () => void): void {
  const zone = getSelectedPressureZone(state);
  if (!zone) {
    container.append(createHint('Выберите зону опасности в редакторе карты. Обычную зону можно превратить в направленный огонь.'));
    return;
  }

  const settings = resolvePressureZoneSettings(zone);
  applyResolvedThreatDefaults(zone, settings);
  container.append(createTitle(`${zone.labels.ru} — ${zone.id}`));
  container.append(createSelectControl<PressureZoneMode>('Тип угрозы', [
    ['area', 'Область опасности'],
    ['directional_fire', 'Направленный огонь'],
  ], settings.mode, (value) => {
    zone.mode = value;
    onChanged();
  }));
  container.append(createCheckboxControl('Включена', settings.enabled, (value) => {
    zone.enabled = value;
    onChanged();
  }));
  container.append(createNumberControl('Опасность, 0–100', zone.strength, 0, 100, 1, (value) => {
    zone.strength = value;
    onChanged();
  }));
  container.append(createNumberControl('Подавление, 0–100', settings.suppression, 0, 100, 1, (value) => {
    zone.suppression = value;
    onChanged();
  }));
  container.append(createNumberControl('Стресс в секунду', zone.stressPerSecond, 0, 100, 1, (value) => {
    zone.stressPerSecond = value;
    onChanged();
  }));
  container.append(createNumberControl('Направление, градусов', settings.directionDegrees, 0, 359, 1, (value) => {
    zone.directionDegrees = value;
    onChanged();
  }));
  container.append(createNumberControl('Угол сектора, градусов', settings.arcDegrees, 1, 360, 1, (value) => {
    zone.arcDegrees = value;
    onChanged();
  }));
  container.append(createNumberControl('Дальность, клеток', settings.rangeCells, 0.5, 100, 0.5, (value) => {
    zone.rangeCells = value;
    onChanged();
  }));
  container.append(createNumberControl('Ближняя граница, клеток', settings.minRangeCells, 0, 100, 0.5, (value) => {
    zone.minRangeCells = value;
    onChanged();
  }));
  container.append(createNumberControl('Падение силы к краю, %', settings.falloffPercent, 0, 100, 1, (value) => {
    zone.falloffPercent = value;
    onChanged();
  }));
  container.append(createCheckboxControl('Источник виден бойцу', settings.sourceVisible, (value) => {
    zone.sourceVisible = value;
  }));
  container.append(createCheckboxControl('Источник известен бойцу', settings.sourceKnown, (value) => {
    zone.sourceKnown = value;
  }));
}

function renderCoverTab(container: HTMLElement, state: SimulationState, onChanged: () => void): void {
  const object = getSelectedMapObject(state);
  if (!object) {
    container.append(createHint('Выберите предмет на карте. Защита действует только когда предмет находится между угрозой и бойцом.'));
    return;
  }

  const properties = resolveObjectCoverProperties(object);
  applyResolvedCoverDefaults(object, properties);
  container.append(createTitle(`${object.labels?.ru ?? object.kind} — ${object.id}`));
  container.append(createNumberControl('Физическая защита, 0–100', properties.coverProtection, 0, 100, 1, (value) => {
    object.coverProtection = value;
    onChanged();
  }));
  container.append(createNumberControl('Маскировка, 0–100', properties.concealment, 0, 100, 1, (value) => {
    object.concealment = value;
    onChanged();
  }));
  container.append(createCheckboxControl('Простреливаемое', properties.penetrable, (value) => {
    object.penetrable = value;
    onChanged();
  }));
  container.append(createSelectControl<CoverPosture>('Какую позу закрывает', POSTURE_OPTIONS, properties.coverPosture, (value) => {
    object.coverPosture = value;
    onChanged();
  }));
  container.append(createNumberControl('Физическая высота, м', object.losHeightMeters ?? 1, 0, 20, 0.1, (value) => {
    object.losHeightMeters = value;
    onChanged();
  }));
}

function renderTestTab(
  container: HTMLElement,
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
  getStatus: () => string,
  setStatus: (value: string) => void,
): void {
  container.append(createTitle('Управление испытанием'));

  const speedRow = document.createElement('div');
  speedRow.className = 'ai-test-lab-speed-row';
  for (const scale of AI_TEST_TIME_SCALES) {
    const button = createButton(`×${scale}`);
    button.classList.toggle('active', getAiTestTimeScale(state) === scale);
    button.addEventListener('click', () => {
      setAiTestTimeScale(state, scale);
      setStatus(`Скорость симуляции: ×${scale}`);
      renderTestTabAgain(container, state, aiBridge, onChanged, getStatus, setStatus);
    });
    speedRow.appendChild(button);
  }
  container.append(speedRow);

  const pauseButton = createButton(getAiTestPaused(state) ? 'Продолжить' : 'Пауза');
  pauseButton.addEventListener('click', () => {
    setAiTestPaused(state, !getAiTestPaused(state));
    setStatus(getAiTestPaused(state) ? 'Симуляция остановлена.' : 'Симуляция продолжена.');
    onChanged();
    renderTestTabAgain(container, state, aiBridge, onChanged, getStatus, setStatus);
  });

  const evaluateButton = createButton('Один расчёт ИИ');
  evaluateButton.addEventListener('click', () => {
    const result = aiBridge.evaluateNow();
    setStatus(result ? `Предварительное решение: ${result.explanationRu ?? result.explanation}` : 'Выберите бойца.');
    onChanged();
  });

  const applyButton = createButton('Рассчитать и выполнить');
  applyButton.addEventListener('click', () => {
    const result = aiBridge.tickNow();
    setStatus(result ? `Решение применено: ${result.explanationRu ?? result.explanation}` : 'Выберите бойца.');
    onChanged();
  });

  const stepButton = createButton('Один шаг симуляции');
  stepButton.addEventListener('click', () => {
    tickSimulation(state, 0.1);
    setStatus(`Выполнен шаг 0,1 с при скорости ×${getAiTestTimeScale(state)}.`);
    onChanged();
  });

  const resetUnitButton = createButton('Сбросить бойца');
  resetUnitButton.addEventListener('click', () => {
    setStatus(resetSelectedUnitForTest(state) ? 'Выбранный боец возвращён в исходное состояние.' : 'Выберите бойца.');
    onChanged();
  });

  const resetSceneButton = createButton('Сбросить всю сцену');
  resetSceneButton.addEventListener('click', () => {
    resetAiTestScene(state);
    setStatus('Сцена возвращена к исходному состоянию запуска.');
    onChanged();
  });

  const setBaselineButton = createButton('Запомнить сцену как исходную');
  setBaselineButton.addEventListener('click', () => {
    refreshAiTestLabSceneSnapshot(state);
    setStatus('Текущее состояние сцены сохранено как точка сброса.');
  });

  container.append(
    pauseButton,
    evaluateButton,
    applyButton,
    stepButton,
    resetUnitButton,
    resetSceneButton,
    setBaselineButton,
    createHint(getStatus()),
  );
}

function renderTestTabAgain(
  container: HTMLElement,
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
  getStatus: () => string,
  setStatus: (value: string) => void,
): void {
  container.replaceChildren();
  renderTestTab(container, state, aiBridge, onChanged, getStatus, setStatus);
}

function updateDiagnostics(target: HTMLElement, state: SimulationState, status: string): void {
  const unit = getSelectedUnit(state);
  if (!unit) {
    target.textContent = `Статус: ${status}\nБоец не выбран.`;
    return;
  }

  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const cover = findBestCoverForThreat(
    state.map,
    unit.position,
    threats.targetPosition,
    unit.behaviorRuntime.posture,
  );
  const strongest = threats.strongest;
  const lines = [
    `Статус: ${status}`,
    `Боец: ${unit.labels.ru}`,
    `Скорость: ${(unit.speedCellsPerSecond * state.map.metersPerCell).toFixed(1)} м/с | время ×${getAiTestTimeScale(state)}`,
    `Опасность: ${threats.danger} | подавление: ${threats.suppression} | стресс: ${Math.round(unit.behaviorRuntime.stress)}`,
    `Патроны: ${unit.behaviorRuntime.ammo} | оружие: ${unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово'}`,
    strongest
      ? `Главная угроза: ${strongest.zone.labels.ru}, ${Math.round(strongest.distanceCells * state.map.metersPerCell)} м, защита ${strongest.coverProtection}`
      : 'Главная угроза: нет',
    cover.position
      ? `Лучшее укрытие: ${cover.object?.labels?.ru ?? cover.object?.kind ?? 'объект'}, ${Math.round(cover.distanceCells * state.map.metersPerCell)} м, защита ${cover.protection}`
      : 'Лучшее укрытие: нет',
    `Последнее решение: ${unit.behaviorRuntime.aiGraphReason}`,
  ];
  target.textContent = lines.join('\n');
}

function applyResolvedThreatDefaults(zone: PressureZone, settings: ReturnType<typeof resolvePressureZoneSettings>): void {
  zone.mode ??= settings.mode;
  zone.suppression ??= settings.suppression;
  zone.directionDegrees ??= settings.directionDegrees;
  zone.arcDegrees ??= settings.arcDegrees;
  zone.rangeCells ??= settings.rangeCells;
  zone.minRangeCells ??= settings.minRangeCells;
  zone.falloffPercent ??= settings.falloffPercent;
  zone.enabled ??= settings.enabled;
  zone.sourceVisible ??= settings.sourceVisible;
  zone.sourceKnown ??= settings.sourceKnown;
}

function applyResolvedCoverDefaults(object: MapObject, properties: ReturnType<typeof resolveObjectCoverProperties>): void {
  object.coverProtection ??= properties.coverProtection;
  object.concealment ??= properties.concealment;
  object.penetrable ??= properties.penetrable;
  object.coverPosture ??= properties.coverPosture;
}

function createTitle(text: string): HTMLElement {
  const title = document.createElement('h3');
  title.textContent = text;
  return title;
}

function createGroupTitle(text: string): HTMLElement {
  const title = document.createElement('div');
  title.className = 'ai-test-lab-group-title';
  title.textContent = text;
  return title;
}

function createHint(text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'ai-test-lab-hint';
  hint.textContent = text;
  return hint;
}

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  return button;
}

function createTextControl(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value.trim()));
  return wrapControl(label, input);
}

function createNumberControl(
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
  return wrapControl(label, input);
}

function createCheckboxControl(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return wrapControl(label, input);
}

function createSelectControl<T extends string>(
  label: string,
  options: Array<[T, string]>,
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.appendChild(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  return wrapControl(label, select);
}

function wrapControl(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'ai-test-lab-control';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function round(value: number, step: number): number {
  const digits = step < 1 ? 2 : 0;
  return Number(value.toFixed(digits));
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
