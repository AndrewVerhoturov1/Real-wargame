import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';

const OPTIONS: Array<{ posture: UnitPosture; icon: string; label: string }> = [
  { posture: 'standing', icon: '▮', label: 'Стоя' },
  { posture: 'crouched', icon: '▰', label: 'Пригнулся' },
  { posture: 'prone', icon: '━', label: 'Лежит' },
];

export function installPostureControls(debugPanel: HTMLElement, state: SimulationState): void {
  const controls = document.createElement('div');
  controls.className = 'posture-controls';
  controls.style.pointerEvents = 'auto';
  controls.style.display = 'flex';
  controls.style.flexWrap = 'wrap';
  controls.style.gap = '8px';
  controls.style.marginTop = '10px';

  const title = document.createElement('div');
  title.className = 'posture-controls-title';
  title.textContent = 'Положение юнита';
  title.style.flex = '1 0 100%';
  title.style.fontWeight = '700';
  title.style.fontSize = '12px';
  controls.appendChild(title);

  for (const option of OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'posture-button';
    button.textContent = `${option.icon} ${option.label}`;
    button.style.pointerEvents = 'auto';
    button.style.cursor = 'pointer';
    button.addEventListener('click', () => {
      const selectedUnit = getSelectedUnit(state);

      if (!selectedUnit) {
        return;
      }

      selectedUnit.behaviorRuntime.previousPosture = selectedUnit.behaviorRuntime.posture;
      selectedUnit.behaviorRuntime.posture = option.posture;
      selectedUnit.behaviorRuntime.postureChangedBecause = `ручной выбор: ${option.label}`;
      selectedUnit.behaviorRuntime.lastEvent = `ручное положение: ${option.label}`;
      selectedUnit.behaviorRuntime.reason = `положение задано вручную: ${option.label}`;
    });
    controls.appendChild(button);
  }

  const passport = document.createElement('pre');
  passport.className = 'soldier-passport';
  passport.style.margin = '10px 0 0';
  passport.style.padding = '12px';
  passport.style.borderRadius = '10px';
  passport.style.background = 'rgba(255, 242, 168, 0.08)';
  passport.style.color = '#f6edcf';
  passport.style.fontSize = '12px';
  passport.style.lineHeight = '1.45';
  passport.style.whiteSpace = 'pre-wrap';

  debugPanel.insertAdjacentElement('afterend', controls);
  controls.insertAdjacentElement('afterend', passport);
  installRussianInspectorText(debugPanel);
  window.setInterval(() => renderSoldierPassport(passport, state), 250);
}

function renderSoldierPassport(passport: HTMLElement, state: SimulationState): void {
  const unit = getSelectedUnit(state);

  if (!unit) {
    passport.textContent = 'Паспорт солдата: выберите юнита.';
    return;
  }

  const traits = unit.soldier.traits;
  const condition = unit.soldier.condition;

  passport.textContent = [
    'Паспорт солдата:',
    '',
    'Постоянные качества:',
    `Устойчивость: ${traits.resilience}`,
    `Осторожность: ${traits.caution}`,
    `Решительность: ${traits.decisiveness}`,
    `Дисциплина: ${traits.discipline}`,
    `Инициативность: ${traits.initiative}`,
    `Тактика: ${traits.tactics}`,
    `Владение оружием: ${traits.weaponSkill}`,
    '',
    'Текущее состояние:',
    `Усталость: ${condition.fatigue}`,
    `Стресс: ${Math.round(unit.behaviorRuntime.stress)}`,
    `Боевой дух: ${condition.morale}`,
    `Растерянность: ${condition.confusion}`,
    `Здоровье: ${condition.health}`,
    '',
    'Восприятие и движение:',
    `Внимательность: ${condition.attention}`,
    `Обзор: ${condition.view}`,
    `Интуиция: ${condition.intuition}`,
    `Скорость: ${condition.speed}`,
    `Скрытность: ${condition.stealth}`,
  ].join('\n');
}

function installRussianInspectorText(debugPanel: HTMLElement): void {
  const observer = new MutationObserver(() => {
    const current = debugPanel.textContent ?? '';
    const translated = translateInspectorText(current);

    if (translated !== current) {
      debugPanel.textContent = translated;
    }
  });

  observer.observe(debugPanel, { childList: true, characterData: true, subtree: true });
}

function translateInspectorText(text: string): string {
  return text
    .replaceAll('Mouse cell', 'Клетка мыши')
    .replaceAll('Selected', 'Выбрано')
    .replaceAll('Move target', 'Цель движения')
    .replaceAll('Facing', 'Направление')
    .replaceAll('Zoom', 'Масштаб')
    .replaceAll('Map', 'Карта')
    .replaceAll('Behavior inspector: select a unit.', 'Инспектор поведения: выберите юнита.')
    .replaceAll('Behavior inspector', 'Инспектор поведения')
    .replaceAll('Profile', 'Профиль')
    .replaceAll('regular', 'обычный')
    .replaceAll('green', 'новичок')
    .replaceAll('veteran', 'опытный')
    .replaceAll('cautious', 'осторожный')
    .replaceAll('reckless', 'рискованный')
    .replaceAll('State reason', 'Причина состояния')
    .replaceAll('Posture reason', 'Причина положения')
    .replaceAll('Last event', 'Последнее событие')
    .replaceAll('State', 'Состояние')
    .replaceAll('Posture', 'Положение')
    .replaceAll('Action', 'Действие')
    .replaceAll('Danger', 'Опасность')
    .replaceAll('raw', 'исходное')
    .replaceAll('Stress', 'Напряжение')
    .replaceAll('stop', 'порог')
    .replaceAll('Reason', 'Причина')
    .replaceAll('Thresholds', 'Пороги')
    .replaceAll('crouch', 'пригнуться')
    .replaceAll('prone', 'лежит')
    .replaceAll('standing', 'стоя')
    .replaceAll('crouched', 'пригнулся')
    .replaceAll('moving', 'движется')
    .replaceAll('observing', 'наблюдает')
    .replaceAll('stressed', 'напряжён')
    .replaceAll('taking_cover', 'ищет защиту')
    .replaceAll('idle', 'ждёт')
    .replaceAll('move', 'движение')
    .replaceAll('observe', 'наблюдение')
    .replaceAll('waiting', 'ожидание')
    .replaceAll('active move order', 'есть приказ движения')
    .replaceAll('no active move order', 'нет приказа движения')
    .replaceAll('outside pressure zone', 'вне зоны параметров')
    .replaceAll('moving outside pressure zone', 'движение вне зоны параметров')
    .replaceAll('inside pressure zone', 'внутри зоны параметров')
    .replaceAll('target reached', 'цель достигнута')
    .replaceAll('move_done', 'приказ движения выполнен')
    .replaceAll('move_order_received', 'приказ движения получен')
    .replaceAll('none', 'нет')
    .replaceAll('outside map', 'вне карты')
    .replaceAll('prev:', 'было:')
    .replaceAll('Scope: no combat, no AI, no pathfinding.', 'Граница: без боя, без поведения, без поиска пути.')
    .replaceAll('Labels are rendered as HTML, not Pixi text textures.', 'Подписи показаны отдельным слоем.');
}
