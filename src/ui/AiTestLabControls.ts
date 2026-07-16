import {
  createBehaviorSettings,
  createSoldierParameters,
  createUnitInitialState,
  type BehaviorProfileId,
  type SoldierCondition,
  type SoldierTraits,
  type UnitInitialState,
  type UnitPosture,
} from '../core/behavior/BehaviorModel';
import { evaluateSmallArmsCover } from '../core/cover/SmallArmsCoverEvaluation';
import { buildSoldierAwarenessReport, type SoldierAwarenessMode } from '../core/knowledge/SoldierAwarenessGrid';
import { resolveObjectCoverProperties, type CoverPosture } from '../core/map/MapModel';
import { resolvePressureZoneSettings, type PressureZoneMode, type PressureZoneShape } from '../core/pressure/PressureZone';
import {
  getSelectedMapObject,
  getSelectedPressureZone,
  getSelectedUnit,
  type SimulationState,
} from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import {
  getAiLabRuntime,
  setAiLabOpen,
  setAiLabPanel,
  setAiLabTool,
  setAwarenessMode,
  type AiLabPanel,
  type AiLabTool,
} from '../core/testing/AiLabRuntime';
import {
  AI_TEST_TIME_SCALES,
  getAiTestPaused,
  getAiTestTimeScale,
  refreshAiTestLabSceneSnapshot,
  resetAiTestScene,
  setAiTestPaused,
  setAiTestTimeScale,
} from '../core/testing/AiTestLabRuntime';
import {
  applyInitialStateToRuntime,
  copyRuntimeToInitialState,
  type UnitModel,
} from '../core/units/UnitModel';
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
  ['tactics', 'Тактическая подготовка'],
  ['weaponSkill', 'Владение оружием'],
];
const PERMANENT_CONDITION_FIELDS: Array<[keyof SoldierCondition, string]> = [
  ['attention', 'Внимание'],
  ['view', 'Зрение'],
  ['intuition', 'Интуиция'],
  ['speed', 'Физическая подготовка'],
  ['stealth', 'Скрытность'],
];
const INITIAL_FIELDS: Array<[keyof Pick<UnitInitialState, 'stress' | 'suppression' | 'ammo' | 'fatigue' | 'morale' | 'confusion' | 'health'>, string, number]> = [
  ['stress', 'Начальный стресс', 100],
  ['suppression', 'Начальное подавление', 100],
  ['ammo', 'Начальные патроны', 999],
  ['fatigue', 'Начальная усталость', 100],
  ['morale', 'Начальная мораль', 100],
  ['confusion', 'Начальное замешательство', 100],
  ['health', 'Начальное здоровье', 100],
];
const AWARENESS_MODES: Array<[SoldierAwarenessMode, string]> = [
  ['off', 'Скрыть'],
  ['all', 'Всё'],
  ['danger', 'Угрозы'],
  ['cover', 'Защита'],
  ['safe', 'Безопасные места'],
  ['uncertainty', 'Неопределённость'],
  ['objective', 'Объективная карта'],
];

export function installAiTestLabControls(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): void {
  const runtime = getAiLabRuntime(state);
  const controlsHost = document.querySelector<HTMLElement>('.top-command-controls');
  const launcher = button('Полигон ИИ', () => {
    setAiLabOpen(state, !runtime.open);
    updateOpenState();
    renderAll();
    onChanged();
  }, 'primary ai-lab-toggle');
  const topTools = document.createElement('div');
  topTools.className = 'ai-lab-top-tools';
  const dock = document.createElement('aside');
  dock.className = 'ai-lab-dock';
  const dockTabs = document.createElement('div');
  dockTabs.className = 'ai-lab-dock-tabs';
  const dockBody = document.createElement('div');
  dockBody.className = 'ai-lab-dock-body';
  const diagnostics = document.createElement('pre');
  diagnostics.className = 'ai-lab-diagnostics';
  const bottomBar = document.createElement('div');
  bottomBar.className = 'ai-lab-bottom-bar';
  let selectionKey = '';
  let renderKey = '';

  const updateOpenState = () => {
    document.body.classList.toggle('ai-lab-open', runtime.open);
    dock.hidden = !runtime.open;
    bottomBar.hidden = !runtime.open;
    topTools.hidden = !runtime.open;
    topTools.classList.toggle('open', runtime.open);
  };

  const renderTopTools = () => {
    topTools.replaceChildren();
    launcher.textContent = runtime.open ? 'Закрыть полигон' : 'Полигон ИИ';
    launcher.classList.toggle('active', runtime.open);
    launcher.setAttribute('aria-pressed', String(runtime.open));
    if (!runtime.open) return;
    const tools: Array<[AiLabTool, string, string]> = [
      ['select', 'Выбрать', 'Выбор и перетаскивание объектов'],
      ['place_fighter', 'Разместить бойца', 'Курсор размещения бойца'],
      ['place_threat', 'Разместить угрозу', 'Курсор размещения угрозы'],
      ['place_cover', 'Разместить укрытие', 'Курсор размещения укрытия'],
      ['delete', 'Удалить', 'Удаление щелчком'],
    ];
    for (const [tool, label, title] of tools) {
      const item = button(label, () => {
        setAiLabTool(state, tool);
        renderAll();
      }, runtime.tool === tool ? 'active' : '');
      item.title = title;
      item.dataset.labTool = tool;
      topTools.append(item);
    }
    const knowledge = button('Карта бойца', () => {
      setAiLabPanel(state, 'awareness');
      setAwarenessMode(state, runtime.awarenessMode === 'off' ? 'all' : 'off');
      renderAll();
    }, runtime.awarenessMode !== 'off' ? 'active knowledge' : 'knowledge');
    topTools.append(knowledge);
  };

  const renderDock = () => {
    dockTabs.replaceChildren();
    for (const [panel, label] of [
      ['fighter', 'Боец'],
      ['threat', 'Угроза'],
      ['cover', 'Укрытие'],
      ['awareness', 'Карта бойца'],
    ] as Array<[AiLabPanel, string]>) {
      dockTabs.append(button(label, () => {
        setAiLabPanel(state, panel);
        renderAll();
      }, runtime.activePanel === panel ? 'active' : ''));
    }

    dockBody.replaceChildren();
    if (runtime.activePanel === 'fighter') renderFighterPanel(dockBody, state, onChanged, renderAll);
    if (runtime.activePanel === 'threat') renderThreatPanel(dockBody, state, onChanged, renderAll);
    if (runtime.activePanel === 'cover') renderCoverPanel(dockBody, state, onChanged, renderAll);
    if (runtime.activePanel === 'awareness') renderAwarenessPanel(dockBody, state, renderAll);
    updateDiagnostics(diagnostics, state);
  };

  const renderBottom = () => {
    bottomBar.replaceChildren();
    const pause = button(getAiTestPaused(state) ? 'Продолжить' : 'Пауза', () => {
      setAiTestPaused(state, !getAiTestPaused(state));
      renderAll();
      onChanged();
    }, getAiTestPaused(state) ? 'active' : '');
    bottomBar.append(pause);
    bottomBar.append(button('Один шаг', () => {
      tickSimulation(state, 0.1);
      onChanged();
      updateDiagnostics(diagnostics, state);
    }));
    bottomBar.append(button('Диагностика ИИ (без изменений)', () => {
      aiBridge.evaluateNow();
      onChanged();
      updateDiagnostics(diagnostics, state);
    }));
    bottomBar.append(button('Рассчитать и выполнить', () => {
      tickSimulation(state, 0.1);
      onChanged();
      updateDiagnostics(diagnostics, state);
    }, 'primary'));
    bottomBar.append(button('Сбросить бойца', () => {
      const unit = getSelectedUnit(state);
      if (unit) applyInitialStateToRuntime(unit);
      onChanged();
      updateDiagnostics(diagnostics, state);
    }));
    bottomBar.append(button('Сбросить сцену', () => {
      resetAiTestScene(state);
      renderAll();
      onChanged();
    }));

    const speed = document.createElement('div');
    speed.className = 'ai-lab-speed-row';
    for (const scale of AI_TEST_TIME_SCALES) {
      speed.append(button(`×${scale}`, () => {
        setAiTestTimeScale(state, scale);
        renderAll();
      }, getAiTestTimeScale(state) === scale ? 'active' : ''));
    }
    bottomBar.append(speed);
    const status = document.createElement('span');
    status.className = 'ai-lab-status-line';
    status.textContent = runtime.status;
    bottomBar.append(status);
  };

  const renderAll = () => {
    renderTopTools();
    renderDock();
    renderBottom();
    updateOpenState();
    const currentSelectionKey = `${state.selectedUnitId ?? ''}|${state.editor.selectedZoneId ?? ''}|${state.editor.selectedObjectId ?? ''}`;
    renderKey = buildLabRenderKey(state, runtime, currentSelectionKey);
  };

  const dockHeader = document.createElement('header');
  dockHeader.innerHTML = '<div><strong>Полигон ИИ</strong><span>Личное восприятие бойца</span></div>';
  dockHeader.append(button('×', () => {
    setAiLabOpen(state, false);
    updateOpenState();
    renderAll();
  }, 'icon'));
  dock.append(dockHeader, dockTabs, dockBody, diagnostics);
  if (controlsHost) controlsHost.append(launcher);
  else document.body.append(launcher);
  document.body.append(topTools, dock, bottomBar);
  updateOpenState();
  renderAll();

  window.setInterval(() => {
    const nextSelectionKey = `${state.selectedUnitId ?? ''}|${state.editor.selectedZoneId ?? ''}|${state.editor.selectedObjectId ?? ''}`;
    const nextRenderKey = buildLabRenderKey(state, runtime, nextSelectionKey);
    if (nextSelectionKey !== selectionKey) {
      selectionKey = nextSelectionKey;
      if (state.editor.selectedZoneId) runtime.activePanel = 'threat';
      else if (state.editor.selectedObjectId) runtime.activePanel = 'cover';
      else if (state.selectedUnitId) runtime.activePanel = 'fighter';
    }
    if (nextRenderKey !== renderKey && !isEditingControl()) {
      renderKey = nextRenderKey;
      renderAll();
    }
    if (runtime.open) {
      updateDiagnostics(diagnostics, state);
      updateLiveFighterState(dockBody, state);
    }
  }, 250);
}

function renderFighterPanel(
  target: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
  rerender: () => void,
): void {
  const unit = getSelectedUnit(state);
  target.append(heading('Боец', 'Сначала выберите бойца на карте или нажмите «Разместить бойца».'));
  if (!unit) return;

  target.append(textControl('Имя', unit.labels.ru, (value) => {
    unit.labels.ru = value || unit.id;
    unit.labels.en = value || unit.id;
    onChanged();
  }));
  target.append(sectionTitle('Постоянные характеристики'));
  target.append(selectControl('Профиль', PROFILE_OPTIONS, unit.behaviorProfile, (profile) => {
    const soldier = createSoldierParameters(profile);
    unit.behaviorProfile = profile;
    unit.behaviorSettings = createBehaviorSettings(profile);
    unit.soldier = soldier;
    unit.initialState = createUnitInitialState(soldier);
    applyInitialStateToRuntime(unit);
    onChanged();
    rerender();
  }));
  target.append(numberControl('Базовая скорость, клеток/с', unit.speedCellsPerSecond, 0.05, 1.5, 0.05, (value) => {
    unit.speedCellsPerSecond = value;
    onChanged();
  }));
  target.append(hint(`Текущая базовая скорость: ${(unit.speedCellsPerSecond * state.map.metersPerCell).toFixed(1)} м/с. Поза, усталость и состояние могут её уменьшать.`));
  target.append(numberControl('Дальность обзора, клеток', unit.viewRangeCells, 1, 60, 0.5, (value) => {
    unit.viewRangeCells = value;
    onChanged();
  }));
  target.append(numberControl('Угол обзора, °', radiansToDegrees(unit.viewAngleRadians), 1, 360, 1, (value) => {
    unit.viewAngleRadians = degreesToRadians(value);
    onChanged();
  }));
  for (const [key, label] of TRAIT_FIELDS) {
    target.append(numberControl(label, unit.soldier.traits[key], 0, 100, 1, (value) => {
      unit.soldier.traits[key] = value;
      onChanged();
    }));
  }
  for (const [key, label] of PERMANENT_CONDITION_FIELDS) {
    target.append(numberControl(label, unit.soldier.condition[key], 0, 100, 1, (value) => {
      unit.soldier.condition[key] = value;
      onChanged();
    }));
  }

  target.append(sectionTitle('Начальное состояние'));
  target.append(hint('Эти значения применяются при сбросе бойца. Во время испытания игра их не переписывает.'));
  target.append(selectControl('Начальная поза', POSTURE_OPTIONS, unit.initialState.posture, (value) => {
    unit.initialState.posture = value;
  }));
  for (const [key, label, max] of INITIAL_FIELDS) {
    target.append(numberControl(label, unit.initialState[key], 0, max, 1, (value) => {
      (unit.initialState[key] as number) = key === 'ammo' ? Math.round(value) : value;
    }));
  }
  target.append(checkboxControl('Оружие готово в начале', unit.initialState.weaponReady, (value) => {
    unit.initialState.weaponReady = value;
  }));
  const initialButtons = rowButtons();
  initialButtons.append(
    button('Применить начальное сейчас', () => {
      applyInitialStateToRuntime(unit);
      onChanged();
      rerender();
    }, 'primary'),
    button('Скопировать текущее в начальное', () => {
      copyRuntimeToInitialState(unit);
      onChanged();
      rerender();
    }),
  );
  target.append(initialButtons);

  target.append(sectionTitle('Текущее состояние — изменяется игрой'));
  target.append(readonlyGrid([
    ['Поза', postureLabel(unit.behaviorRuntime.posture)],
    ['Стресс', round(unit.behaviorRuntime.stress)],
    ['Подавление', round(unit.behaviorRuntime.suppression)],
    ['Усталость', round(unit.soldier.condition.fatigue)],
    ['Мораль', round(unit.soldier.condition.morale)],
    ['Замешательство', round(unit.soldier.condition.confusion)],
    ['Здоровье', round(unit.soldier.condition.health)],
    ['Патроны', Math.round(unit.behaviorRuntime.ammo)],
    ['Оружие', unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово'],
    ['Действие', unit.behaviorRuntime.currentAction],
  ], 'ai-lab-current-state'));
}

function renderThreatPanel(
  target: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
  rerender: () => void,
): void {
  const zone = getSelectedPressureZone(state);
  target.append(heading('Угроза', 'Выберите сектор на карте. После выбора появятся ручки направления, дальности, ширины и мёртвой зоны.'));
  if (!zone) return;
  const settings = resolvePressureZoneSettings(zone);

  target.append(textControl('Название', zone.labels.ru, (value) => {
    zone.labels.ru = value || zone.id;
    zone.labels.en = value || zone.id;
    onChanged();
  }));
  target.append(selectControl<PressureZoneMode>('Тип', [
    ['directional_fire', 'Направленный огонь'],
    ['area', 'Область опасности'],
  ], settings.mode, (value) => {
    zone.mode = value;
    onChanged();
    rerender();
  }));
  if (settings.mode === 'area') {
    target.append(selectControl<PressureZoneShape>('Форма', [['circle', 'Круг'], ['rect', 'Прямоугольник']], zone.shape, (value) => {
      zone.shape = value;
      onChanged();
      rerender();
    }));
  }
  target.append(checkboxControl('Включена', settings.enabled, (value) => { zone.enabled = value; onChanged(); }));
  target.append(numberControl('Опасность, 0–100', zone.strength, 0, 100, 1, (value) => { zone.strength = value; onChanged(); }));
  target.append(numberControl('Подавление, 0–100', settings.suppression, 0, 100, 1, (value) => { zone.suppression = value; onChanged(); }));
  target.append(numberControl('Стресс в секунду', zone.stressPerSecond, 0, 100, 1, (value) => { zone.stressPerSecond = value; onChanged(); }));

  target.append(sectionTitle('Геометрия — можно менять ручками на карте'));
  if (settings.mode === 'directional_fire') {
    target.append(numberControl('Направление, °', settings.directionDegrees, 0, 359, 1, (value) => { zone.directionDegrees = value; onChanged(); }));
    target.append(numberControl('Ширина сектора, °', settings.arcDegrees, 2, 360, 1, (value) => { zone.arcDegrees = value; onChanged(); }));
    target.append(numberControl('Дальность, клеток', settings.rangeCells, 0.5, 100, 0.25, (value) => { zone.rangeCells = value; onChanged(); }));
    target.append(numberControl('Мёртвая зона, клеток', settings.minRangeCells, 0, 99, 0.25, (value) => { zone.minRangeCells = Math.min(value, (zone.rangeCells ?? 1) - 0.25); onChanged(); }));
  } else if (zone.shape === 'circle') {
    target.append(numberControl('Радиус, клеток', zone.radiusCells, 0.5, 60, 0.25, (value) => { zone.radiusCells = value; onChanged(); }));
  } else {
    target.append(numberControl('Ширина, клеток', zone.widthCells, 0.5, 80, 0.25, (value) => { zone.widthCells = value; onChanged(); }));
    target.append(numberControl('Длина, клеток', zone.heightCells, 0.5, 80, 0.25, (value) => { zone.heightCells = value; onChanged(); }));
    target.append(numberControl('Поворот, °', zone.rotationDegrees ?? 0, 0, 359, 1, (value) => { zone.rotationDegrees = value; onChanged(); }));
  }

  target.append(sectionTitle('Знание бойца об угрозе'));
  target.append(checkboxControl('Источник виден', settings.sourceVisible, (value) => { zone.sourceVisible = value; onChanged(); }));
  target.append(checkboxControl('Источник известен', settings.sourceKnown, (value) => { zone.sourceKnown = value; onChanged(); }));
  target.append(numberControl('Уверенность, %', zone.knowledgeConfidence ?? 100, 0, 100, 1, (value) => { zone.knowledgeConfidence = value; onChanged(); }));
  target.append(numberControl('Неточность положения, клеток', zone.uncertaintyCells ?? 0.15, 0, 12, 0.1, (value) => { zone.uncertaintyCells = value; onChanged(); }));
  target.append(hint('Это объективная заготовка угрозы. Каждый боец хранит собственную копию знания, которая со временем теряет уверенность и становится менее точной.'));
}

function renderCoverPanel(
  target: HTMLElement,
  state: SimulationState,
  onChanged: () => void,
  rerender: () => void,
): void {
  const object = getSelectedMapObject(state);
  target.append(heading('Укрытие', 'Выберите предмет. Лес и складки рельефа учитываются автоматически и не требуют отдельного объекта.'));
  if (!object) {
    target.append(hint('Сила защиты показывает, насколько хорошо материал останавливает стрелковое оружие. Надёжность показывает вероятность, что геометрия действительно закроет бойца.'));
    return;
  }
  const properties = resolveObjectCoverProperties(object);
  object.coverProtection ??= properties.coverProtection;
  object.coverReliability ??= properties.coverReliability;
  object.concealment ??= properties.concealment;
  object.penetrable ??= properties.penetrable;
  object.coverPosture ??= properties.coverPosture;
  const expected = Math.round(properties.coverProtection * properties.coverReliability / 100);

  target.append(textControl('Название', object.labels?.ru ?? object.kind, (value) => {
    object.labels = { en: value || object.kind, ru: value || object.kind };
    onChanged();
  }));
  target.append(sectionTitle('Стрелковое оружие'));
  target.append(numberControl('Сила защиты, %', properties.coverProtection, 0, 100, 1, (value) => { object.coverProtection = value; onChanged(); rerender(); }));
  target.append(numberControl('Надёжность защиты, %', properties.coverReliability, 0, 100, 1, (value) => { object.coverReliability = value; onChanged(); rerender(); }));
  target.append(readonlyGrid([
    ['Ожидаемая защита', `${expected}% до поправки на угол и позу`],
  ]));
  target.append(numberControl('Маскировка, %', properties.concealment, 0, 100, 1, (value) => { object.concealment = value; onChanged(); }));
  target.append(checkboxControl('Простреливаемое', properties.penetrable, (value) => { object.penetrable = value; onChanged(); }));
  target.append(selectControl<CoverPosture>('Какую позу закрывает', POSTURE_OPTIONS, properties.coverPosture, (value) => { object.coverPosture = value; onChanged(); }));
  target.append(numberControl('Физическая высота, м', object.losHeightMeters ?? 1, 0, 20, 0.1, (value) => { object.losHeightMeters = value; onChanged(); }));
  target.append(hint('Окончательный расчёт зависит от направления огня, размера предмета, положения бойца и его позы. Красная стрелка показывает огонь, зелёная — защищённую сторону.'));

  const unit = getSelectedUnit(state);
  const threat = getSelectedPressureZone(state);
  if (unit && threat) {
    const result = evaluateSmallArmsCover(state.map, { x: threat.x, y: threat.y }, unit.position, unit.behaviorRuntime.posture);
    target.append(sectionTitle('Проверка выбранной ситуации'));
    target.append(readonlyGrid([
      ['Сила', `${result.strength}%`],
      ['Надёжность', `${result.reliability}%`],
      ['Ожидаемая защита', `${result.expectedProtection}%`],
      ['Источник', result.sourceRu],
      ['Маскировка', `${result.concealment}%`],
    ]));
  }
}

function renderAwarenessPanel(target: HTMLElement, state: SimulationState, rerender: () => void): void {
  const unit = getSelectedUnit(state);
  target.append(heading('Карта бойца', 'Это не объективная карта мира, а то, что знает и предполагает выбранный солдат.'));
  if (!unit) return;
  const runtime = getAiLabRuntime(state);
  const modes = document.createElement('div');
  modes.className = 'ai-lab-awareness-modes';
  for (const [mode, label] of AWARENESS_MODES) {
    modes.append(button(label, () => {
      setAwarenessMode(state, mode);
      rerender();
    }, runtime.awarenessMode === mode ? 'active' : ''));
  }
  target.append(modes);

  const report = buildSoldierAwarenessReport(state, unit);
  const best = report.bestSafePositions[0];
  target.append(readonlyGrid([
    ['Опасность здесь', `${report.currentPosition.danger}/100`],
    ['Ожидаемая защита здесь', `${report.currentPosition.expectedProtection}/100`],
    ['Безопасность здесь', `${report.currentPosition.safety}/100`],
    ['Опасность маршрута', `${report.routeDanger}/100`],
    ['Уверенность в угрозе', `${report.threatConfidence}%`],
    ['Лучшая позиция', best ? `${best.score.toFixed(0)} баллов, ${Math.round(best.distanceCells * state.map.metersPerCell)} м` : 'не найдена'],
  ]));
  target.append(sectionTitle('Известные угрозы этого бойца'));
  if (unit.tacticalKnowledge.threats.length === 0) {
    target.append(hint('Пока боец не знает ни об одной угрозе. Запустите симуляцию или сделайте источник видимым/известным.'));
  } else {
    for (const threat of unit.tacticalKnowledge.threats.slice(0, 8)) {
      target.append(readonlyGrid([
        [threat.labelRu, `${Math.round(threat.confidence)}% уверенности`],
        ['Источник знания', threatSourceLabel(threat.source)],
        ['Неточность', `${threat.uncertaintyCells.toFixed(1)} клетки`],
      ], 'compact'));
    }
  }
  target.append(sectionTitle('Условные цвета'));
  target.append(legend());
}

function updateDiagnostics(target: HTMLElement, state: SimulationState): void {
  const runtime = getAiLabRuntime(state);
  const unit = getSelectedUnit(state);
  if (!unit) {
    target.textContent = `Статус: ${runtime.status}\nБоец не выбран.`;
    return;
  }
  const report = buildSoldierAwarenessReport(state, unit);
  const best = report.bestSafePositions[0];
  target.textContent = [
    `Статус: ${runtime.status}`,
    `Боец: ${unit.labels.ru}`,
    `Опасность ${report.currentPosition.danger} · защита ${report.currentPosition.expectedProtection} · безопасность ${report.currentPosition.safety}`,
    `Стресс ${round(unit.behaviorRuntime.stress)} · подавление ${round(unit.behaviorRuntime.suppression)} · мораль ${round(unit.soldier.condition.morale)}`,
    `Знаний об угрозах: ${unit.tacticalKnowledge.threats.length} · уверенность ${report.threatConfidence}%`,
    best ? `Лучшее безопасное место: ${Math.round(best.distanceCells * state.map.metersPerCell)} м, оценка ${best.score.toFixed(0)}` : 'Лучшее безопасное место: нет',
    `Последнее решение ИИ: ${unit.behaviorRuntime.aiGraphReason}`,
  ].join('\n');
}

function updateLiveFighterState(target: HTMLElement, state: SimulationState): void {
  const unit = getSelectedUnit(state);
  const outputs = target.querySelectorAll<HTMLElement>('.ai-lab-current-state b');
  if (!unit || outputs.length === 0) return;
  const values = [
    postureLabel(unit.behaviorRuntime.posture),
    String(round(unit.behaviorRuntime.stress)),
    String(round(unit.behaviorRuntime.suppression)),
    String(round(unit.soldier.condition.fatigue)),
    String(round(unit.soldier.condition.morale)),
    String(round(unit.soldier.condition.confusion)),
    String(round(unit.soldier.condition.health)),
    String(Math.round(unit.behaviorRuntime.ammo)),
    unit.behaviorRuntime.weaponReady ? 'готово' : 'не готово',
    unit.behaviorRuntime.currentAction,
  ];
  outputs.forEach((output, index) => {
    if (values[index] !== undefined) output.textContent = values[index];
  });
}

function heading(title: string, hintText: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-lab-heading';
  const h = document.createElement('h2');
  h.textContent = title;
  wrapper.append(h, hint(hintText));
  return wrapper;
}

function sectionTitle(text: string): HTMLElement {
  const item = document.createElement('h3');
  item.className = 'ai-lab-section-title';
  item.textContent = text;
  return item;
}

function hint(text: string): HTMLElement {
  const item = document.createElement('p');
  item.className = 'ai-lab-hint';
  item.textContent = text;
  return item;
}

function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = text;
  item.className = className;
  item.addEventListener('click', action);
  return item;
}

function textControl(label: string, value: string, action: (value: string) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => action(input.value.trim()));
  return control(label, input);
}

function numberControl(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  action: (value: number) => void,
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(Number(value.toFixed(step < 1 ? 2 : 0)));
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = String(next);
    action(next);
  });
  return control(label, input);
}

function checkboxControl(label: string, value: boolean, action: (value: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => action(input.checked));
  return control(label, input);
}

function selectControl<T extends string>(
  label: string,
  options: Array<[T, string]>,
  value: T,
  action: (value: T) => void,
): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => action(select.value as T));
  return control(label, select);
}

function control(label: string, input: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'ai-lab-control';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, input);
  return wrapper;
}

function readonlyGrid(rows: Array<[string, string | number]>, className = ''): HTMLElement {
  const grid = document.createElement('div');
  grid.className = `ai-lab-readonly-grid ${className}`.trim();
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = label;
    const result = document.createElement('b');
    result.textContent = String(value);
    row.append(name, result);
    grid.append(row);
  }
  return grid;
}

function rowButtons(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ai-lab-button-row';
  return row;
}

function legend(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ai-lab-legend';
  for (const [className, label] of [
    ['danger-high', 'Красный — высокая известная опасность'],
    ['danger-medium', 'Оранжевый — средняя опасность'],
    ['uncertain', 'Жёлтый — неточная или устаревающая угроза'],
    ['safe', 'Зелёный — безопасная позиция'],
    ['concealment', 'Голубой — хорошая маскировка'],
  ]) {
    const row = document.createElement('div');
    const swatch = document.createElement('i');
    swatch.className = className;
    const text = document.createElement('span');
    text.textContent = label;
    row.append(swatch, text);
    root.append(row);
  }
  return root;
}

function postureLabel(value: UnitPosture): string {
  if (value === 'crouched') return 'пригнувшись';
  if (value === 'prone') return 'лёжа';
  return 'стоя';
}

function threatSourceLabel(source: UnitModel['tacticalKnowledge']['threats'][number]['source']): string {
  if (source === 'seen') return 'видел сам';
  if (source === 'heard') return 'услышал';
  if (source === 'fire_pressure') return 'почувствовал огонь';
  return 'получил сообщение';
}

function buildLabRenderKey(
  state: SimulationState,
  runtime: ReturnType<typeof getAiLabRuntime>,
  selectionKey: string,
): string {
  const zone = getSelectedPressureZone(state);
  const object = getSelectedMapObject(state);
  return [
    selectionKey,
    runtime.open,
    runtime.activePanel,
    runtime.tool,
    runtime.awarenessMode,
    zone?.x.toFixed(2) ?? '',
    zone?.y.toFixed(2) ?? '',
    zone?.directionDegrees?.toFixed(1) ?? '',
    zone?.arcDegrees?.toFixed(1) ?? '',
    zone?.rangeCells?.toFixed(2) ?? '',
    zone?.minRangeCells?.toFixed(2) ?? '',
    zone?.radiusCells.toFixed(2) ?? '',
    zone?.widthCells.toFixed(2) ?? '',
    zone?.heightCells.toFixed(2) ?? '',
    zone?.rotationDegrees?.toFixed(1) ?? '',
    object?.coverProtection ?? '',
    object?.coverReliability ?? '',
    object?.concealment ?? '',
  ].join('|');
}

function isEditingControl(): boolean {
  return document.activeElement instanceof HTMLInputElement
    || document.activeElement instanceof HTMLSelectElement
    || document.activeElement instanceof HTMLTextAreaElement;
}

function round(value: number): number {
  return Math.round(value);
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}
